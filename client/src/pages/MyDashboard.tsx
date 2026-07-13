import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getMyOverview } from "@/api/analytics";
import { STATUS_LABELS } from "@/api/types";
import { Card } from "@/components/Card";

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" | "default" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

export function MyDashboardPage() {
  const { data, isLoading } = useQuery({ queryKey: ["analytics-me"], queryFn: getMyOverview });

  if (isLoading) return <p className="text-muted-foreground">Loading your dashboard...</p>;
  if (!data) return <p className="text-destructive">Could not load your dashboard.</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">My Dashboard</h1>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard
          label="Overdue Follow-ups"
          value={data.followUps.overdue}
          tone={data.followUps.overdue > 0 ? "warn" : "default"}
        />
        <StatCard label="Today's Follow-ups" value={data.followUps.today} />
        <StatCard label="Upcoming Follow-ups" value={data.followUps.upcoming} />
        <StatCard label="My Leads" value={data.assignedLeads} />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <StatCard label="Contacted" value={data.contactedLeads} sub={`${data.notYetContacted} not yet contacted`} />
        <StatCard label="Won" value={data.wonLeads} sub={`${data.conversionRate}% conversion rate`} />
        <StatCard label="Lost" value={data.lostLeads} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">My Leads by Status</h2>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {Object.entries(data.byStatus).map(([status, count]) => (
            <div key={status} className="rounded-md bg-muted/50 p-3 text-center">
              <div className="text-lg font-semibold">{count}</div>
              <div className="text-xs text-muted-foreground">{STATUS_LABELS[status as keyof typeof STATUS_LABELS]}</div>
            </div>
          ))}
          {Object.keys(data.byStatus).length === 0 && (
            <p className="col-span-full text-sm text-muted-foreground">No leads assigned to you yet.</p>
          )}
        </div>
      </Card>

      <div className="flex justify-end">
        <Link to="/leads" className="text-sm text-primary underline">
          View all my leads
        </Link>
      </div>
    </div>
  );
}
