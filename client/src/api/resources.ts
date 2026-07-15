import { api } from "./client";
import { Service } from "./types";

// PAYMENT_INFO is deliberately excluded from this list — it's rendered as a single pinned
// card on the Resources page, not a filterable/browsable category like the rest.
export const RESOURCE_CATEGORIES = [
  "CALL_SCRIPT",
  "OBJECTION_HANDLING",
  "EMAIL",
  "WHATSAPP",
  "SMS",
  "FAQ",
  "PRICING",
] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number] | "PAYMENT_INFO";

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  CALL_SCRIPT: "Sales Scripts",
  OBJECTION_HANDLING: "Objection Handling",
  EMAIL: "Email Templates",
  WHATSAPP: "WhatsApp Templates",
  SMS: "SMS Templates",
  FAQ: "FAQ",
  PRICING: "Pricing",
  PAYMENT_INFO: "Payment & Bank Details",
};

export interface Resource {
  id: string;
  title: string;
  body: string;
  category: ResourceCategory;
  serviceId: string | null;
  service: Service | null;
  fileUrl: string | null;
  createdBy: { id: string; name: string; employeeId: string } | null;
  createdAt: string;
  updatedAt: string;
}

export async function listResources(params: { category?: ResourceCategory; serviceId?: string; search?: string } = {}) {
  const { data } = await api.get<Resource[]>("/resources", { params });
  return data;
}

export async function createResource(input: {
  title: string;
  body: string;
  category: ResourceCategory;
  serviceId?: string | null;
  fileUrl?: string | null;
}) {
  const { data } = await api.post<Resource>("/resources", input);
  return data;
}

export async function updateResource(
  id: string,
  input: Partial<{ title: string; body: string; category: ResourceCategory; serviceId: string | null; fileUrl: string | null }>
) {
  const { data } = await api.patch<Resource>(`/resources/${id}`, input);
  return data;
}

export async function deleteResource(id: string) {
  await api.delete(`/resources/${id}`);
}
