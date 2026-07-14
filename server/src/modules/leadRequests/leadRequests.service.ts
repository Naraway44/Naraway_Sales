import { prisma } from "@/common/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/common/errors/AppError";
import { assignmentService } from "@/modules/assignment/assignment.service";
import { OPEN_STATUSES } from "@/modules/assignment/assignment.service";

export class LeadRequestsService {
  /**
   * A rep asking for more leads once they've worked through their current book. Eligible
   * only if every open lead they hold has been attempted at least once (a real call
   * logged) — this is the "all my leads are updated, given rejections and no pickups"
   * bar the Founder set: not that every lead is closed, just that none are sitting
   * completely untouched.
   */
  async create(userId: string, note?: string | null) {
    const existingPending = await prisma.leadRequest.findFirst({ where: { userId, status: "PENDING" } });
    if (existingPending) throw new ConflictError("You already have a pending request awaiting approval");

    const openLeads = await prisma.lead.findMany({
      where: { ownerId: userId, status: { in: OPEN_STATUSES } },
      select: { id: true },
    });

    if (openLeads.length > 0) {
      const openLeadIds = openLeads.map((l) => l.id);
      const attempted = await prisma.leadActivity.groupBy({
        by: ["leadId"],
        where: { leadId: { in: openLeadIds }, action: "CALLED" },
      });
      const attemptedIds = new Set(attempted.map((a) => a.leadId));
      const untouchedCount = openLeadIds.filter((id) => !attemptedIds.has(id)).length;

      if (untouchedCount > 0) {
        throw new ValidationError(
          `You still have ${untouchedCount} lead(s) with no call attempt logged yet — work through those first.`
        );
      }
    }

    return prisma.leadRequest.create({ data: { userId, note } });
  }

  /** Pending requests for Founder/Manager to review, oldest first. */
  async listPending() {
    return prisma.leadRequest.findMany({
      where: { status: "PENDING" },
      include: { user: { select: { id: true, name: true, employeeId: true, team: true } } },
      orderBy: { requestedAt: "asc" },
    });
  }

  async resolve(requestId: string, approve: boolean, actorId: string) {
    const request = await prisma.leadRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new NotFoundError("Lead request");
    if (request.status !== "PENDING") throw new ValidationError("This request has already been resolved");

    const updated = await prisma.leadRequest.update({
      where: { id: requestId },
      data: { status: approve ? "APPROVED" : "DENIED", resolvedAt: new Date(), resolvedById: actorId },
    });

    let assignedCount = 0;
    if (approve) {
      const result = await assignmentService.topUpToCapacity(request.userId, actorId);
      assignedCount = result.assignedCount;
    }

    return { request: updated, assignedCount };
  }
}

export const leadRequestsService = new LeadRequestsService();
