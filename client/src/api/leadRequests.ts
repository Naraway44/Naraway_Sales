import { api } from "./client";

export type LeadRequestStatus = "PENDING" | "APPROVED" | "DENIED";

export interface LeadRequest {
  id: string;
  userId: string;
  user?: { id: string; name: string; employeeId: string; team?: { id: string; name: string } | null };
  status: LeadRequestStatus;
  note?: string | null;
  requestedAt: string;
  resolvedAt?: string | null;
  resolvedById?: string | null;
}

export async function createLeadRequest(note?: string) {
  const { data } = await api.post<LeadRequest>("/lead-requests", { note });
  return data;
}

export async function listPendingLeadRequests() {
  const { data } = await api.get<LeadRequest[]>("/lead-requests");
  return data;
}

export async function resolveLeadRequest(id: string, approve: boolean) {
  const { data } = await api.post<{ request: LeadRequest; assignedCount: number }>(
    `/lead-requests/${id}/resolve`,
    { approve }
  );
  return data;
}
