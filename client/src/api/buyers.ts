import { api } from "./client";

export interface Buyer {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listBuyers() {
  const { data } = await api.get<Buyer[]>("/buyers");
  return data;
}

export async function createBuyer(input: { name: string; company?: string; email: string; phone?: string }) {
  const { data } = await api.post<{ buyer: Buyer; tempPassword: string }>("/buyers", input);
  return data;
}

export interface AccessRequest {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  message?: string | null;
  status: "PENDING" | "APPROVED" | "DECLINED";
  createdAt: string;
}

export async function listAccessRequests() {
  const { data } = await api.get<AccessRequest[]>("/buyers/access-requests");
  return data;
}

export async function resolveAccessRequest(id: string, status: "APPROVED" | "DECLINED") {
  const { data } = await api.post<AccessRequest>(`/buyers/access-requests/${id}/resolve`, { status });
  return data;
}
