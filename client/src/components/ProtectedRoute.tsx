import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function ProtectedRoute({ roles }: { roles?: string[] }) {
  const { user, loading } = useAuth();

  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/leads" replace />;

  return <Outlet />;
}
