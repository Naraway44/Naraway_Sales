import { api } from "./client";
import { Buyer } from "./types";

export async function login(email: string, password: string) {
  const { data } = await api.post<{ token: string; buyer: Buyer }>("/buyer-auth/login", { email, password });
  return data;
}

export async function loginWithAuth0(idToken: string) {
  const { data } = await api.post<{ token: string; buyer: Buyer }>("/buyer-auth/auth0-login", { idToken });
  return data;
}

export async function fetchMe() {
  const { data } = await api.get<Buyer>("/buyer-auth/me");
  return data;
}
