import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { getAlerts, AlertItem } from "@/api/alerts";
import { useAuth } from "@/lib/auth";

function linkFor(alert: AlertItem, isExecutive: boolean): string {
  if (alert.link.type === "self") return isExecutive ? "/my-dashboard" : "/dashboard";
  if (alert.link.type === "user") return `/users/${alert.link.id}`;
  return `/leads/${alert.link.id}`;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const { data: alerts } = useQuery({
    queryKey: ["alerts"],
    queryFn: getAlerts,
    refetchInterval: 60_000,
  });

  const count = alerts?.length ?? 0;

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
            <h3 className="px-2 py-1 text-xs font-semibold uppercase text-muted-foreground">Alerts</h3>
            {count === 0 && <p className="px-2 py-3 text-sm text-muted-foreground">Nothing needs attention right now.</p>}
            <div className="max-h-80 space-y-1 overflow-y-auto">
              {alerts?.map((a) => (
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
        </>
      )}
    </div>
  );
}
