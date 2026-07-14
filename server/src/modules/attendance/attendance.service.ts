import { User } from "@prisma/client";
import { prisma } from "@/common/prisma";

// A login within this many minutes of the expected start still counts as on-time — network
// hiccups, a slow app load, etc. shouldn't register as "late" for something trivial.
const LATE_GRACE_MINUTES = 15;

export type DayStatus = "ON_TIME" | "LATE" | "ABSENT" | "DAY_OFF" | "FUTURE" | "IN_PROGRESS";

export interface DayAttendance {
  date: string;
  isWorkDay: boolean;
  expectedStart: string;
  expectedEnd: string;
  firstLoginAt: string | null;
  lastLogoutAt: string | null;
  activeMinutes: number;
  status: DayStatus;
}

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function minutesFromTimeString(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

type ScheduleUser = Pick<User, "id" | "workStartTime" | "workEndTime" | "workDays">;

/**
 * Computes per-day attendance for one user across [monthStart, monthEnd) directly from
 * their UserSession rows — nothing is stored separately, so changing someone's schedule
 * later doesn't require backfilling anything; past days are just re-evaluated against
 * whatever schedule is current.
 */
export async function getAttendanceCalendar(
  user: ScheduleUser,
  monthStart: Date,
  monthEnd: Date
): Promise<DayAttendance[]> {
  const sessions = await prisma.userSession.findMany({
    where: { userId: user.id, loginAt: { gte: monthStart, lt: monthEnd } },
    orderBy: { loginAt: "asc" },
  });

  const byDay = new Map<string, typeof sessions>();
  for (const s of sessions) {
    const key = toDateKey(s.loginAt);
    const list = byDay.get(key) ?? [];
    list.push(s);
    byDay.set(key, list);
  }

  const now = new Date();
  const todayKey = toDateKey(now);
  const expectedStartMinutes = minutesFromTimeString(user.workStartTime);

  const days: DayAttendance[] = [];
  for (const d = new Date(monthStart); d < monthEnd; d.setDate(d.getDate() + 1)) {
    const dayKey = toDateKey(d);
    const isWorkDay = user.workDays.includes(d.getDay());
    const daySessions = byDay.get(dayKey) ?? [];

    const firstLoginAt = daySessions.length > 0 ? daySessions[0].loginAt : null;
    const lastSession = daySessions[daySessions.length - 1];
    const activeMinutes = Math.round(daySessions.reduce((sum, s) => sum + s.activeSeconds, 0) / 60);

    let status: DayStatus;
    if (!isWorkDay) {
      status = "DAY_OFF";
    } else if (dayKey > todayKey) {
      status = "FUTURE";
    } else if (!firstLoginAt) {
      status = dayKey === todayKey ? "IN_PROGRESS" : "ABSENT";
    } else {
      const loginMinutes = firstLoginAt.getHours() * 60 + firstLoginAt.getMinutes();
      status = loginMinutes > expectedStartMinutes + LATE_GRACE_MINUTES ? "LATE" : "ON_TIME";
    }

    days.push({
      date: dayKey,
      isWorkDay,
      expectedStart: user.workStartTime,
      expectedEnd: user.workEndTime,
      firstLoginAt: firstLoginAt?.toISOString() ?? null,
      lastLogoutAt: lastSession?.logoutAt?.toISOString() ?? null,
      activeMinutes,
      status,
    });
  }

  return days;
}

export interface LateOrAbsentRep {
  id: string;
  name: string;
  employeeId: string;
  expectedStart: string;
  minutesLate: number;
}

/**
 * Org-wide "who hasn't shown up yet today" — active reps whose shift started
 * (past expected start + grace) with zero sessions today. Feeds the alerts sweep so a
 * no-show surfaces the same day, not only in a later calendar review. Bounded to two
 * queries total regardless of team size (no per-rep round-trip).
 */
export async function getTodayLateOrAbsentReps(): Promise<LateOrAbsentRep[]> {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const todayDow = now.getDay();

  const reps = await prisma.user.findMany({
    where: { role: { in: ["EXECUTIVE", "MANAGER"] }, isActive: true },
    select: { id: true, name: true, employeeId: true, workStartTime: true, workDays: true },
  });

  const due = reps.filter(
    (r) => r.workDays.includes(todayDow) && nowMinutes > minutesFromTimeString(r.workStartTime) + LATE_GRACE_MINUTES
  );
  if (due.length === 0) return [];

  const sessionsToday = await prisma.userSession.findMany({
    where: { userId: { in: due.map((r) => r.id) }, loginAt: { gte: todayStart } },
    select: { userId: true },
  });
  const loggedInIds = new Set(sessionsToday.map((s) => s.userId));

  return due
    .filter((r) => !loggedInIds.has(r.id))
    .map((r) => ({
      id: r.id,
      name: r.name,
      employeeId: r.employeeId,
      expectedStart: r.workStartTime,
      minutesLate: nowMinutes - minutesFromTimeString(r.workStartTime),
    }));
}
