import { useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAnalyticsByUser, getAnalyticsOverview, getOrgNeglectedLeads } from "@/api/analytics";
import { listPendingLeadRequests, resolveLeadRequest } from "@/api/leadRequests";
import { STATUS_LABELS } from "@/api/types";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/errors";

type NeglectedFilter = { type: "owner" | "service"; id: string } | null;

function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function DashboardPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { data: overview } = useQuery({ queryKey: ["analytics-overview"], queryFn: getAnalyticsOverview });
  const { data: byUser } = useQuery({ queryKey: ["analytics-by-user"], queryFn: getAnalyticsByUser });
  const { data: pendingRequests } = useQuery({ queryKey: ["lead-requests-pending"], queryFn: listPendingLeadRequests });
  const { data: neglected } = useQuery({ queryKey: ["org-neglected-leads"], queryFn: getOrgNeglectedLeads });
  const [neglectedFilter, setNeglectedFilter] = useState<NeglectedFilter>(null);

  const filteredWorst20 =
    neglected?.worst20.filter((l) => {
      if (!neglectedFilter) return true;
      if (neglectedFilter.type === "owner") return l.ownerId === neglectedFilter.id;
      return l.serviceId === neglectedFilter.id;
    }) ?? [];

  const resolveMutation = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => resolveLeadRequest(id, approve),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ["lead-requests-pending"] });
      showToast(
        result.request.status === "APPROVED"
          ? `Approved — ${result.assignedCount} lead(s) assigned.`
          : "Request denied."
      );
    },
    onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not resolve request."), "error"),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      {pendingRequests && pendingRequests.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Pending Lead Requests</h2>
          <div className="space-y-2">
            {pendingRequests.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-md border border-border p-3">
                <div>
                  <div className="text-sm font-medium">
                    {r.user?.name} <span className="font-mono text-xs text-muted-foreground">({r.user?.employeeId})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Requested {new Date(r.requestedAt).toLocaleString()}
                    {r.note ? ` — "${r.note}"` : ""}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    onClick={() => resolveMutation.mutate({ id: r.id, approve: false })}
                    disabled={resolveMutation.isPending}
                  >
                    Deny
                  </Button>
                  <Button
                    onClick={() => resolveMutation.mutate({ id: r.id, approve: true })}
                    disabled={resolveMutation.isPending}
                  >
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {neglected && neglected.totalNeglected > 0 && (
        <Card className="p-5">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-destructive">Neglected Leads — Org-wide</h2>
            <span className="text-xs text-muted-foreground">{neglected.totalNeglected} total, untouched 5+ days</span>
          </div>
          <p className="mb-3 text-xs text-muted-foreground">
            Click a rep or service to filter the list below — click again to clear.
          </p>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">By Rep</h3>
              <div className="space-y-1">
                {neglected.byOwner.map((o) => {
                  const active = neglectedFilter?.type === "owner" && neglectedFilter.id === o.ownerId;
                  return (
                    <button
                      key={o.ownerId}
                      onClick={() => setNeglectedFilter(active ? null : { type: "owner", id: o.ownerId })}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${active ? "bg-muted" : ""}`}
                    >
                      <span>
                        {o.ownerName} <span className="text-xs text-muted-foreground">({o.employeeId})</span>
                      </span>
                      <span className="text-xs font-medium text-destructive">
                        {o.count} · oldest {o.oldestDays}d
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">By Service</h3>
              <div className="space-y-1">
                {neglected.byService.map((s) => {
                  const key = s.serviceId ?? "none";
                  const active = neglectedFilter?.type === "service" && neglectedFilter.id === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setNeglectedFilter(active ? null : { type: "service", id: key })}
                      className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-sm hover:bg-muted ${active ? "bg-muted" : ""}`}
                    >
                      <span>{s.serviceName}</span>
                      <span className="text-xs font-medium text-destructive">
                        {s.count} · oldest {s.oldestDays}d
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="mt-4">
            <h3 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">
              Worst 20 (oldest first){neglectedFilter ? ` — filtered` : ""}
            </h3>
            <div className="space-y-1.5">
              {filteredWorst20.map((l) => (
                <Link
                  key={l.id}
                  to={`/leads/${l.id}`}
                  className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm hover:bg-red-100"
                >
                  <span>
                    {l.companyName}{" "}
                    <span className="text-xs text-muted-foreground">
                      — {l.ownerName} · {l.serviceName}
                    </span>
                  </span>
                  <span className="text-xs text-destructive">{l.daysSinceUpdate}d</span>
                </Link>
              ))}
              {filteredWorst20.length === 0 && (
                <p className="text-sm text-muted-foreground">No leads match this filter.</p>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Total Leads" value={overview?.totalLeads ?? "-"} />
        <StatCard
          label="Contacted"
          value={overview?.contactedLeads ?? "-"}
          sub={overview ? `${overview.notYetContacted} not yet contacted` : undefined}
        />
        <StatCard label="Won" value={overview?.wonLeads ?? "-"} sub={overview ? `${overview.conversionRate}% conversion` : undefined} />
        <StatCard label="Unassigned" value={overview?.unassignedLeads ?? "-"} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Lead Status Breakdown</h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {overview &&
            Object.entries(overview.byStatus).map(([status, count]) => (
              <div key={status} className="rounded-md bg-muted/50 p-3 text-center">
                <div className="text-lg font-semibold">{count}</div>
                <div className="text-xs text-muted-foreground">{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</div>
              </div>
            ))}
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">Lead Quality - Organic vs Inorganic</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Based on each lead source's Organic/Inorganic tag (set under Settings, Lead Sources).
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-md border border-border p-4">
            <div className="text-xs text-muted-foreground">Organic</div>
            <div className="text-2xl font-semibold">{overview?.leadQuality.organic.count ?? "-"}</div>
            <div className="text-xs text-muted-foreground">
              {overview?.leadQuality.organic.won ?? 0} won | {overview?.leadQuality.organic.conversionRate ?? 0}% conversion
            </div>
          </div>
          <div className="rounded-md border border-border p-4">
            <div className="text-xs text-muted-foreground">Inorganic</div>
            <div className="text-2xl font-semibold">{overview?.leadQuality.inorganic.count ?? "-"}</div>
            <div className="text-xs text-muted-foreground">
              {overview?.leadQuality.inorganic.won ?? 0} won | {overview?.leadQuality.inorganic.conversionRate ?? 0}% conversion
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto p-0">
        <div className="border-b border-border p-4">
          <h2 className="text-sm font-semibold">Sales Team Performance</h2>
          <p className="text-xs text-muted-foreground">Each lead has exactly one owner - no duplicate effort across the team.</p>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Team</th>
              <th className="px-3 py-2">Assigned</th>
              <th className="px-3 py-2">Contacted</th>
              <th className="px-3 py-2">Won</th>
              <th className="px-3 py-2">Lost</th>
              <th className="px-3 py-2">Conversion</th>
              <th className="px-3 py-2">Last Active</th>
            </tr>
          </thead>
          <tbody>
            {byUser?.map((u) => (
              <tr key={u.userId} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-medium">
                  {u.name} <span className="font-mono text-xs text-muted-foreground">({u.employeeId})</span>
                </td>
                <td className="px-3 py-2">{u.team ?? "-"}</td>
                <td className="px-3 py-2">{u.assignedLeads}</td>
                <td className="px-3 py-2">{u.contactedLeads}</td>
                <td className="px-3 py-2">{u.wonLeads}</td>
                <td className="px-3 py-2">{u.lostLeads}</td>
                <td className="px-3 py-2">{u.conversionRate}%</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {u.lastActiveAt ? new Date(u.lastActiveAt).toLocaleString() : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
