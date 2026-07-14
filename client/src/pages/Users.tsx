import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, deleteUser, listUsers, updateUser } from "@/api/users";
import { listTeams } from "@/api/lookups";
import { Role } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label, Select } from "@/components/Input";
import { Badge } from "@/components/Badge";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuth } from "@/lib/auth";

export function UsersPage() {
  const qc = useQueryClient();
  const { user: currentUser } = useAuth();
  const canCreate = currentUser?.role === "FOUNDER";
  const canDelete = (targetRole: Role) => currentUser?.role === "FOUNDER" || targetRole === "EXECUTIVE";
  const { data } = useQuery({ queryKey: ["users-all"], queryFn: () => listUsers({ page: 1 }) });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["users-all"] });
    },
  });
  const capacityMutation = useMutation({
    mutationFn: ({ id, leadCapacity }: { id: string; leadCapacity: number }) => updateUser(id, { leadCapacity }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users-all"] }),
  });
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "EXECUTIVE" as Role,
    teamId: "",
    requirePasswordChange: true,
    leadCapacity: 60,
  });
  const [created, setCreated] = useState<{ employeeId: string } | null>(null);
  const [createError, setCreateError] = useState("");

  const createMutation = useMutation({
    mutationFn: () => createUser({ ...form, teamId: form.teamId || null }),
    onSuccess: (result) => {
      setCreated({ employeeId: result.user.employeeId });
      setCreateError("");
      setForm({ name: "", email: "", password: "", role: "EXECUTIVE", teamId: "", requirePasswordChange: true, leadCapacity: 60 });
      qc.invalidateQueries({ queryKey: ["users-all"] });
    },
    onError: (err: any) => {
      setCreateError(err.response?.data?.error ?? "Could not create account");
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className={`overflow-x-auto p-0 ${canCreate ? "col-span-2" : "col-span-3"}`}>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Employee ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Capacity</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{u.employeeId}</td>
                <td className="px-3 py-2">
                  <Link to={`/users/${u.id}`} className="hover:text-primary hover:underline">
                    {u.name}
                  </Link>
                </td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.team?.name ?? "-"}</td>
                <td className="px-3 py-2">
                  {canCreate && u.role === "EXECUTIVE" ? (
                    <Input
                      type="number"
                      min={1}
                      max={500}
                      defaultValue={u.leadCapacity}
                      className="w-20"
                      onBlur={(e) => {
                        const value = Number(e.target.value);
                        if (value !== u.leadCapacity) capacityMutation.mutate({ id: u.id, leadCapacity: value });
                      }}
                    />
                  ) : (
                    u.leadCapacity
                  )}
                </td>
                <td className="px-3 py-2">
                  <Badge className={u.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>
                    {u.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
                <td className="px-3 py-2 text-right">
                  {u.id !== currentUser?.id && canDelete(u.role) && (
                    <button
                      onClick={() => setDeleteTarget({ id: u.id, name: u.name })}
                      className="text-xs text-muted-foreground hover:text-destructive"
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {canCreate && (
      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Add Sales Associate</h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <Label>Name</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Password</Label>
            <Input
              type="password"
              required
              minLength={8}
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="At least 8 characters"
            />
          </div>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={form.requirePasswordChange}
              onChange={(e) => setForm({ ...form, requirePasswordChange: e.target.checked })}
            />
            Require password change on first login
          </label>
          <div>
            <Label>Role</Label>
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="EXECUTIVE">Sales Executive</option>
              <option value="MANAGER">Sales Manager</option>
              <option value="FOUNDER">Founder</option>
            </Select>
          </div>
          <div>
            <Label>Team</Label>
            <Select value={form.teamId} onChange={(e) => setForm({ ...form, teamId: e.target.value })}>
              <option value="">None</option>
              {teams?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Lead Capacity (max open leads at once)</Label>
            <Input
              type="number"
              min={1}
              max={500}
              value={form.leadCapacity}
              onChange={(e) => setForm({ ...form, leadCapacity: Number(e.target.value) })}
            />
          </div>
          {createError && <p className="text-sm text-destructive">{createError}</p>}
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
        </form>

        {created && (
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">
              Account created (ID: <span className="font-mono">{created.employeeId}</span>). Share the password you set
              with them directly.
            </p>
          </div>
        )}
      </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this account?"
        description={`${deleteTarget?.name} will be permanently removed and can no longer log in. Their past leads/comments stay in history but show as "Deleted user". This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete account"}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
