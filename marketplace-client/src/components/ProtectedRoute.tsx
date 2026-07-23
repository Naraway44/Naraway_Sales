import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function ProtectedRoute() {
  const { buyer, loading } = useAuth();
  if (loading) return null;
  if (!buyer) return <Navigate to="/login" replace />;
  return <Outlet />;
}
