import { useState } from "react";
import { startOfMonth } from "date-fns";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getMyOverview } from "@/api/analytics";
import { getMyAttendance } from "@/api/attendance";
import { createLeadRequest } from "@/api/leadRequests";
import { STATUS_LABELS } from "@/api/types";
import { AttendanceCalendar } from "@/components/AttendanceCalendar";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Textarea } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";

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
  const { user } = useAuth();
  const { showToast } = useToast();
  const { data, isLoading } = useQuery({ queryKey: ["analytics-me"], queryFn: getMyOverview });
  const [requestNote, setRequestNote] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);
  const [attendanceMonth, setAttendanceMonth] = useState(() => startOfMonth(new Date()));
  const monthParam = `${attendanceMonth.getFullYear()}-${String(attendanceMonth.getMonth() + 1).padStart(2, "0")}`;
  const { data: attendanceDays, isLoading: attendanceLoading } = useQuery({
    queryKey: ["my-attendance", monthParam],
    queryFn: () => getMyAttendance(monthParam),
  });

  const requestMutation = useMutation({
    mutationFn: () => createLeadRequest(requestNote || undefined),
    onSuccess: () => {
      showToast("Request sent — your manager will review it.");
      setRequestNote("");
      setRequestOpen(false);
    },
    onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not submit request."), "error"),
  });

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

      <AttendanceCalendar
        month={attendanceMonth}
        onMonthChange={setAttendanceMonth}
        days={attendanceDays}
        isLoading={attendanceLoading}
      />

      {user?.role !== "FOUNDER" && (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold">Need more leads?</h2>
              <p className="text-xs text-muted-foreground">
                Once you've called through your current book, request a top-up — a manager will approve it.
              </p>
            </div>
            {!requestOpen && (
              <Button variant="secondary" onClick={() => setRequestOpen(true)}>
                Request More Leads
              </Button>
            )}
          </div>
          {requestOpen && (
            <div className="mt-3 space-y-2">
              <Textarea
                placeholder="Optional note for your manager..."
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                rows={2}
              />
              <div className="flex justify-end gap-2">
                <Button variant="secondary" onClick={() => setRequestOpen(false)} disabled={requestMutation.isPending}>
                  Cancel
                </Button>
                <Button onClick={() => requestMutation.mutate()} disabled={requestMutation.isPending}>
                  {requestMutation.isPending ? "Sending..." : "Send Request"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <div className="flex justify-end">
        <Link to="/leads" className="text-sm text-primary underline">
          View all my leads
        </Link>
      </div>
    </div>
  );
}
