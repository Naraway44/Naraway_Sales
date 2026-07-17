import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { exportLeads, listLeads } from "@/api/leads";
import { listLeadSources, listServices } from "@/api/lookups";
import { listUsers } from "@/api/users";
import { LEAD_STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Select } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";
import { ImportLeadsDialog } from "@/pages/ImportLeadsDialog";
import { BulkAssignBar } from "@/pages/BulkAssignBar";

export function LeadsListPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [ownerId, setOwnerId] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [sourceId, setSourceId] = useState("");
  const [state, setState] = useState("");
  const [unassigned, setUnassigned] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [importOpen, setImportOpen] = useState(false);
  const pageSize = 25;
  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";
  const canImport = user?.role === "FOUNDER";
  const [sortBy, sortDir] = sort.split(":");
  const params = { search, status: status || undefined, priority: priority || undefined, ownerId: ownerId || undefined, serviceId: serviceId || undefined, sourceId: sourceId || undefined, state: state || undefined, unassigned: unassigned || undefined, createdFrom: createdFrom || undefined, createdTo: createdTo || undefined, sortBy, sortDir: sortDir as "asc" | "desc", page, pageSize };
  const { data, isLoading, isError, error } = useQuery({ queryKey: ["leads", params], queryFn: () => listLeads(params) });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });
  const { data: sources } = useQuery({ queryKey: ["lead-sources"], queryFn: listLeadSources });
  const { data: usersData } = useQuery({ queryKey: ["users-all"], queryFn: () => listUsers({ page: 1 }), enabled: canManage });
  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const allSelected = useMemo(() => !!data?.items.length && data.items.every((lead) => selected.includes(lead.id)), [data, selected]);

  function resetFilters() {
    setSearch(""); setStatus(""); setPriority(""); setOwnerId(""); setServiceId(""); setSourceId(""); setState(""); setUnassigned(false); setCreatedFrom(""); setCreatedTo(""); setSort("createdAt:desc"); setPage(1);
  }
  function toggleAll() { if (data) setSelected(allSelected ? [] : data.items.map((lead) => lead.id)); }
  function toggleOne(id: string) { setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function handleExport() { try { await exportLeads(params); showToast("Lead export downloaded."); } catch (exportError) { showToast(getErrorMessage(exportError, "Could not export leads."), "error"); } }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl font-semibold">Leads</h1>
        {canManage && <div className="flex flex-wrap gap-2">
          {canImport && <Button variant="secondary" onClick={() => setImportOpen(true)}>Import CSV</Button>}
          <Button variant="secondary" onClick={handleExport}>Export CSV</Button>
          <Link to="/leads/new"><Button>New Lead</Button></Link>
        </div>}
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap gap-2">
          <Input placeholder="Search company, contact, phone, email..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} className="min-w-[220px] flex-1 sm:max-w-xs" />
          <Select value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }} className="max-w-[180px]"><option value="">All statuses</option>{LEAD_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select>
          <Select value={priority} onChange={(event) => { setPriority(event.target.value); setPage(1); }} className="max-w-[160px]"><option value="">All priorities</option><option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option></Select>
          {canManage && <Select value={ownerId} onChange={(event) => { setOwnerId(event.target.value); setPage(1); }} className="max-w-[200px]"><option value="">All owners</option>{usersData?.items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.employeeId})</option>)}</Select>}
          <Select value={serviceId} onChange={(event) => { setServiceId(event.target.value); setPage(1); }} className="max-w-[200px]"><option value="">All services</option>{services?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
          <Select value={sourceId} onChange={(event) => { setSourceId(event.target.value); setPage(1); }} className="max-w-[200px]"><option value="">All sources</option>{sources?.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select>
          <Input placeholder="State" value={state} onChange={(event) => { setState(event.target.value); setPage(1); }} className="max-w-[150px]" />
          <div className="flex items-center gap-1">
            <Input type="date" title="Added from" value={createdFrom} onChange={(event) => { setCreatedFrom(event.target.value); setPage(1); }} className="max-w-[150px]" />
            <span className="text-xs text-muted-foreground">to</span>
            <Input type="date" title="Added to" value={createdTo} onChange={(event) => { setCreatedTo(event.target.value); setPage(1); }} className="max-w-[150px]" />
          </div>
          {canManage && <label className="flex items-center gap-2 px-2 text-sm text-muted-foreground"><input type="checkbox" checked={unassigned} onChange={(event) => { setUnassigned(event.target.checked); setPage(1); }} /> Unassigned</label>}
          <Select value={sort} onChange={(event) => { setSort(event.target.value); setPage(1); }} className="max-w-[210px]"><option value="createdAt:desc">Newest first</option><option value="createdAt:asc">Oldest first</option><option value="companyName:asc">Company A-Z</option><option value="nextFollowUp:asc">Follow-up soonest</option><option value="expectedDealValue:desc">Highest deal value</option></Select>
          <Button variant="ghost" onClick={resetFilters}>Clear filters</Button>
        </div>
      </Card>

      {canManage && selected.length > 0 && <BulkAssignBar selectedIds={selected} users={usersData?.items ?? []} onDone={() => { setSelected([]); qc.invalidateQueries({ queryKey: ["leads"] }); }} />}
      <Card className="overflow-x-auto">
        <table className="w-full text-sm"><thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground"><tr>
          {canManage && <th className="w-8 px-3 py-2"><input aria-label="Select all leads" type="checkbox" checked={allSelected} onChange={toggleAll} /></th>}
          <th className="px-3 py-2">Company</th><th className="hidden px-3 py-2 md:table-cell">Contact</th><th className="hidden px-3 py-2 lg:table-cell">Phone</th><th className="hidden px-3 py-2 lg:table-cell">Service</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Status</th><th className="hidden px-3 py-2 sm:table-cell">Priority</th><th className="hidden px-3 py-2 md:table-cell">Next Follow-up</th><th className="hidden px-3 py-2 md:table-cell">Added</th>
        </tr></thead><tbody>
          {isLoading && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">Loading leads...</td></tr>}
          {isError && <tr><td colSpan={9} className="px-3 py-6 text-center text-destructive">{getErrorMessage(error, "Could not load leads.")}</td></tr>}
          {!isLoading && !isError && data?.items.length === 0 && <tr><td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">No leads match these filters.</td></tr>}
          {data?.items.map((lead) => <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/40">
            {canManage && <td className="px-3 py-2"><input aria-label={`Select ${lead.companyName}`} type="checkbox" checked={selected.includes(lead.id)} onChange={() => toggleOne(lead.id)} /></td>}
            <td className="px-3 py-2 font-medium"><Link to={`/leads/${lead.id}`} className="hover:text-primary">{lead.companyName}</Link></td><td className="hidden px-3 py-2 md:table-cell">{lead.contactPerson}</td><td className="hidden px-3 py-2 lg:table-cell">{lead.phone}</td><td className="hidden px-3 py-2 lg:table-cell">{lead.service?.name ?? "-"}</td><td className="px-3 py-2">{lead.owner?.name ?? <span className="text-muted-foreground">Unassigned</span>}</td><td className="px-3 py-2"><Badge className={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Badge></td><td className="hidden px-3 py-2 sm:table-cell"><Badge className={PRIORITY_COLORS[lead.priority]}>{lead.priority}</Badge></td><td className="hidden px-3 py-2 md:table-cell">{lead.nextFollowUp ? new Date(lead.nextFollowUp).toLocaleDateString() : "-"}</td><td className="hidden px-3 py-2 md:table-cell">{new Date(lead.createdAt).toLocaleDateString()}</td>
          </tr>)}
        </tbody></table>
      </Card>
      <div className="flex flex-col gap-3 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between"><span>{data?.total ?? 0} total leads</span><div className="flex items-center gap-2"><Button variant="secondary" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>Previous</Button><span>Page {page} of {totalPages}</span><Button variant="secondary" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>Next</Button></div></div>
      {importOpen && <ImportLeadsDialog onClose={() => setImportOpen(false)} onImported={() => { setImportOpen(false); qc.invalidateQueries({ queryKey: ["leads"] }); }} />}
    </div>
  );
}
