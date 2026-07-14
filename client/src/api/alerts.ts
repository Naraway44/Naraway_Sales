import { api } from "./client";

export interface AlertItem {
  id: string;
  severity: "warning" | "critical";
  title: string;
  message: string;
  link: { type: "user" | "lead" | "self"; id: string };
}

export async function getAlerts() {
  const { data } = await api.get<AlertItem[]>("/analytics/alerts");
  return data;
}
