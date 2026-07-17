import { ActivityAction, Prisma, Role } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { NotFoundError } from "@/common/errors/AppError";
import { logActivity } from "@/modules/activities/activities.service";
import { assignmentService } from "@/modules/assignment/assignment.service";
import { AuthUser } from "@/common/middleware/auth";
import { CreateLeadInput, ListLeadsQuery, UpdateLeadInput } from "./leads.schemas";

export class LeadsService {
  /** Executives are hard-scoped to their own leads at the query level, not just in the UI. */
  private scopeFor(user: AuthUser): Prisma.LeadWhereInput {
    if (user.role === Role.EXECUTIVE) {
      return { ownerId: user.id };
    }
    return {};
  }

  async list(user: AuthUser, query: ListLeadsQuery) {
    const where: Prisma.LeadWhereInput = {
      ...this.scopeFor(user),
      ...(query.status ? { status: query.status } : {}),
      ...(query.priority ? { priority: query.priority } : {}),
      ...(query.ownerId ? { ownerId: query.ownerId } : {}),
      ...(query.serviceId ? { serviceId: query.serviceId } : {}),
      ...(query.sourceId ? { sourceId: query.sourceId } : {}),
      ...(query.state ? { state: query.state } : {}),
      ...(query.unassigned ? { ownerId: null } : {}),
      ...(query.createdFrom || query.createdTo
        ? {
            createdAt: {
              ...(query.createdFrom ? { gte: query.createdFrom } : {}),
              // Treat createdTo as inclusive of that whole day, not just midnight.
              ...(query.createdTo ? { lte: new Date(query.createdTo.getTime() + 86_400_000 - 1) } : {}),
            },
          }
        : {}),
      ...(query.search
        ? {
            OR: [
              { companyName: { contains: query.search, mode: "insensitive" } },
              { contactPerson: { contains: query.search, mode: "insensitive" } },
              { phone: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
              { id: { equals: query.search } },
              { owner: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.lead.findMany({
        where,
        include: {
          owner: { select: { id: true, name: true, employeeId: true } },
          service: true,
          source: true,
        },
        orderBy: { [query.sortBy]: query.sortDir },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.lead.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async getById(user: AuthUser, id: string) {
    const lead = await prisma.lead.findFirst({
      where: { id, ...this.scopeFor(user) },
      include: {
        owner: { select: { id: true, name: true, employeeId: true } },
        service: true,
        source: true,
        createdBy: { select: { id: true, name: true, employeeId: true } },
      },
    });
    if (!lead) throw new NotFoundError("Lead");
    return lead;
  }

  async create(user: AuthUser, input: CreateLeadInput) {
    const lead = await prisma.lead.create({
      data: { ...input, createdById: user.id },
    });

    await logActivity({ leadId: lead.id, userId: user.id, action: ActivityAction.CREATED });

    if (!lead.ownerId) {
      return assignmentService.autoAssign(lead.id, user.id);
    }
    return lead;
  }

  async update(user: AuthUser, id: string, input: UpdateLeadInput) {
    const existing = await this.getById(user, id);

    // First time this lead moves off NEW is its "first contacted" moment — the response-time
    // metric (assignment/creation to first contact) is measured from here, set once and never
    // overwritten by later status changes.
    const data: UpdateLeadInput & { firstContactedAt?: Date } = { ...input };
    if (input.status && input.status !== "NEW" && existing.status === "NEW" && !existing.firstContactedAt) {
      data.firstContactedAt = new Date();
    }

    const updated = await prisma.lead.update({ where: { id }, data });

    if (input.status && input.status !== existing.status) {
      await logActivity({
        leadId: id,
        userId: user.id,
        action: ActivityAction.STATUS_CHANGED,
        notes: `${existing.status} -> ${input.status}`,
      });

      // Closing a lead out frees a slot in the owner's capacity — hand them a fresh
      // unassigned lead right away instead of waiting for them to notice they're idle.
      const justClosed = (input.status === "WON" || input.status === "LOST") && updated.ownerId;
      if (justClosed) {
        await assignmentService.backfillIfCapacityFreed(updated.ownerId!, user.id);
      }
    } else {
      await logActivity({ leadId: id, userId: user.id, action: ActivityAction.FIELD_UPDATED });
    }

    return updated;
  }

  /** Owner marks "I'm working this myself" (or clears it) — see AssignmentService.setPinned. */
  async setPinned(user: AuthUser, id: string, pinned: boolean) {
    await this.getById(user, id); // enforces RBAC scope + existence
    return assignmentService.setPinned(id, pinned);
  }

  async delete(id: string) {
    await prisma.lead.delete({ where: { id } });
  }

  /** Deduped "opened this lead today" signal — powers the "profiles opened" activity metric. */
  async logView(user: AuthUser, leadId: string) {
    const today = new Date();
    const viewDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());

    await prisma.leadView.upsert({
      where: { leadId_userId_viewDate: { leadId, userId: user.id, viewDate } },
      update: {},
      create: { leadId, userId: user.id, viewDate },
    });
  }

  /**
   * Records that a call happened on this lead — outcome-tagged, not real telephony.
   * A no-answer/voicemail/"call back later" isn't a dead lead, just one that needs
   * another attempt — the rep's own chosen follow-up date always wins (they know when
   * the person asked to be called back); if they don't give one, it auto-queues for
   * tomorrow as a safety net so it doesn't silently fall through the cracks. Same rep
   * retries first — only the stale-lead sweep redistributes it, and only if nobody
   * follows up on that date either. A real conversation (Connected) or a bad number don't
   * get an auto follow-up — those need a conscious next step from the rep, not a blind date.
   */
  async logCall(user: AuthUser, id: string, outcome: string, note?: string, explicitNextFollowUp?: Date) {
    const lead = await this.getById(user, id); // enforces RBAC scope + existence
    await logActivity({
      leadId: id,
      userId: user.id,
      action: ActivityAction.CALLED,
      notes: note ? `${outcome}: ${note}` : outcome,
    });

    const data: { lastContactAt: Date; nextFollowUp?: Date } = { lastContactAt: new Date() };
    const needsRetry = outcome === "NO_ANSWER" || outcome === "VOICEMAIL" || outcome === "CALL_BACK_LATER";

    if (explicitNextFollowUp) {
      data.nextFollowUp = explicitNextFollowUp;
    } else if (needsRetry) {
      const alreadyQueuedSooner = lead.nextFollowUp && new Date(lead.nextFollowUp) <= new Date(Date.now() + 86_400_000);
      if (!alreadyQueuedSooner) data.nextFollowUp = new Date(Date.now() + 86_400_000);
    }

    await prisma.lead.update({ where: { id }, data });
  }
}

export const leadsService = new LeadsService();
