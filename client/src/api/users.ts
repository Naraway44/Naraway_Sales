import { api } from "./client";
import { Paginated, Role, User } from "./types";

export async function listUsers(params: { teamId?: string; role?: Role; page?: number } = {}) {
  const { data } = await api.get<Paginated<User>>("/users", { params });
  return data;
}

export async function createUser(input: {
  name: string;
  email: string;
  password: string;
  role: Role;
  teamId?: string | null;
  requirePasswordChange?: boolean;
  leadCapacity?: number;
}) {
  const { data } = await api.post<{ user: User }>("/users", input);
  return data;
}

export async function updateUser(
  id: string,
  input: Partial<Pick<User, "name" | "role" | "isActive" | "leadCapacity">> & { teamId?: string | null }
) {
  const { data } = await api.patch<User>(`/users/${id}`, input);
  return data;
}

/** Permanently removes the account — they can no longer log in. Cannot be undone. */
export async function deleteUser(id: string) {
  await api.delete(`/users/${id}`);
}
