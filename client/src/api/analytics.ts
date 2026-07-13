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
