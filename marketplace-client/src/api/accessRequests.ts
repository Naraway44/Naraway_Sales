import { api } from "./client";

export interface AccessRequestInput {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  message?: string;
}

export async function submitAccessRequest(input: AccessRequestInput) {
  const { data } = await api.post("/marketplace/access-requests", input);
  return data;
}
