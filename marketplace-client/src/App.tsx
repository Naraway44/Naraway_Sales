import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { VoiceAssistant } from "@/components/VoiceAssistant";
import { LogoMark } from "@/components/LogoMark";
import { LandingPage } from "@/pages/Landing";
import { LoginPage } from "@/pages/Login";
import { RequestAccessPage } from "@/pages/RequestAccess";
import { TermsPage } from "@/pages/Terms";
import { PrivacyPage } from "@/pages/Privacy";
import { CatalogPage } from "@/pages/Catalog";
import { DashboardPage } from "@/pages/Dashboard";

const queryClient = new QueryClient();
const PUBLIC_PATHS = ["/", "/login", "/request-access", "/terms", "/privacy"];

function navLinkClass({ isActive }: { isActive: boolean }) {
  return `rounded-md px-3 py-1.5 text-sm font-medium transition ${
    isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
  }`;
}

function TopNav() {
  const { buyer, logout } = useAuth();
  const location = useLocation();
  if (!buyer || PUBLIC_PATHS.includes(location.pathname)) return null;
  return (
    <nav className="sticky top-0 z-40 border-b border-border bg-card/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <LogoMark size={24} />
            LeadStack
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
              <Route path="/" element={<LandingPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/request-access" element={<RequestAccessPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route element={<ProtectedRoute />}>
                <Route path="/catalog" element={<CatalogPage />} />
                <Route path="/dashboard" element={<DashboardPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            {/* Outside <Routes> so it survives navigation: the component never unmounts,
                which is what lets a conversation carry on across pages instead of being
                cut off the moment someone clicks through to pricing or the catalog. */}
            <VoiceAssistant />
          </div>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
