import { BrowserRouter, Navigate, Route, Routes, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { CatalogPage } from "@/pages/Catalog";
import { DashboardPage } from "@/pages/Dashboard";

const queryClient = new QueryClient();

function TopNav() {
  const { buyer, logout } = useAuth();
  if (!buyer) return null;
  return (
    <nav className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex gap-4 text-sm font-medium">
        <Link to="/catalog">Browse</Link>
        <Link to="/dashboard">My Leads</Link>
      </div>
      <button onClick={logout} className="text-sm text-muted-foreground">
        Sign out
      </button>
    </nav>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
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
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
