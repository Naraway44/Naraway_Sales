import { prisma } from "@/common/prisma";
import { ActivityAction, Role } from "@prisma/client";
import { NotFoundError, ValidationError } from "@/common/errors/AppError";
import { logActivity } from "@/modules/activities/activities.service";

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
   * Auto-assigns a lead based on its service's AssignmentRule (service -> team), then
   * picks an owner within that team via round robin. Falls back to leaving it
   * unassigned if no rule matches or the team has no active executives.
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

  /** Rotates through active executives of a team, tracked via Team.lastAssignedIdx. */
  private async nextRoundRobinUser(teamId: string) {
    const team = await prisma.team.findUnique({ where: { id: teamId } });
    if (!team) return null;

    const executives = await prisma.user.findMany({
      where: { teamId, role: Role.EXECUTIVE, isActive: true },
      orderBy: { employeeId: "asc" },
    });
    if (executives.length === 0) return null;

    const nextIdx = team.lastAssignedIdx % executives.length;
    await prisma.team.update({ where: { id: teamId }, data: { lastAssignedIdx: nextIdx + 1 } });

    return executives[nextIdx];
  }
}

export const assignmentService = new AssignmentService();
