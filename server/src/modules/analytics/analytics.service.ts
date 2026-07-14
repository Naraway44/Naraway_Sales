import { LeadStatus, Role } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { NotFoundError } from "@/common/errors/AppError";
import { AuthUser } from "@/common/middleware/auth";
import { assignmentService } from "@/modules/assignment/assignment.service";
import { authService } from "@/modules/auth/auth.service";
import { leadRequestsService } from "@/modules/leadRequests/leadRequests.service";
import { findStaleLeads } from "@/modules/leads/leadStaleness";
import { getTodayLateOrAbsentReps } from "@/modules/attendance/attendance.service";

export interface AlertItem {
  id: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
  // "self" means "go to my own dashboard" — used for an Executive's own alerts, since
  // they can't reach the Founder/Manager-only Member Profile route (even their own).
  link: { type: "user" | "lead" | "self"; id: string };
}

// Anything open this long without a heartbeat, while still logged in, counts as "away
// right now" for the live alert feed — same threshold as the persisted IdleFlag record,
// just computed live instead of waiting for the next heartbeat/logout to write one.
const LIVE_IDLE_THRESHOLD_MINUTES = 30;

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

function bucketTotals(byDate: Map<string, number>, now: Date) {
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

/**
 * Rolls up raw login/logout sessions into day/week/month/year totals for TWO separate
 * numbers: how long they were logged in, and how long they were actually active (real
 * mouse/keyboard/scroll heartbeats). The gap between these two is the "logged in but not
 * working" signal — presence alone is easy to fake (mouse jigglers exist), so this is
 * reported as a supporting number next to output metrics (calls, leads touched), never
 * as the accountability measure on its own.
 */
function summarizeSessions(
  sessions: { loginAt: Date; logoutAt: Date | null; activeSeconds: number }[],
  now: Date
) {
  const loggedInByDate = new Map<string, number>();
  const activeByDate = new Map<string, number>();

  for (const s of sessions) {
    const end = s.logoutAt ?? new Date(Math.min(now.getTime(), s.loginAt.getTime() + ASSUMED_SESSION_MAX_HOURS * 3600_000));
    const loggedInMinutes = Math.max(0, (end.getTime() - s.loginAt.getTime()) / 60_000);
    const key = dateKey(s.loginAt);
    loggedInByDate.set(key, (loggedInByDate.get(key) ?? 0) + loggedInMinutes);
    activeByDate.set(key, (activeByDate.get(key) ?? 0) + s.activeSeconds / 60);
  }

  return {
    loggedIn: bucketTotals(loggedInByDate, now),
    active: bucketTotals(activeByDate, now),
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
    const sessionWindowStart = new Date(now.getFullYear() - 1, 0, 1);

    const [
      assigned,
      contacted,
      won,
      lost,
      statusGroups,
      overdueFollowUps,
      todayFollowUps,
      upcomingFollowUps,
      sessions,
      todayIdleFlags,
      todayCalls,
      todayViews,
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
      prisma.userSession.findMany({
        where: { userId, loginAt: { gte: sessionWindowStart } },
        orderBy: { loginAt: "desc" },
        select: { loginAt: true, logoutAt: true, activeSeconds: true },
      }),
      prisma.idleFlag.findMany({ where: { userId, flagDate: startOfToday }, orderBy: { startedAt: "desc" } }),
      prisma.leadActivity.count({
        where: { userId, action: "CALLED", timestamp: { gte: startOfToday } },
      }),
      prisma.leadView.count({ where: { userId, viewDate: startOfToday } }),
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
      // Same activity data shown to Founder/Manager on this person's Member Profile —
      // visible to the person themselves too, so it's a shared record, not a one-sided one.
      sessions: summarizeSessions(sessions, now),
      today: {
        callsLogged: todayCalls,
        leadsViewed: todayViews,
        idleFlags: todayIdleFlags.map((f) => ({
          startedAt: f.startedAt,
          endedAt: f.endedAt,
          durationMinutes: f.durationMinutes,
        })),
      },
    };
  }

  /** Leads still open with no MEANINGFUL activity (call, status move, etc.) in `days`+. */
  private async neglectedLeads(ownerId: string, days = 5) {
    const leads = await findStaleLeads({ ownerIds: [ownerId], statuses: NEGLECTED_STATUSES, days });

    return leads.slice(0, 20).map((l) => ({
      id: l.id,
      companyName: l.companyName,
      status: l.status,
      daysSinceUpdate: Math.floor((Date.now() - l.lastMeaningfulAt.getTime()) / 86_400_000),
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
      idleFlags,
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
        select: { loginAt: true, logoutAt: true, activeSeconds: true },
      }),
      prisma.leadActivity.findMany({
        where: { userId },
        orderBy: { timestamp: "desc" },
        take: 20,
        include: { lead: { select: { id: true, companyName: true } } },
      }),
      prisma.idleFlag.findMany({
        where: { userId },
        orderBy: { startedAt: "desc" },
        take: 20,
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
      activeMinutes: Math.round(s.activeSeconds / 60),
      loggedInMinutes: Math.round(
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
      idleFlags: idleFlags.map((f) => ({
        id: f.id,
        flagDate: f.flagDate,
        startedAt: f.startedAt,
        endedAt: f.endedAt,
        durationMinutes: f.durationMinutes,
      })),
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

  /**
   * Live "what needs attention right now" feed — computed fresh on every call, not stored,
   * so there's no background job to run and nothing to mark read/dismissed. Founder/Manager
   * get an org-wide view (who's going quiet, who's overdue, who's away right now);
   * Executives get the same shape scoped to just themselves, so it doubles as a gentle
   * self-check ("you've been away 40 min") rather than one-sided monitoring.
   */
  async getAlerts(user: AuthUser): Promise<AlertItem[]> {
    const now = new Date();
    const isOrgWide = user.role === "FOUNDER" || user.role === "MANAGER";
    const alerts: AlertItem[] = [];

    // Founder/Manager poll this every ~60s while the app is open — piggyback the stale-lead
    // redistribution sweep here instead of a cron job, so leads actually get moved to
    // someone else, not just flagged for a human to reassign by hand.
    if (isOrgWide) {
      const { reassignedCount } = await assignmentService.reassignStaleLeads();
      if (reassignedCount > 0) {
        alerts.push({
          id: `auto-reassigned-${now.getTime()}`,
          severity: "warning",
          title: `${reassignedCount} lead(s) auto-reassigned`,
          message: "Untouched 5+ days — moved to another rep on the same team automatically.",
          link: { type: "self", id: user.id },
        });
      }

      // Same piggyback: a session nobody logged out of (laptop died, browser crashed) would
      // otherwise sit "open" forever and its trailing idle gap would never get recorded.
      const { closedCount } = await authService.closeAbandonedSessions();
      if (closedCount > 0) {
        alerts.push({
          id: `sessions-closed-${now.getTime()}`,
          severity: "warning",
          title: `${closedCount} abandoned session(s) closed`,
          message: "No heartbeat for 8+ hours and never logged out — closed automatically.",
          link: { type: "self", id: user.id },
        });
      }

      // Same piggyback: requests left pending too long (owner unavailable) get auto-approved,
      // capped per day, so reps aren't blocked indefinitely — surfaced here rather than silent.
      const { approvedCount } = await leadRequestsService.autoApproveStale();
      if (approvedCount > 0) {
        alerts.push({
          id: `lead-requests-auto-approved-${now.getTime()}`,
          severity: "warning",
          title: `${approvedCount} lead request(s) auto-approved`,
          message: "Pending 4+ hours with no untouched leads — approved automatically (capped at 5/day).",
          link: { type: "self", id: user.id },
        });
      }

      // Not a sweep — nothing to close or reassign, just surface it same-day instead of
      // only being visible later in a monthly attendance review.
      const lateReps = await getTodayLateOrAbsentReps();
      const todayDateKey = now.toISOString().slice(0, 10);
      for (const rep of lateReps) {
        alerts.push({
          id: `attendance-late-${rep.id}-${todayDateKey}`,
          severity: rep.minutesLate >= 60 ? "critical" : "warning",
          title: `${rep.name} hasn't logged in yet`,
          message: `Expected by ${rep.expectedStart} — ${rep.minutesLate} min overdue.`,
          link: { type: "user", id: rep.id },
        });
      }
    }

    const linkTo = (userId: string): AlertItem["link"] => ({ type: isOrgWide ? "user" : "self", id: userId });

    const repScope = isOrgWide ? {} : { id: user.id };
    const reps = await prisma.user.findMany({
      where: { role: { in: [Role.EXECUTIVE, Role.MANAGER] }, isActive: true, ...repScope },
      select: { id: true, name: true, employeeId: true },
    });
    if (reps.length === 0) return alerts;
    const repIds = reps.map((r) => r.id);
    const repById = new Map(reps.map((r) => [r.id, r]));

    const [staleLeads, overdueGroups, openSessions] = await Promise.all([
      findStaleLeads({ ownerIds: repIds, statuses: NEGLECTED_STATUSES, days: 5 }),
      prisma.lead.groupBy({
        by: ["ownerId"],
        where: { ownerId: { in: repIds }, status: { in: NEGLECTED_STATUSES }, nextFollowUp: { lt: now } },
        _count: { _all: true },
      }),
      prisma.userSession.findMany({
        where: { userId: { in: repIds }, logoutAt: null },
        select: { userId: true, loginAt: true, lastHeartbeatAt: true },
      }),
    ]);

    const staleByOwner = new Map<string, { count: number; oldestDays: number }>();
    for (const lead of staleLeads) {
      if (!lead.ownerId) continue;
      const days = Math.floor((now.getTime() - lead.lastMeaningfulAt.getTime()) / 86_400_000);
      const existing = staleByOwner.get(lead.ownerId);
      staleByOwner.set(lead.ownerId, {
        count: (existing?.count ?? 0) + 1,
        oldestDays: Math.max(existing?.oldestDays ?? 0, days),
      });
    }

    for (const [ownerId, { count, oldestDays }] of staleByOwner.entries()) {
      const rep = repById.get(ownerId);
      if (!rep) continue;
      alerts.push({
        id: `neglected-${ownerId}`,
        severity: oldestDays >= 10 ? "critical" : "warning",
        title: isOrgWide ? `${rep.name} has ${count} neglected lead(s)` : `You have ${count} neglected lead(s)`,
        message: `Oldest untouched for ${oldestDays} day(s). No real activity (call, status change) in 5+ days.`,
        link: linkTo(ownerId),
      });
    }

    for (const g of overdueGroups) {
      if (!g.ownerId) continue;
      const rep = repById.get(g.ownerId);
      if (!rep) continue;
      alerts.push({
        id: `overdue-${g.ownerId}`,
        severity: "warning",
        title: isOrgWide ? `${rep.name} has ${g._count._all} overdue follow-up(s)` : `You have ${g._count._all} overdue follow-up(s)`,
        message: "Follow-up date has already passed.",
        link: linkTo(g.ownerId),
      });
    }

    for (const s of openSessions) {
      const lastActive = s.lastHeartbeatAt ?? s.loginAt;
      const awayMinutes = (now.getTime() - lastActive.getTime()) / 60_000;
      if (awayMinutes < LIVE_IDLE_THRESHOLD_MINUTES) continue;
      const rep = repById.get(s.userId);
      if (!rep) continue;
      alerts.push({
        id: `away-${s.userId}`,
        severity: awayMinutes >= 60 ? "critical" : "warning",
        title: isOrgWide ? `${rep.name} is logged in but away` : "You've been away from the screen",
        message: `No activity for ${Math.round(awayMinutes)} minute(s), session still open.`,
        link: linkTo(s.userId),
      });
    }

    return alerts.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "critical" ? -1 : 1));
  }
}

export const analyticsService = new AnalyticsService();
