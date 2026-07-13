import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

export function Layout() {
  const { user, logout } = useAuth();

  const links = [
    { to: "/leads", label: "Leads", roles: ["FOUNDER", "MANAGER", "EXECUTIVE"] },
    { to: "/users", label: "Team", roles: ["FOUNDER"] },
    { to: "/settings", label: "Settings", roles: ["FOUNDER"] },
  ];

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-8">
            <span className="text-lg font-semibold text-primary">Naraway Sales OS</span>
            <nav className="flex gap-1">
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
            <span className="text-muted-foreground">
              {user?.name} <span className="text-xs">({user?.employeeId})</span>
            </span>
            <button onClick={logout} className="text-muted-foreground hover:text-foreground">
              Log out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
