import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/Login";
import { ChangePasswordPage } from "@/pages/ChangePassword";
import { DashboardPage } from "@/pages/Dashboard";
import { MyDashboardPage } from "@/pages/MyDashboard";
import { LeadsListPage } from "@/pages/LeadsList";
import { LeadDetailPage } from "@/pages/LeadDetail";
import { NewLeadPage } from "@/pages/NewLead";
import { UsersPage } from "@/pages/Users";
import { MemberProfilePage } from "@/pages/MemberProfile";
import { SettingsPage } from "@/pages/Settings";
import { ResourcesPage } from "@/pages/Resources";
import { BuyersPage } from "@/pages/Buyers";
import { ToastProvider } from "@/components/Toast";

const queryClient = new QueryClient();

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <div className="p-6 text-muted-foreground">Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === "EXECUTIVE") return <Navigate to="/my-dashboard" replace />;
  if (user.role === "FOUNDER" || user.role === "MANAGER") return <Navigate to="/dashboard" replace />;
  return <Navigate to="/leads" replace />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<HomeRedirect />} />
                <Route path="/my-dashboard" element={<MyDashboardPage />} />
                <Route path="/leads" element={<LeadsListPage />} />
                <Route path="/leads/new" element={<NewLeadPage />} />
                <Route path="/leads/:id" element={<LeadDetailPage />} />
                <Route path="/resources" element={<ResourcesPage />} />

                <Route element={<ProtectedRoute roles={["FOUNDER", "MANAGER"]} />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                </Route>

                <Route element={<ProtectedRoute roles={["FOUNDER", "MANAGER"]} />}>
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/users/:id" element={<MemberProfilePage />} />
                  <Route path="/buyers" element={<BuyersPage />} />
                </Route>

                <Route element={<ProtectedRoute roles={["FOUNDER"]} />}>
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<HomeRedirect />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;
