import { prisma } from "@/common/prisma";
import { ActivityAction, LeadStatus, Prisma, Role } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/common/errors/AppError";
import { logActivity } from "@/modules/activities/activities.service";

const OPEN_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "ON_HOLD",
];

/** A lead untouched this long gets automatically redistributed to someone else, not just flagged. */
const STALE_REASSIGN_DAYS = 5;

/** A rep's "keep this one for myself" pin lasts this long, then the lead auto-returns to the normal pool. */
const PIN_DURATION_DAYS = 30;

/** Matches leads that are NOT currently pinned by their owner — i.e. eligible for capacity
 *  counting and stale-lead reassignment. A pin older than PIN_DURATION_DAYS no longer counts. */
function notCurrentlyPinned(now: Date): Prisma.LeadWhereInput {
  const pinExpiry = new Date(now.getTime() - PIN_DURATION_DAYS * 86_400_000);
  return { OR: [{ ownerPinnedAt: null }, { ownerPinnedAt: { lt: pinExpiry } }] };
}

/**
 * All lead-owner assignment flows funnel through this service. Adding a new strategy
 * (e.g. AI-recommended assignment) later means adding one method here, not touching
 * routes/controllers.
 */
export class AssignmentService {
  /** Directly assign a lead to a specific user (manual, single or as part of bulk). */
  async assignManual(leadId: string, ownerId: string, actorId: string) {
    const [lead, owner] = await Promise.all([
      prisma.lead.findUnique({ where: { id: leadId } }),
      prisma.user.findUnique({ where: { id: ownerId } }),
    ]);
    if (!lead) throw new NotFoundError("Lead");
    if (!owner || !owner.isActive) throw new ValidationError("Owner must be an active user");

    const updated = await prisma.lead.update({ where: { id: leadId }, data: { ownerId } });

    await logActivity({
      leadId,
      userId: actorId,
      action: lead.ownerId ? ActivityAction.REASSIGNED : ActivityAction.ASSIGNED,
      notes: `Assigned to ${owner.name} (${owner.employeeId})`,
    });

    return updated;
  }

  async assignBulk(leadIds: string[], ownerId: string, actorId: string) {
    const results = [];
    for (const leadId of leadIds) {
      results.push(await this.assignManual(leadId, ownerId, actorId));
    }
    return results;
  }

  /**
   * Owner marks a lead "I'm working this myself" (or clears that mark). Pinned leads are
   * skipped by both the stale-lead auto-reassignment sweep and the owner's capacity count
   * for 30 days — after that it silently rejoins the normal pool with no separate expiry job.
   */
  async setPinned(leadId: string, pinned: boolean) {
    return prisma.lead.update({
      where: { id: leadId },
      data: { ownerPinnedAt: pinned ? new Date() : null },
    });
  }

  /**
   * Auto-assigns a lead based on its service's AssignmentRule (service -> team), then
   * picks an owner within that team via capacity-aware round robin. Falls back to leaving
   * it unassigned if no rule matches or the team has no active executives.
   */
  async autoAssign(leadId: string, actorId?: string) {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) throw new NotFoundError("Lead");
    if (!lead.serviceId) return lead;

    const rule = await prisma.assignmentRule.findUnique({ where: { serviceId: lead.serviceId } });
    if (!rule) return lead;

    const owner = await this.nextRoundRobinUser(rule.teamId);
    if (!owner) return lead;

    const updated = await prisma.lead.update({ where: { id: leadId }, data: { ownerId: owner.id } });

    await logActivity({
      leadId,
      userId: actorId ?? null,
      action: ActivityAction.ASSIGNED,
      notes: `Auto-assigned to ${owner.name} (${owner.employeeId}) via service routing rule`,
    });

    return updated;
  }

  /**
   * Called after a lead moves to a closed status (Won/Lost) — that lead just stopped
   * counting toward its owner's capacity, so if they're now under capacity and there's a
   * backlog of unassigned leads waiting, hand them one automatically instead of leaving
   * it sitting unassigned until someone notices. Keeps reps continuously fed without an
   * admin having to manually redistribute every time someone closes something out.
   */
  async backfillIfCapacityFreed(ownerId: string, actorId?: string) {
    const owner = await prisma.user.findUnique({ where: { id: ownerId } });
    if (!owner || !owner.isActive || !owner.teamId) return;

    const now = new Date();
    const openCount = await prisma.lead.count({
      where: { ownerId, status: { in: OPEN_STATUSES }, ...notCurrentlyPinned(now) },
    });
    if (openCount >= owner.leadCapacity) return;

    // Prefer an unassigned lead whose service routes to this rep's team; fall back to any
    // unassigned lead if none match (better than leaving a rep idle over a routing gap).
    const rulesForTeam = await prisma.assignmentRule.findMany({ where: { teamId: owner.teamId } });
    const serviceIds = rulesForTeam.map((r) => r.serviceId);

    const nextLead =
      (serviceIds.length > 0
        ? await prisma.lead.findFirst({
            where: { ownerId: null, serviceId: { in: serviceIds } },
            orderBy: { createdAt: "asc" },
          })
        : null) ?? (await prisma.lead.findFirst({ where: { ownerId: null }, orderBy: { createdAt: "asc" } }));

    if (!nextLead) return;

    await prisma.lead.update({ where: { id: nextLead.id }, data: { ownerId } });
    await logActivity({
      leadId: nextLead.id,
      userId: actorId ?? null,
      action: ActivityAction.ASSIGNED,
      notes: `Auto-assigned to ${owner.name} (${owner.employeeId}) — capacity freed up`,
    });
  }

  /**
   * Rotates through active executives of a team, skipping anyone at/over their
   * leadCapacity (open, non-Won/Lost, non-pinned lead count) so round-robin doesn't keep
   * piling onto someone already overloaded. If everyone's at capacity, falls back to
   * whoever has the fewest open leads rather than leaving the lead unassigned — a team
   * generally over capacity should show up as an alert for the Founder/Manager to act on
   * (more hires, rebalance capacities), not silently stall new leads.
   */
  private async nextRoundRobinUser(teamId: string, excludeUserId?: string) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return null;

    const executives = await prisma.user.findMany({
      where: { teamId, role: Role.EXECUTIVE, isActive: true, ...(excludeUserId ? { id: { not: excludeUserId } } : {}) },
      orderBy: { employeeId: "asc" },
    });
    if (executives.length === 0) return null;

    const now = new Date();
    const loadCounts = await prisma.lead.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: executives.map((e) => e.id) }, status: { in: OPEN_STATUSES }, ...notCurrentlyPinned(now) },
      _count: { _all: true },
    });
    const loadByUserId = new Map(loadCounts.map((l) => [l.ownerId as string, l._count._all]));

    const underCapacity = executives.filter((e) => (loadByUserId.get(e.id) ?? 0) < e.leadCapacity);
    const pool = underCapacity.length > 0 ? underCapacity : executives;

    if (underCapacity.length === 0) {
      // Whole team is at/over capacity — pick the least-loaded rather than stall the lead.
      pool.sort((a, b) => (loadByUserId.get(a.id) ?? 0) - (loadByUserId.get(b.id) ?? 0));
      return pool[0];
    }

    const nextIdx = team.lastAssignedIdx % pool.length;
    await prisma.team.update({ where: { id: teamId }, data: { lastAssignedIdx: nextIdx + 1 } });
    return pool[nextIdx];
  }

  /**
   * Redistributes leads nobody's touched in STALE_REASSIGN_DAYS+ to someone else on the
   * same team, instead of just flagging them for a human to reassign by hand. Leads the
   * owner has pinned ("I'm working this myself") are skipped for up to 30 days. This is
   * what actually stops old leads from rotting while new ones flow to whoever's already
   * active — the alert system tells you it happened, but doesn't wait for you to act on it.
   * Runs on-demand (piggybacked on the alerts check) rather than a cron job.
   */
  async reassignStaleLeads(): Promise<{ reassignedCount: number }> {
    const now = new Date();
    const threshold = new Date(now.getTime() - STALE_REASSIGN_DAYS * 86_400_000);

    const staleLeads = await prisma.lead.findMany({
      where: {
        ownerId: { not: null },
        status: { in: OPEN_STATUSES },
        updatedAt: { lt: threshold },
        ...notCurrentlyPinned(now),
      },
      select: {
        id: true,
        serviceId: true,
        ownerId: true,
        owner: { select: { teamId: true } },
      },
    });

    let reassignedCount = 0;

    for (const lead of staleLeads) {
      const previousOwnerId = lead.ownerId!;

      let teamId: string | null = lead.owner?.teamId ?? null;
      if (lead.serviceId) {
        const rule = await prisma.assignmentRule.findUnique({ where: { serviceId: lead.serviceId } });
        if (rule) teamId = rule.teamId;
      }
      if (!teamId) continue;

      const newOwner = await this.nextRoundRobinUser(teamId, previousOwnerId);
      if (!newOwner || newOwner.id === previousOwnerId) continue;

      await prisma.lead.update({ where: { id: lead.id }, data: { ownerId: newOwner.id } });
      await logActivity({
        leadId: lead.id,
        userId: null,
        action: ActivityAction.REASSIGNED,
        notes: `Auto-reassigned to ${newOwner.name} (${newOwner.employeeId}) after ${STALE_REASSIGN_DAYS}+ days of inactivity`,
      });
      reassignedCount++;
    }

    return { reassignedCount };
  }
}

export const assignmentService = new AssignmentService();
