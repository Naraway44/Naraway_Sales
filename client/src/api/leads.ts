import { api } from "./client";
import { Lead, LeadActivity, LeadComment, Paginated } from "./types";

export interface LeadListParams {
  search?: string;
  status?: string;
  priority?: string;
  ownerId?: string;
  serviceId?: string;
  sourceId?: string;
  state?: string;
  unassigned?: boolean;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortDir?: "asc" | "desc";
}

export async function listLeads(params: LeadListParams) {
  const { data } = await api.get<Paginated<Lead>>("/leads", { params });
  return data;
}

export async function getLead(id: string) {
  const { data } = await api.get<Lead>(`/leads/${id}`);
  return data;
}

export async function createLead(input: Partial<Lead>) {
  const { data } = await api.post<Lead>("/leads", input);
  return data;
}

export async function updateLead(id: string, input: Partial<Lead>) {
  const { data } = await api.patch<Lead>(`/leads/${id}`, input);
  return data;
}

export async function deleteLead(id: string) {
  await api.delete(`/leads/${id}`);
}

export async function assignLead(id: string, ownerId: string) {
  const { data } = await api.post<Lead>(`/leads/${id}/assign`, { ownerId });
  return data;
}

export async function bulkAssignLeads(leadIds: string[], ownerId: string) {
  const { data } = await api.post<Lead[]>("/leads/bulk-assign", { leadIds, ownerId });
  return data;
}

/** Won/Lost only — offers this client a different service as a new, auto-assigned lead. */
export async function routeLeadToService(id: string, targetServiceId: string, note?: string) {
  const { data } = await api.post<Lead>(`/leads/${id}/route`, { targetServiceId, note });
  return data;
}

export async function getLeadActivities(id: string) {
  const { data } = await api.get<LeadActivity[]>(`/leads/${id}/activities`);
  return data;
}

export async function getLeadComments(id: string) {
  const { data } = await api.get<LeadComment[]>(`/leads/${id}/comments`);
  return data;
}

export async function addLeadComment(id: string, body: string) {
  const { data } = await api.post<LeadComment>(`/leads/${id}/comments`, { body });
  return data;
}

export const CALL_OUTCOMES = ["CONNECTED", "NO_ANSWER", "VOICEMAIL", "CALL_BACK_LATER", "WRONG_NUMBER"] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

export async function logCall(id: string, outcome: CallOutcome, note?: string, nextFollowUp?: string) {
  await api.post(`/leads/${id}/calls`, { outcome, note, nextFollowUp });
}

/** Owner marks "I'm working this myself" — excluded from stale-reassignment/capacity for 30 days. */
export async function setLeadPinned(id: string, pinned: boolean) {
  const { data } = await api.post<Lead>(`/leads/${id}/pin`, { pinned });
  return data;
}

/** Founder/Manager only — copies a Lost lead into the marketplace for buyers to purchase. */
export async function releaseLeadToMarketplace(id: string, overridePrice?: number) {
  const { data } = await api.post(`/leads/${id}/release-to-marketplace`, { overridePrice });
  return data;
}

export async function exportLeads(params: LeadListParams) {
  const response = await api.get("/leads/export", { params, responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "leads-export.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export interface ParsedSheet {
  sheetName: string;
  headerRowIndex: number;
  headers: string[];
  rows: Record<string, string>[];
}

export async function parseCsvFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ParsedSheet[]>("/leads/import/parse", formData, {
    headers: { "Content-Type": "multipart/form-data" },
  });
  return data;
}

export interface ImportPreviewRow {
  rowNumber: number;
  data: Record<string, string>;
  errors: string[];
  isDuplicate: boolean;
}

export async function previewImport(
  rows: Record<string, string>[],
  columnMapping: Record<string, string>
) {
  const { data } = await api.post<ImportPreviewRow[]>("/leads/import/preview", {
    rows,
    columnMapping,
  });
  return data;
}

export async function confirmImport(rows: Record<string, string>[]) {
  const { data } = await api.post<{
    createdCount: number;
    createdIds: string[];
    skipped: { rowNumber: number; reason: string }[];
  }>("/leads/import/confirm", { rows });
  return data;
}
