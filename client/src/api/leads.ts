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

export function exportLeadsUrl(params: LeadListParams) {
  const query = new URLSearchParams(params as Record<string, string>).toString();
  const base = (api.defaults.baseURL ?? "").replace(/\/$/, "");
  return `${base}/leads/export?${query}`;
}

export async function parseCsvFile(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<{ headers: string[]; rows: Record<string, string>[] }>(
    "/leads/import/parse",
    formData,
    { headers: { "Content-Type": "multipart/form-data" } }
  );
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
