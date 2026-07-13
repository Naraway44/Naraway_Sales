import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createUser, listUsers } from "@/api/users";
import { listTeams } from "@/api/lookups";
import { Role } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label, Select } from "@/components/Input";
import { Badge } from "@/components/Badge";

export function UsersPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["users-all"], queryFn: () => listUsers({ page: 1 }) });
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const [form, setForm] = useState({ name: "", email: "", role: "EXECUTIVE" as Role, teamId: "" });
  const [created, setCreated] = useState<{ employeeId: string; tempPassword: string } | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createUser({ ...form, teamId: form.teamId || null }),
    onSuccess: (result) => {
      setCreated({ employeeId: result.user.employeeId, tempPassword: result.tempPassword });
      setForm({ name: "", email: "", role: "EXECUTIVE", teamId: "" });
      qc.invalidateQueries({ queryKey: ["users-all"] });
    },
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="grid grid-cols-3 gap-6">
      <Card className="col-span-2 overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Employee ID</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((u) => (
              <tr key={u.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-mono text-xs">{u.employeeId}</td>
                <td className="px-3 py-2">{u.name}</td>
                <td className="px-3 py-2">{u.email}</td>
                <td className="px-3 py-2">{u.role}</td>
                <td className="px-3 py-2">{u.team?.name ?? "—"}</td>
                <td className="px-3 py-2">
                  <Badge className={u.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>
                    {u.isActive ? "Active" : "Inactive"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

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
          <Button type="submit" className="w-full" disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating..." : "Create Account"}
          </Button>
        </form>

        {created && (
          <div className="mt-4 rounded-md bg-muted p-3 text-sm">
            <p className="font-medium">Account created — share these credentials once:</p>
            <p>
              ID: <span className="font-mono">{created.employeeId}</span>
            </p>
            <p>
              Temp password: <span className="font-mono">{created.tempPassword}</span>
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}
