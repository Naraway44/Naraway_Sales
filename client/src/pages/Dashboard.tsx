import { useQuery } from "@tanstack/react-query";
import { getAnalyticsByUser, getAnalyticsOverview } from "@/api/analytics";
import { STATUS_LABELS } from "@/api/types";
import { Card } from "@/components/Card";

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
  const { data: overview } = useQuery({ queryKey: ["analytics-overview"], queryFn: getAnalyticsOverview });
  const { data: byUser } = useQuery({ queryKey: ["analytics-by-user"], queryFn: getAnalyticsByUser });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

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
