import { prisma } from "@/common/prisma";
import { ConflictError, NotFoundError, ValidationError } from "@/common/errors/AppError";
import { assignmentService } from "@/modules/assignment/assignment.service";
import { OPEN_STATUSES } from "@/modules/assignment/assignment.service";

// A request sitting unapproved this long is treated as "owner isn't around right now"
// rather than "owner is deliberately withholding" — low-risk enough to auto-approve since
// eligibility (no untouched leads) is re-checked at approval time, not just at request time.
const AUTO_APPROVE_AFTER_HOURS = 4;

// Caps how many requests the sweep will auto-approve per calendar day, org-wide — so a
// long owner absence (vacation, week off) drains the unassigned pool gradually and visibly
// (each one shows up as an alert) instead of silently emptying it in one sweep.
const DAILY_AUTO_APPROVE_CAP = 5;

/** Number of this rep's open leads that have never had a call attempt logged against them. */
async function countUntouchedOpenLeads(userId: string): Promise<number> {
  const openLeads = await prisma.lead.findMany({
    where: { ownerId: userId, status: { in: OPEN_STATUSES } },
    select: { id: true },
  });
  if (openLeads.length === 0) return 0;

  const openLeadIds = openLeads.map((l) => l.id);
  const attempted = await prisma.leadActivity.groupBy({
    by: ["leadId"],
    where: { leadId: { in: openLeadIds }, action: "CALLED" },
  });
  const attemptedIds = new Set(attempted.map((a) => a.leadId));
  return openLeadIds.filter((id) => !attemptedIds.has(id)).length;
}

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

    const untouchedCount = await countUntouchedOpenLeads(userId);
    if (untouchedCount > 0) {
      throw new ValidationError(
        `You still have ${untouchedCount} lead(s) with no call attempt logged yet — work through those first.`
      );
    }

    return prisma.leadRequest.create({ data: { userId, note } });
  }

  /**
   * Piggybacked on the alerts poll (same as stale-lead reassignment and abandoned-session
   * cleanup — no cron infrastructure). Approves requests nobody's acted on in
   * AUTO_APPROVE_AFTER_HOURS+, capped at DAILY_AUTO_APPROVE_CAP/day so it degrades gracefully
   * rather than draining the pool unsupervised. Every auto-approval still shows up as an
   * alert and as normal ASSIGNED activity on each lead — the owner sees it, just after the
   * fact instead of gating it.
   */
  async autoApproveStale(): Promise<{ approvedCount: number }> {
    const cutoff = new Date(Date.now() - AUTO_APPROVE_AFTER_HOURS * 60 * 60 * 1000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const autoApprovedToday = await prisma.leadRequest.count({
      where: { autoApproved: true, resolvedAt: { gte: todayStart } },
    });
    const slotsLeft = DAILY_AUTO_APPROVE_CAP - autoApprovedToday;
    if (slotsLeft <= 0) return { approvedCount: 0 };

    const candidates = await prisma.leadRequest.findMany({
      where: { status: "PENDING", requestedAt: { lt: cutoff } },
      orderBy: { requestedAt: "asc" },
      take: slotsLeft,
    });

    let approvedCount = 0;
    for (const candidate of candidates) {
      // Re-check eligibility — the rep may have picked up new untouched leads since asking,
      // in which case this stays pending for a human to look at rather than auto-approving.
      const untouchedCount = await countUntouchedOpenLeads(candidate.userId);
      if (untouchedCount > 0) continue;

      await prisma.leadRequest.update({
        where: { id: candidate.id },
        data: { status: "APPROVED", resolvedAt: new Date(), autoApproved: true },
      });
      await assignmentService.topUpToCapacity(candidate.userId);
      approvedCount++;
    }

    return { approvedCount };
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
