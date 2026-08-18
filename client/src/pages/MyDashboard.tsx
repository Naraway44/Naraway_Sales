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

function formatMinutes(mins: number) {
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
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

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayAttendance = attendanceDays?.find((d) => d.date === todayKey);
  const todayStatusLabel =
    todayAttendance?.status === "ON_TIME"
      ? "On time"
      : todayAttendance?.status === "LATE"
        ? "Late"
        : todayAttendance?.status === "ABSENT"
          ? "Absent"
          : todayAttendance?.status === "IN_PROGRESS"
            ? "In progress"
            : todayAttendance?.status === "DAY_OFF"
              ? "Day off"
              : "—";

  const hasOverdue = data.followUps.overdue > 0;
  const hasToday = data.followUps.today > 0;
  const hasNew = (data.byStatus.NEW ?? 0) > 0;
  const notContacted = data.notYetContacted;

  const queues = [
    {
      key: "overdue",
      title: "1. Overdue follow-ups",
      count: data.followUps.overdue,
      body: hasOverdue ? "Call these first — they're past due." : "You're clear here.",
      to: "/leads?overdueOnly=true&sort=nextFollowUp:asc",
      primary: hasOverdue,
      warn: hasOverdue,
    },
    {
      key: "today",
      title: "2. Due today",
      count: data.followUps.today,
      body: hasToday ? "Scheduled for today — work through these next." : "Nothing due today.",
      to: "/leads?sort=nextFollowUp:asc",
      primary: !hasOverdue && hasToday,
      warn: false,
    },
    {
      key: "new",
      title: "3. New leads",
      count: data.byStatus.NEW ?? 0,
      body: hasNew ? "Fresh leads waiting for a first call." : "No new leads right now.",
      to: "/leads?status=NEW&sort=createdAt:desc",
      primary: !hasOverdue && !hasToday && hasNew,
      warn: false,
    },
    {
      key: "high",
      title: "4. High priority",
      count: undefined as number | undefined,
      body: "Open your high-priority book when the queues above are clear.",
      to: "/leads?priority=HIGH&sort=nextFollowUp:asc",
      primary: false,
      warn: false,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold">My Dashboard</h1>
          <p className="text-sm text-muted-foreground">Your work day — clear queues in order, then dig into the rest.</p>
        </div>
        <Link to="/leads">
          <Button variant="secondary">All my leads</Button>
        </Link>
      </div>

      {/* Primary next action */}
      {hasOverdue ? (
        <Card className="flex flex-col gap-3 border-destructive/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-destructive">Do this first: {data.followUps.overdue} overdue</div>
            <p className="text-xs text-muted-foreground">Open the list, call, log the outcome, set the next follow-up.</p>
          </div>
          <Link to="/leads?overdueOnly=true&sort=nextFollowUp:asc">
            <Button>Start overdue queue</Button>
          </Link>
        </Card>
      ) : hasToday ? (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Next: {data.followUps.today} follow-up(s) due today</div>
            <p className="text-xs text-muted-foreground">You're clear on overdue — keep today's list moving.</p>
          </div>
          <Link to="/leads?sort=nextFollowUp:asc">
            <Button>Start today's follow-ups</Button>
          </Link>
        </Card>
      ) : (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold">Queues look clear</div>
            <p className="text-xs text-muted-foreground">
              {hasNew
                ? "Work new leads or high priority next."
                : notContacted > 0
                  ? `${notContacted} assigned lead(s) still need a first contact.`
                  : "Request more leads if you need pipeline."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasNew ? (
              <Link to="/leads?status=NEW&sort=createdAt:desc">
                <Button>Open new leads</Button>
              </Link>
            ) : (
              <Link to="/leads">
                <Button variant="secondary">Browse my leads</Button>
              </Link>
            )}
          </div>
        </Card>
      )}

      {/* Ordered work queues */}
      <div className="grid gap-3 sm:grid-cols-2">
        {queues.map((q) => (
          <Card key={q.key} className={`p-4 ${q.primary ? "ring-1 ring-primary/30" : ""}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className={`text-sm font-semibold ${q.warn ? "text-destructive" : ""}`}>{q.title}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{q.body}</p>
              </div>
              {typeof q.count === "number" && (
                <div className={`text-2xl font-semibold ${q.warn ? "text-destructive" : ""}`}>{q.count}</div>
              )}
            </div>
            <div className="mt-3">
              <Link to={q.to}>
                <Button variant={q.primary ? "primary" : "secondary"} className="w-full sm:w-auto">
                  Open list
                </Button>
              </Link>
            </div>
          </Card>
        ))}
      </div>

      {/* Compact today strip — not the main focus */}
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold">Today at a glance</h2>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
          <div>
            <div className="text-xs text-muted-foreground">Attendance</div>
            <div className="font-medium">{todayStatusLabel}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Active time</div>
            <div className="font-medium">{formatMinutes(data.sessions.active.todayMinutes)}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Calls logged</div>
            <div className="font-medium">{data.today.callsLogged}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Leads viewed</div>
            <div className="font-medium">{data.today.leadsViewed}</div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">My leads</div>
          <div className="text-2xl font-semibold">{data.assignedLeads}</div>
          <div className="text-xs text-muted-foreground">{notContacted} not yet contacted</div>
          {notContacted > 0 && (
            <Link to="/leads?status=NEW&sort=createdAt:desc" className="mt-2 inline-block text-xs text-primary underline">
              Open new / first-contact list
            </Link>
          )}
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Won</div>
          <div className="text-2xl font-semibold">{data.wonLeads}</div>
          <div className="text-xs text-muted-foreground">{data.conversionRate}% conversion</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted-foreground">Lost</div>
          <div className="text-2xl font-semibold">{data.lostLeads}</div>
        </Card>
      </div>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">By status — tap to open</h2>
          <Link to="/leads" className="text-xs text-primary underline">
            View all
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
          {Object.entries(data.byStatus).map(([status, count]) => (
            <Link
              key={status}
              to={`/leads?status=${status}`}
              className="rounded-md bg-muted/50 p-3 text-center transition hover:bg-muted"
            >
              <div className="text-lg font-semibold">{count}</div>
              <div className="text-xs text-muted-foreground">
                {STATUS_LABELS[status as keyof typeof STATUS_LABELS]}
              </div>
            </Link>
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold">Need more leads?</h2>
              <p className="text-xs text-muted-foreground">
                When your book is worked through, request a top-up — a manager will approve it.
              </p>
            </div>
            {!requestOpen && (
              <Button variant="secondary" onClick={() => setRequestOpen(true)}>
                Request more leads
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
                  {requestMutation.isPending ? "Sending..." : "Send request"}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
