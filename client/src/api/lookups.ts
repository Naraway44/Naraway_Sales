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

export async function listServices() {
  const { data } = await api.get<Service[]>("/services");
  return data;
}

export async function createService(name: string) {
  const { data } = await api.post<Service>("/services", { name });
  return data;
}

export async function listLeadSources() {
  const { data } = await api.get<LeadSource[]>("/lead-sources");
  return data;
}

export async function createLeadSource(name: string) {
  const { data } = await api.post<LeadSource>("/lead-sources", { name });
  return data;
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
