import { BrowserRouter, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { CatalogPage } from "@/pages/Catalog";
import { DashboardPage } from "@/pages/Dashboard";

const queryClient = new QueryClient();

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
  }`;
}

function TopNav() {
  const { buyer, logout } = useAuth();
  if (!buyer) return null;
  return (
    <nav className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="text-sm font-semibold tracking-tight">
            Naraway <span className="text-primary">Lead Marketplace</span>
          </span>
          <div className="flex gap-1">
            <NavLink to="/catalog" className={navLinkClass}>
              Browse
            </NavLink>
            <NavLink to="/dashboard" className={navLinkClass}>
              My Leads
            </NavLink>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{buyer.name}</span>
          <button onClick={logout} className="text-sm text-muted-foreground transition hover:text-foreground">
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <div className="min-h-screen bg-background">
            <TopNav />
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/" element={<Navigate to="/catalog" replace />} />
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
