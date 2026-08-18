import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAlerts, AlertItem } from "@/api/alerts";
import { useAuth } from "@/lib/auth";

function linkFor(alert: AlertItem, isExecutive: boolean): string {
  if (alert.id.startsWith("overdue-")) {
    if (alert.link.type === "user") {
      return `/leads?ownerId=${alert.link.id}&overdueOnly=true&sort=nextFollowUp:asc`;
    }
    return "/leads?overdueOnly=true&sort=nextFollowUp:asc";
  }
  if (alert.id.startsWith("new-sla-")) {
    if (alert.link.type === "user") {
      return `/leads?ownerId=${alert.link.id}&status=NEW&sort=createdAt:desc`;
    }
    return "/leads?status=NEW&sort=createdAt:desc";
  }
  if (alert.link.type === "self") {
    return isExecutive ? "/my-dashboard" : "/dashboard";
  }
  if (alert.link.type === "user") return `/users/${alert.link.id}`;
  return `/leads/${alert.link.id}`;
}

function groupLabel(alert: AlertItem): string {
  const id = alert.id;
  if (id.startsWith("attendance-")) return "Attendance";
  if (id.startsWith("overdue-") || id.startsWith("new-sla-")) return "Follow-ups";
  if (id.startsWith("idle-") || id.startsWith("away-") || /idle|away/i.test(alert.title)) return "Away / idle";
  if (id.startsWith("neglected-") || id.startsWith("stale-") || id.includes("abandoned") || id.startsWith("auto-")) {
    return "Leads / system";
  }
  return "Other";
}

const GROUP_ORDER = ["Attendance", "Follow-ups", "Away / idle", "Leads / system", "Other"];

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    refetchInterval: 60_000,
  });

  const count = alerts?.length ?? 0;
  const criticalCount = alerts?.filter((a) => a.severity === "critical").length ?? 0;

  const grouped = useMemo(() => {
    const map = new Map<string, AlertItem[]>();
    for (const a of alerts ?? []) {
      const key = groupLabel(a);
      const list = map.get(key) ?? [];
      list.push(a);
      map.set(key, list);
    }
    return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({ label: g, items: map.get(g)! }));
  }, [alerts]);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md px-2 py-1.5 text-muted-foreground hover:bg-muted"
        aria-label="Alerts"
      >
        🔔
        {count > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-medium text-destructive-foreground">
            {count}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-border bg-card p-2 shadow-lg">
            <div className="flex items-center justify-between px-2 py-1">
              <h3 className="text-xs font-semibold uppercase text-muted-foreground">Alerts</h3>
              {count > 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {criticalCount > 0 ? `${criticalCount} critical · ` : ""}
                  {count} total
                </span>
              )}
            </div>
            {count === 0 && (
              <p className="px-2 py-3 text-sm text-muted-foreground">Nothing needs attention right now.</p>
            )}
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {grouped.map((group) => (
                <div key={group.label}>
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </div>
                  <div className="space-y-1">
                    {group.items.map((a) => (
                      <Link
                        key={a.id}
                        to={linkFor(a, user?.role === "EXECUTIVE")}
                        onClick={() => setOpen(false)}
                        className={`block rounded-md px-2 py-2 text-sm hover:bg-muted ${
                          a.severity === "critical" ? "bg-red-50" : "bg-amber-50"
                        }`}
                      >
                        <div className="font-medium">{a.title}</div>
                        <div className="text-xs text-muted-foreground">{a.message}</div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
