import { api } from "./client";
import { LeadStatus } from "./types";

export interface AnalyticsOverview {
  totalLeads: number;
  unassignedLeads: number;
  contactedLeads: number;
  notYetContacted: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  byStatus: Partial<Record<LeadStatus, number>>;
  leadQuality: {
    organic: { count: number; won: number; conversionRate: number };
    inorganic: { count: number; won: number; conversionRate: number };
    uncategorized: number;
  };
}

export interface UserPerformance {
  userId: string;
  name: string;
  employeeId: string;
  team: string | null;
  assignedLeads: number;
  contactedLeads: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  lastActiveAt: string | null;
}

export async function getAnalyticsOverview() {
  const { data } = await api.get<AnalyticsOverview>("/analytics/overview");
  return data;
}

export async function getAnalyticsByUser() {
  const { data } = await api.get<UserPerformance[]>("/analytics/by-user");
  return data;
}

export interface MyOverview {
  assignedLeads: number;
  contactedLeads: number;
  notYetContacted: number;
  wonLeads: number;
  lostLeads: number;
  conversionRate: number;
  byStatus: Partial<Record<LeadStatus, number>>;
  followUps: { overdue: number; today: number; upcoming: number };
}

export async function getMyOverview() {
  const { data } = await api.get<MyOverview>("/analytics/me");
  return data;
}

export interface MemberProfile {
  user: {
    id: string;
    name: string;
    employeeId: string;
    email: string;
    role: string;
    team: string | null;
    isActive: boolean;
    lastLoginAt: string | null;
  };
  leadStats: {
    assignedLeads: number;
    contactedLeads: number;
    wonLeads: number;
    lostLeads: number;
    conversionRate: number;
    avgResponseTimeHours: number | null;
  };
  neglectedLeads: { id: string; companyName: string; status: LeadStatus; daysSinceUpdate: number }[];
  callStats: { total: number; byOutcome: Record<string, number> };
  viewStats: { totalViews: number; uniqueLeadsViewed: number };
  sessions: {
    todayMinutes: number;
    thisWeekMinutes: number;
    thisMonthMinutes: number;
    thisYearMinutes: number;
    recent: { loginAt: string; logoutAt: string | null; durationMinutes: number }[];
  };
  recentActivity: {
    id: string;
    action: string;
    notes: string | null;
    timestamp: string;
    leadId: string;
    leadCompanyName: string;
  }[];
}

export async function getMemberProfile(userId: string) {
  const { data } = await api.get<MemberProfile>(`/analytics/members/${userId}`);
  return data;
}
