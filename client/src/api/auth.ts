import { api } from "./client";
import { User } from "./types";

export async function login(email: string, password: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/login", {
    email,
    password,
  });
  return data;
}

export async function changePassword(currentPassword: string, newPassword: string) {
  const { data } = await api.post<{ token: string; user: User }>("/auth/change-password", {
    currentPassword,
    newPassword,
  });
  return data;
}

export async function fetchMe() {
  const { data } = await api.get<User>("/auth/me");
  return data;
}

export async function logout() {
  await api.post("/auth/logout");
}

export async function sendHeartbeat() {
  await api.post("/auth/heartbeat");
}
