import { api } from "./client";

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

/** month is "YYYY-MM"; omit for the current month. */
export async function getMyAttendance(month?: string) {
  const { data } = await api.get<DayAttendance[]>("/attendance/me", { params: { month } });
  return data;
}

export async function getUserAttendance(userId: string, month?: string) {
  const { data } = await api.get<DayAttendance[]>(`/attendance/${userId}`, { params: { month } });
  return data;
}
