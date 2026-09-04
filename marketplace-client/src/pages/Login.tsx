import { FormEvent, useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { completeAuth0Redirect, redirectToAuth0Login } from "@/lib/auth0";
import { GoogleIcon } from "@/components/GoogleIcon";

export function LoginPage() {
  const { buyer, login, loginWithAuth0 } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Handles the redirect back from Auth0's Universal Login (?code=...) — separate from
  // the email/password form below, which is untouched.
  useEffect(() => {
    if (!window.location.search.includes("code=")) return;
    setGoogleLoading(true);
    completeAuth0Redirect()
      .then((idToken) => {
        if (!idToken) return;
        return loginWithAuth0(idToken).then(() => navigate("/catalog"));
      })
      .catch((err: Error) => setError(err.message || "Google sign-in failed. Please try again."))
      .finally(() => setGoogleLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onGoogleClick() {
    setError("");
    setGoogleLoading(true);
    try {
      await redirectToAuth0Login();
    } catch {
      setError("Couldn't start Google sign-in. Please try again.");
      setGoogleLoading(false);
    }
  }

  if (buyer) return <Navigate to="/catalog" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/catalog");
    } catch {
      setError("Invalid email or password. If you were just approved, use the credentials LeadStack sent you.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative pb-4 pt-4">
        <PublicHeader />
      </div>
      <div className="flex flex-1 items-center justify-center p-4 pt-20">
        <div className="w-full max-w-sm">
          <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h1 className="mb-1 text-lg font-semibold">Welcome back</h1>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              Sign in with the buyer account we sent after approving your access request.
            </p>

            <button
              type="button"
              onClick={onGoogleClick}
              disabled={googleLoading}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/50 disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? "Connecting..." : "Continue with Google"}
            </button>

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Don't have an account yet?{" "}
            <Link to="/request-access" className="font-medium text-primary hover:underline">
              Request access
            </Link>
          </p>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            Need help?{" "}
            <a href="mailto:support@equidamai.com" className="text-primary hover:underline">
              support@equidamai.com
            </a>
          </p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
