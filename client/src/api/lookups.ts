import { api } from "./client";
import { LeadSource, Service, Team } from "./types";

export async function listTeams() {
  const { data } = await api.get<Team[]>("/teams");
  return data;
}

export async function createTeam(name: string) {
  const { data } = await api.post<Team>("/teams", { name });
  return data;
}

export async function updateTeam(id: string, name: string) {
  const { data } = await api.patch<Team>(`/teams/${id}`, { name });
  return data;
}

export async function deleteTeam(id: string) {
  await api.delete(`/teams/${id}`);
}

export async function listServices() {
  const { data } = await api.get<Service[]>("/services");
  return data;
}

export async function createService(name: string) {
  const { data } = await api.post<Service>("/services", { name });
  return data;
}

export async function updateService(id: string, name: string) {
  const { data } = await api.patch<Service>(`/services/${id}`, { name });
  return data;
}

export async function deleteService(id: string) {
  await api.delete(`/services/${id}`);
}

export async function listLeadSources() {
  const { data } = await api.get<LeadSource[]>("/lead-sources");
  return data;
}

export async function createLeadSource(name: string, isOrganic = true) {
  const { data } = await api.post<LeadSource>("/lead-sources", { name, isOrganic });
  return data;
}

export async function updateLeadSource(id: string, name: string, isOrganic: boolean) {
  const { data } = await api.patch<LeadSource>(`/lead-sources/${id}`, { name, isOrganic });
  return data;
}

export async function deleteLeadSource(id: string) {
  await api.delete(`/lead-sources/${id}`);
}

export interface AssignmentRule {
  id: string;
  serviceId: string;
  teamId: string;
  service: Service;
  team: Team;
}

export async function listAssignmentRules() {
  const { data } = await api.get<AssignmentRule[]>("/assignment-rules");
  return data;
}

export async function createAssignmentRule(serviceId: string, teamId: string) {
  const { data } = await api.post<AssignmentRule>("/assignment-rules", { serviceId, teamId });
  return data;
}

export async function deleteAssignmentRule(id: string) {
  await api.delete(`/assignment-rules/${id}`);
}

export async function updateAssignmentRule(id: string, input: { serviceId?: string; teamId?: string }) {
  const { data } = await api.patch<AssignmentRule>(`/assignment-rules/${id}`, input);
  return data;
}
