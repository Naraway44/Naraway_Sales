import { api } from "./client";
import { Service } from "./types";

export const RESOURCE_CATEGORIES = ["MESSAGE", "EMAIL", "CALL_SCRIPT"] as const;
export type ResourceCategory = (typeof RESOURCE_CATEGORIES)[number];

export const RESOURCE_CATEGORY_LABELS: Record<ResourceCategory, string> = {
  MESSAGE: "Messages",
  EMAIL: "Emails",
  CALL_SCRIPT: "Calling Materials",
};

export interface Resource {
  id: string;
  title: string;
  body: string;
  category: ResourceCategory;
  serviceId: string | null;
  service: Service | null;
  createdBy: { id: string; name: string; employeeId: string } | null;
  createdAt: string;
  updatedAt: string;
}

export async function listResources(params: { category?: ResourceCategory; serviceId?: string } = {}) {
  const { data } = await api.get<Resource[]>("/resources", { params });
  return data;
}

export async function createResource(input: {
  title: string;
  body: string;
  category: ResourceCategory;
  serviceId?: string | null;
}) {
  const { data } = await api.post<Resource>("/resources", input);
  return data;
}

export async function updateResource(
  id: string,
  input: Partial<{ title: string; body: string; category: ResourceCategory; serviceId: string | null }>
) {
  const { data } = await api.patch<Resource>(`/resources/${id}`, input);
  return data;
}

export async function deleteResource(id: string) {
  await api.delete(`/resources/${id}`);
}
