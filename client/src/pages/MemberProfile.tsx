import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getMemberProfile } from "@/api/analytics";
import { Card } from "@/components/Card";
import { Badge } from "@/components/Badge";

// Fixed-order categorical colors (never cycled), reference palette from the dataviz skill.
const OUTCOME_COLORS: Record<string, string> = {
  CONNECTED: "#2a78d6", // blue
  NO_ANSWER: "#1baf7a", // aqua
  VOICEMAIL: "#eda100", // yellow
  CALL_BACK_LATER: "#008300", // green
  WRONG_NUMBER: "#4a3aa7", // violet
  UNKNOWN: "#8a8a86",
};

const OUTCOME_LABELS: Record<string, string> = {
  CONNECTED: "Connected",
  NO_ANSWER: "No Answer",
  VOICEMAIL: "Voicemail",
  CALL_BACK_LATER: "Call Back Later",
  WRONG_NUMBER: "Wrong Number",
  UNKNOWN: "Unknown",
};

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: "warn" }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-2xl font-semibold ${tone === "warn" ? "text-destructive" : ""}`}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export function MemberProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { data, isLoading, isError } = useQuery({
    queryKey: ["member-profile", id],
    queryFn: () => getMemberProfile(id!),
    enabled: !!id,
  });

  if (isLoading) return <p className="text-muted-foreground">Loading profile...</p>;
  if (isError || !data) return <p className="text-destructive">Could not load this member's profile.</p>;

  const maxOutcomeCount = Math.max(1, ...Object.values(data.callStats.byOutcome));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            {data.user.name} <span className="font-mono text-sm text-muted-foreground">({data.user.employeeId})</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {data.user.email} · {data.user.role} · {data.user.team ?? "No team"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={data.user.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}>
            {data.user.isActive ? "Active" : "Inactive"}
          </Badge>
          <Link to="/users" className="text-sm text-primary underline">
            Back to Team
          </Link>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Last login: {data.user.lastLoginAt ? new Date(data.user.lastLoginAt).toLocaleString() : "Never"}
      </p>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Lead Performance</h2>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
          <StatCard label="Assigned" value={data.leadStats.assignedLeads} />
          <StatCard label="Contacted" value={data.leadStats.contactedLeads} />
          <StatCard label="Won" value={data.leadStats.wonLeads} />
          <StatCard label="Lost" value={data.leadStats.lostLeads} />
          <StatCard label="Conversion" value={`${data.leadStats.conversionRate}%`} />
        </div>
        <div className="mt-4">
          <StatCard
            label="Avg. Response Time (creation to first contact)"
            value={data.leadStats.avgResponseTimeHours !== null ? `${data.leadStats.avgResponseTimeHours}h` : "No data yet"}
          />
        </div>
      </Card>

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-semibold">Check-in / Check-out Activity</h2>
        <p className="mb-3 text-xs text-muted-foreground">Time logged into the portal, rolled up from daily sessions.</p>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <StatCard label="Today" value={formatMinutes(data.sessions.todayMinutes)} />
          <StatCard label="This Week" value={formatMinutes(data.sessions.thisWeekMinutes)} />
          <StatCard label="This Month" value={formatMinutes(data.sessions.thisMonthMinutes)} />
          <StatCard label="This Year" value={formatMinutes(data.sessions.thisYearMinutes)} />
        </div>

        {data.sessions.recent.length > 0 && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="border-b border-border text-left uppercase text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Check-in</th>
                  <th className="py-1.5 pr-3">Check-out</th>
                  <th className="py-1.5">Duration</th>
                </tr>
              </thead>
              <tbody>
                {data.sessions.recent.map((s, idx) => (
                  <tr key={idx} className="border-b border-border last:border-0">
                    <td className="py-1.5 pr-3">{new Date(s.loginAt).toLocaleString()}</td>
                    <td className="py-1.5 pr-3">{s.logoutAt ? new Date(s.logoutAt).toLocaleString() : "(session open)"}</td>
                    <td className="py-1.5">{formatMinutes(s.durationMinutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Calls Logged</h2>
          <p className="mb-3 text-xs text-muted-foreground">{data.callStats.total} total calls</p>
          {data.callStats.total === 0 ? (
            <p className="text-sm text-muted-foreground">No calls logged yet.</p>
          ) : (
            <div className="space-y-2">
              {Object.entries(data.callStats.byOutcome).map(([outcome, count]) => (
                <div key={outcome} className="flex items-center gap-3 text-sm">
                  <span className="w-32 shrink-0 text-xs text-muted-foreground">{OUTCOME_LABELS[outcome] ?? outcome}</span>
                  <div className="h-3 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(count / maxOutcomeCount) * 100}%`,
                        backgroundColor: OUTCOME_COLORS[outcome] ?? OUTCOME_COLORS.UNKNOWN,
                      }}
                    />
                  </div>
                  <span className="w-6 shrink-0 text-right font-medium">{count}</span>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold">Lead Engagement</h2>
          <p className="mb-3 text-xs text-muted-foreground">How many lead profiles they've actually opened.</p>
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Profile Views (all-time)" value={data.viewStats.totalViews} />
            <StatCard label="Unique Leads Opened" value={data.viewStats.uniqueLeadsViewed} />
          </div>
        </Card>
      </div>

      {data.neglectedLeads.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-1 text-sm font-semibold text-destructive">Neglected Leads</h2>
          <p className="mb-3 text-xs text-muted-foreground">Open leads untouched for 5+ days.</p>
          <div className="space-y-2">
            {data.neglectedLeads.map((lead) => (
              <Link
                key={lead.id}
                to={`/leads/${lead.id}`}
                className="flex items-center justify-between rounded-md bg-red-50 px-3 py-2 text-sm hover:bg-red-100"
              >
                <span>{lead.companyName}</span>
                <span className="text-xs text-destructive">{lead.daysSinceUpdate} days untouched</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Recent Activity</h2>
        <ol className="space-y-3 border-l border-border pl-4">
          {data.recentActivity.map((a) => (
            <li key={a.id} className="text-sm">
              <div className="font-medium">
                {a.action.replace(/_/g, " ")} —{" "}
                <Link to={`/leads/${a.leadId}`} className="text-primary underline">
                  {a.leadCompanyName}
                </Link>
              </div>
              {a.notes && <div className="text-muted-foreground">{a.notes}</div>}
              <div className="text-xs text-muted-foreground">{new Date(a.timestamp).toLocaleString()}</div>
            </li>
          ))}
          {data.recentActivity.length === 0 && <li className="text-sm text-muted-foreground">No activity recorded.</li>}
        </ol>
      </Card>
    </div>
  );
}
