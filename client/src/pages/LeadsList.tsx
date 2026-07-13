import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { listLeads, exportLeadsUrl } from "@/api/leads";
import { listServices } from "@/api/lookups";
import { listUsers } from "@/api/users";
import { LEAD_STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Select } from "@/components/Input";
import { useAuth } from "@/lib/auth";
import { ImportLeadsDialog } from "@/pages/ImportLeadsDialog";
import { BulkAssignBar } from "@/pages/BulkAssignBar";

export function LeadsListPage() {
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const pageSize = 25;
  const qc = useQueryClient();

  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";

  const params = {
    search,
    status: status || undefined,
    ownerId: ownerId || undefined,
    serviceId: serviceId || undefined,
    page,
    pageSize,
  };

  const { data, isLoading } = useQuery({
    queryKey: ["leads", params],
    queryFn: () => listLeads(params),
  });

  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });
  const { data: usersData } = useQuery({
    queryKey: ["users-all"],
    queryFn: () => listUsers({ page: 1 }),
    enabled: canManage,
  });

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  const allSelected = useMemo(
    () => !!data?.items.length && data.items.every((l) => selected.includes(l.id)),
    [data, selected]
  );

  function toggleAll() {
    if (!data) return;
    setSelected(allSelected ? [] : data.items.map((l) => l.id));
  }

  function toggleOne(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        {canManage && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              Import CSV
            </Button>
            <a href={exportLeadsUrl(params)} target="_blank" rel="noreferrer">
              <Button variant="secondary">Export CSV</Button>
            </a>
            <Link to="/leads/new">
              <Button>New Lead</Button>
            </Link>
          </div>
        )}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <Input
            placeholder="Search company, contact, phone, email..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            className="max-w-xs"
          />
          <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="max-w-[180px]">
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          {canManage && (
            <Select value={ownerId} onChange={(e) => { setOwnerId(e.target.value); setPage(1); }} className="max-w-[200px]">
              <option value="">All owners</option>
              {usersData?.items.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.employeeId})
                </option>
              ))}
            </Select>
          )}
          <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setPage(1); }} className="max-w-[200px]">
            <option value="">All services</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      {canManage && selected.length > 0 && (
        <BulkAssignBar
          selectedIds={selected}
          users={usersData?.items ?? []}
          onDone={() => {
            setSelected([]);
            qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              {canManage && (
                <th className="w-8 px-3 py-2">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll} />
                </th>
              )}
              <th className="px-3 py-2">Company</th>
              <th className="px-3 py-2">Contact</th>
              <th className="px-3 py-2">Phone</th>
              <th className="px-3 py-2">Service</th>
              <th className="px-3 py-2">Owner</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Next Follow-up</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  Loading...
                </td>
              </tr>
            )}
            {!isLoading && data?.items.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                  No leads found.
                </td>
              </tr>
            )}
            {data?.items.map((lead) => (
              <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/40">
                {canManage && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(lead.id)}
                      onChange={() => toggleOne(lead.id)}
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-medium">
                  <Link to={`/leads/${lead.id}`} className="hover:text-primary">
                    {lead.companyName}
                  </Link>
                </td>
                <td className="px-3 py-2">{lead.contactPerson}</td>
                <td className="px-3 py-2">{lead.phone}</td>
                <td className="px-3 py-2">{lead.service?.name ?? "—"}</td>
                <td className="px-3 py-2">{lead.owner ? `${lead.owner.name}` : <span className="text-muted-foreground">Unassigned</span>}</td>
                <td className="px-3 py-2">
                  <Badge className={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Badge>
                </td>
                <td className="px-3 py-2">
                  <Badge className={PRIORITY_COLORS[lead.priority]}>{lead.priority}</Badge>
                </td>
                <td className="px-3 py-2">
                  {lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleDateString() : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{data?.total ?? 0} total leads</span>
        <div className="flex items-center gap-2">
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)}>
            Next
          </Button>
        </div>
      </div>

      {importOpen && (
        <ImportLeadsDialog
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false);
            qc.invalidateQueries({ queryKey: ["leads"] });
          }}
        />
      )}
    </div>
  );
}
