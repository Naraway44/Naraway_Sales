import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { NotFoundError } from "@/common/errors/AppError";

const CONTACTED_STATUSES: LeadStatus[] = [
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
];

const NEGLECTED_STATUSES: LeadStatus[] = [
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "ON_HOLD",
];

// Sessions with no explicit logout are capped at this length for reporting. Deliberately
// decoupled from the JWT lifetime (which is 3 days, so people aren't logged out constantly) —
// a session left open without an explicit logout shouldn't be counted as multiple days of
// active work, so this stays at a realistic single-workday length.
const ASSUMED_SESSION_MAX_HOURS = 8;

function dateKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Rolls up raw login/logout sessions into day/week/month/year active-minutes totals, plus
 * a recent session list. Each session's full duration is attributed to its login day
 * (sessions essentially never span midnight given the 8h cap, so this is exact in practice).
 */
function summarizeSessions(sessions: { loginAt: Date; logoutAt: Date | null }[], now: Date) {
  const byDate = new Map<string, number>();

  for (const s of sessions) {
    const end = s.logoutAt ?? new Date(Math.min(now.getTime(), s.loginAt.getTime() + ASSUMED_SESSION_MAX_HOURS * 3600_000));
    const minutes = Math.max(0, (end.getTime() - s.loginAt.getTime()) / 60_000);
    const key = dateKey(s.loginAt);
    byDate.set(key, (byDate.get(key) ?? 0) + minutes);
  }

  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayOfWeek = (startOfToday.getDay() + 6) % 7; // Monday = 0
  const startOfWeek = new Date(startOfToday.getTime() - dayOfWeek * 86_400_000);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const startOfYear = new Date(now.getFullYear(), 0, 1);

  let today = 0;
  let thisWeek = 0;
  let thisMonth = 0;
  let thisYear = 0;

  for (const [key, minutes] of byDate.entries()) {
    const [y, m, d] = key.split("-").map(Number);
    const date = new Date(y, m, d);
    if (date >= startOfToday) today += minutes;
    if (date >= startOfWeek) thisWeek += minutes;
    if (date >= startOfMonth) thisMonth += minutes;
    if (date >= startOfYear) thisYear += minutes;
  }

  return {
    todayMinutes: Math.round(today),
    thisWeekMinutes: Math.round(thisWeek),
    thisMonthMinutes: Math.round(thisMonth),
    thisYearMinutes: Math.round(thisYear),
  };
}

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

  /** Leads still open that haven't been touched in `days`+ — the "going quiet" signal. */
  private async neglectedLeads(ownerId: string, days = 5) {
    const threshold = new Date(Date.now() - days * 86_400_000);
    const leads = await prisma.lead.findMany({
      where: { ownerId, status: { in: NEGLECTED_STATUSES }, updatedAt: { lt: threshold } },
      select: { id: true, companyName: true, status: true, updatedAt: true },
      orderBy: { updatedAt: "asc" },
      take: 20,
    });

    return leads.map((l) => ({
      id: l.id,
      companyName: l.companyName,
      status: l.status,
      daysSinceUpdate: Math.floor((Date.now() - l.updatedAt.getTime()) / 86_400_000),
    }));
  }

  /** Average hours from lead creation to first contact, for leads this person has moved off NEW. */
  private async avgResponseTimeHours(ownerId: string) {
    const leads = await prisma.lead.findMany({
      where: { ownerId, firstContactedAt: { not: null } },
      select: { createdAt: true, firstContactedAt: true },
    });
    if (leads.length === 0) return null;

    const totalHours = leads.reduce(
      (sum, l) => sum + (l.firstContactedAt!.getTime() - l.createdAt.getTime()) / 3600_000,
      0
    );
    return Math.round((totalHours / leads.length) * 10) / 10;
  }

  /**
   * Full activity/progress bundle for one team member's profile page: lead performance,
   * response time, neglected leads, call log stats, "profiles opened" counts, session
   * (check-in/check-out) rollups, and a recent activity feed. This is the "smart remote
   * work tracking" view — Founder/Manager use it to see everything about one person at once.
   */
  async memberProfile(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { team: true },
    });
    if (!user) throw new NotFoundError("User");

    const now = new Date();
    const sessionWindowStart = new Date(now.getFullYear() - 1, 0, 1);

    const [
      assigned,
      contacted,
      won,
      lost,
      neglected,
      avgResponseHours,
      callActivities,
      totalViews,
      viewedLeads,
      sessions,
      recentActivity,
    ] = await Promise.all([
      prisma.lead.count({ where: { ownerId: userId } }),
      prisma.lead.count({ where: { ownerId: userId, status: { in: CONTACTED_STATUSES } } }),
      prisma.lead.count({ where: { ownerId: userId, status: "WON" } }),
      prisma.lead.count({ where: { ownerId: userId, status: "LOST" } }),
      this.neglectedLeads(userId),
      this.avgResponseTimeHours(userId),
      prisma.leadActivity.findMany({ where: { userId, action: "CALLED" }, select: { notes: true } }),
      prisma.leadView.count({ where: { userId } }),
      prisma.leadView.findMany({ where: { userId }, distinct: ["leadId"], select: { leadId: true } }),
      prisma.userSession.findMany({
        where: { userId, loginAt: { gte: sessionWindowStart } },
        orderBy: { loginAt: "desc" },
        select: { loginAt: true, logoutAt: true },
      }),
      prisma.leadActivity.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: 20,
        include: { lead: { select: { id: true, companyName: true } } },
      }),
    ]);

    const callsByOutcome: Record<string, number> = {};
    for (const activity of callActivities) {
      const outcome = (activity.notes ?? "").split(":")[0].trim() || "UNKNOWN";
      callsByOutcome[outcome] = (callsByOutcome[outcome] ?? 0) + 1;
    }

    const sessionSummary = summarizeSessions(sessions, now);
    const recentSessions = sessions.slice(0, 15).map((s) => ({
      loginAt: s.loginAt,
      logoutAt: s.logoutAt,
      durationMinutes: Math.round(
        ((s.logoutAt ?? new Date(Math.min(now.getTime(), s.loginAt.getTime() + ASSUMED_SESSION_MAX_HOURS * 3600_000))).getTime() -
          s.loginAt.getTime()) /
          60_000
      ),
    }));

    return {
      user: {
        id: user.id,
        name: user.name,
        employeeId: user.employeeId,
        email: user.email,
        role: user.role,
        team: user.team?.name ?? null,
        isActive: user.isActive,
        lastLoginAt: user.lastLoginAt,
      },
      leadStats: {
        assignedLeads: assigned,
        contactedLeads: contacted,
        wonLeads: won,
        lostLeads: lost,
        conversionRate: assigned > 0 ? Math.round((won / assigned) * 1000) / 10 : 0,
        avgResponseTimeHours: avgResponseHours,
      },
      neglectedLeads: neglected,
      callStats: {
        total: callActivities.length,
        byOutcome: callsByOutcome,
      },
      viewStats: {
        totalViews,
        uniqueLeadsViewed: viewedLeads.length,
      },
      sessions: {
        ...sessionSummary,
        recent: recentSessions,
      },
      recentActivity: recentActivity.map((a) => ({
        id: a.id,
        action: a.action,
        notes: a.notes,
        timestamp: a.timestamp,
        leadId: a.lead.id,
        leadCompanyName: a.lead.companyName,
      })),
    };
  }
}

export const analyticsService = new AnalyticsService();
