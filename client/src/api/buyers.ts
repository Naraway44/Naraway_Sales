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
