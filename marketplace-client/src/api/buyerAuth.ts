import { api } from "./client";
import { Buyer } from "./types";

export interface SignupInput {
  name: string;
  company?: string;
  email: string;
  phone?: string;
  password: string;
}

export async function signup(input: SignupInput) {
  const { data } = await api.post<{ token: string; buyer: Buyer; verificationEmailSent: boolean }>(
    "/buyer-auth/signup",
    input
  );
  return data;
}

export async function verifyEmail(token: string) {
  const { data } = await api.post<Buyer>("/buyer-auth/verify-email", { token });
  return data;
}

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
