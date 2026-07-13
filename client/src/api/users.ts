import { api } from "./client";
import { Paginated, Role, User } from "./types";

export async function listUsers(params: { teamId?: string; role?: Role; page?: number } = {}) {
  const { data } = await api.get<Paginated<User>>("/users", { params });
  return data;
}

export async function createUser(input: {
  name: string;
  email: string;
  role: Role;
  teamId?: string | null;
}) {
  const { data } = await api.post<{ user: User; tempPassword: string }>("/users", input);
  return data;
}

export async function updateUser(id: string, input: Partial<Pick<User, "name" | "role" | "isActive">> & { teamId?: string | null }) {
  const { data } = await api.patch<User>(`/users/${id}`, input);
  return data;
}
