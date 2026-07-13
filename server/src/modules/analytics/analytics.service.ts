import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/common/prisma";

const CONTACTED_STATUSES: LeadStatus[] = [
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

export class AnalyticsService {
  /** Company-wide totals: how many leads exist, how many have been worked, how many converted. */
  async overview() {
    const [total, statusGroups, contacted, won, lost, unassigned, organic, inorganic, organicWon, inorganicWon] =
      await Promise.all([
        prisma.lead.count(),
        prisma.lead.groupBy({ by: ["status"], _count: { _all: true } }),
        prisma.lead.count({ where: { status: { in: CONTACTED_STATUSES } } }),
        prisma.lead.count({ where: { status: "WON" } }),
        prisma.lead.count({ where: { status: "LOST" } }),
        prisma.lead.count({ where: { ownerId: null } }),
        prisma.lead.count({ where: { source: { isOrganic: true } } }),
        prisma.lead.count({ where: { source: { isOrganic: false } } }),
        prisma.lead.count({ where: { source: { isOrganic: true }, status: "WON" } }),
        prisma.lead.count({ where: { source: { isOrganic: false }, status: "WON" } }),
      ]);

    const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<
      LeadStatus,
      number
    >;

    return {
      totalLeads: total,
      unassignedLeads: unassigned,
      contactedLeads: contacted,
      notYetContacted: total - contacted,
      wonLeads: won,
      lostLeads: lost,
      conversionRate: total > 0 ? Math.round((won / total) * 1000) / 10 : 0,
      byStatus,
      leadQuality: {
        organic: {
          count: organic,
          won: organicWon,
          conversionRate: organic > 0 ? Math.round((organicWon / organic) * 1000) / 10 : 0,
        },
        inorganic: {
          count: inorganic,
          won: inorganicWon,
          conversionRate: inorganic > 0 ? Math.round((inorganicWon / inorganic) * 1000) / 10 : 0,
        },
        uncategorized: total - organic - inorganic,
      },
    };
  }

  /**
   * Per-salesperson breakdown: how many leads assigned, how many contacted/updated,
   * how many won, and their individual conversion rate. This is the "who is doing what"
   * view for Founder/Manager so nothing gets missed and effort isn't duplicated
   * (each lead has exactly one owner, enforced by the schema).
   */
  async byUser() {
    const executives = await prisma.user.findMany({
      where: { role: { in: [Role.EXECUTIVE, Role.MANAGER] }, isActive: true },
      select: { id: true, name: true, employeeId: true, role: true, team: { select: { name: true } } },
    });

    const stats = await Promise.all(
      executives.map(async (u) => {
        const [assigned, contacted, won, lost, lastActivity] = await Promise.all([
          prisma.lead.count({ where: { ownerId: u.id } }),
          prisma.lead.count({ where: { ownerId: u.id, status: { in: CONTACTED_STATUSES } } }),
          prisma.lead.count({ where: { ownerId: u.id, status: "WON" } }),
          prisma.lead.count({ where: { ownerId: u.id, status: "LOST" } }),
          prisma.leadActivity.findFirst({
            where: { userId: u.id },
            orderBy: { timestamp: "desc" },
            select: { timestamp: true },
          }),
        ]);

        return {
          userId: u.id,
          name: u.name,
          employeeId: u.employeeId,
          team: u.team?.name ?? null,
          assignedLeads: assigned,
          contactedLeads: contacted,
          wonLeads: won,
          lostLeads: lost,
          conversionRate: assigned > 0 ? Math.round((won / assigned) * 1000) / 10 : 0,
          lastActiveAt: lastActivity?.timestamp ?? null,
        };
      })
    );

    return stats.sort((a, b) => b.wonLeads - a.wonLeads);
  }

  /**
   * Self-scoped performance summary for a single salesperson's own dashboard — their own
   * leads, follow-up load, and conversion rate. Any authenticated user can call this for
   * themselves; it never exposes another person's data.
   */
  async myOverview(userId: string) {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);

    const [
      assigned,
      contacted,
      won,
      lost,
      statusGroups,
      overdueFollowUps,
      todayFollowUps,
      upcomingFollowUps,
    ] = await Promise.all([
      prisma.lead.count({ where: { ownerId: userId } }),
      prisma.lead.count({ where: { ownerId: userId, status: { in: CONTACTED_STATUSES } } }),
      prisma.lead.count({ where: { ownerId: userId, status: "WON" } }),
      prisma.lead.count({ where: { ownerId: userId, status: "LOST" } }),
      prisma.lead.groupBy({ by: ["status"], where: { ownerId: userId }, _count: { _all: true } }),
      prisma.lead.count({ where: { ownerId: userId, nextFollowUp: { lt: startOfToday } } }),
      prisma.lead.count({
        where: { ownerId: userId, nextFollowUp: { gte: startOfToday, lt: startOfTomorrow } },
      }),
      prisma.lead.count({ where: { ownerId: userId, nextFollowUp: { gte: startOfTomorrow } } }),
    ]);

    const byStatus = Object.fromEntries(statusGroups.map((g) => [g.status, g._count._all])) as Record<
      LeadStatus,
      number
    >;

    return {
      assignedLeads: assigned,
      contactedLeads: contacted,
      notYetContacted: assigned - contacted,
      wonLeads: won,
      lostLeads: lost,
      conversionRate: assigned > 0 ? Math.round((won / assigned) * 1000) / 10 : 0,
      byStatus,
      followUps: {
        overdue: overdueFollowUps,
        today: todayFollowUps,
        upcoming: upcomingFollowUps,
      },
    };
  }
}

export const analyticsService = new AnalyticsService();
