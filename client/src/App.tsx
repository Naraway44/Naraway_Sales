import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Layout } from "@/components/Layout";
import { LoginPage } from "@/pages/Login";
import { ChangePasswordPage } from "@/pages/ChangePassword";
import { DashboardPage } from "@/pages/Dashboard";
import { LeadsListPage } from "@/pages/LeadsList";
import { LeadDetailPage } from "@/pages/LeadDetail";
import { NewLeadPage } from "@/pages/NewLead";
import { UsersPage } from "@/pages/Users";
import { SettingsPage } from "@/pages/Settings";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/change-password" element={<ChangePasswordPage />} />

            <Route element={<ProtectedRoute />}>
              <Route element={<Layout />}>
                <Route path="/" element={<Navigate to="/leads" replace />} />
                <Route path="/leads" element={<LeadsListPage />} />
                <Route path="/leads/new" element={<NewLeadPage />} />
                <Route path="/leads/:id" element={<LeadDetailPage />} />

                <Route element={<ProtectedRoute roles={["FOUNDER", "MANAGER"]} />}>
                  <Route path="/dashboard" element={<DashboardPage />} />
                </Route>

                <Route element={<ProtectedRoute roles={["FOUNDER"]} />}>
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                </Route>
              </Route>
            </Route>

            <Route path="*" element={<Navigate to="/leads" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
