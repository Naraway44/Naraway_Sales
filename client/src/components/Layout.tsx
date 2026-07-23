import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NotificationBell } from "@/components/NotificationBell";

export function Layout() {
  const { user, logout } = useAuth();
  const [confirmLogout, setConfirmLogout] = useState(false);

  const links = [
    { to: "/dashboard", label: "Dashboard", roles: ["FOUNDER", "MANAGER"] },
    { to: "/my-dashboard", label: "My Dashboard", roles: ["EXECUTIVE"] },
    { to: "/leads", label: "Leads", roles: ["FOUNDER", "MANAGER", "EXECUTIVE"] },
    { to: "/resources", label: "Resources", roles: ["FOUNDER", "MANAGER", "EXECUTIVE"] },
    { to: "/users", label: "Team", roles: ["FOUNDER", "MANAGER"] },
    { to: "/buyers", label: "Marketplace Buyers", roles: ["FOUNDER", "MANAGER"] },
    { to: "/settings", label: "Settings", roles: ["FOUNDER"] },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-8">
            <span className="text-lg font-semibold text-primary">Naraway Sales OS</span>
            <nav className="flex gap-1 overflow-x-auto pb-1 md:pb-0" aria-label="Main navigation">
              {links
                .filter((l) => user && l.roles.includes(user.role))
                .map((l) => (
                  <NavLink
                    key={l.to}
                    to={l.to}
                    className={({ isActive }) =>
                      cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium",
                        isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"
                      )
                    }
                  >
                    {l.label}
                  </NavLink>
                ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <NotificationBell />
            <span className="text-muted-foreground">
              {user?.name} <span className="text-xs">({user?.employeeId})</span>
            </span>
            <button onClick={() => setConfirmLogout(true)} className="text-muted-foreground hover:text-foreground">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
      <ConfirmDialog open={confirmLogout} title="Log out?" description="You will need to sign in again to access the Sales OS." confirmLabel="Log out" onCancel={() => setConfirmLogout(false)} onConfirm={logout} />
    </div>
  );
}
