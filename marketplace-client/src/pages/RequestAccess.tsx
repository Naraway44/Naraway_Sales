import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { useAuth } from "@/lib/auth";
import { redirectToAuth0Login } from "@/lib/auth0";
import { GoogleIcon } from "@/components/GoogleIcon";

export function RequestAccessPage() {
  const navigate = useNavigate();
  const { buyer, signup } = useAuth();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [googleLoading, setGoogleLoading] = useState(false);

  if (buyer) navigate("/catalog");

  async function onGoogleClick() {
    setGoogleLoading(true);
    try {
      await redirectToAuth0Login();
    } catch {
      setGoogleLoading(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await signup({
        name,
        company: company || undefined,
        email,
        phone: phone || undefined,
        password,
      });
      navigate("/catalog");
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setError(
        message.toLowerCase().includes("already exists")
          ? "An account with this email already exists. Try logging in instead."
          : "Something went wrong creating your account. Please try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative pb-4 pt-4">
        <PublicHeader />
      </div>
      <div className="flex flex-1 items-center justify-center p-4 pb-10 pt-20">
        <div className="w-full max-w-md">
          <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h1 className="mb-1 text-lg font-semibold">Start finding exclusive leads</h1>
            <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
              Create your account and start browsing right away. No card needed to sign up.
            </p>

            <button
              type="button"
              onClick={onGoogleClick}
              disabled={googleLoading}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-md border border-border bg-white px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition hover:bg-muted/50 disabled:opacity-60"
            >
              <GoogleIcon />
              {googleLoading ? "Connecting..." : "Sign up with Google"}
            </button>

            <div className="mb-4 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" />
              or
              <div className="h-px flex-1 bg-border" />
            </div>

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Full name *</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Agency, product company, or team name"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Work email *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 …"
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>

            <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
              By signing up you agree to our{" "}
              <Link to="/privacy" className="text-primary hover:underline">
                Privacy
              </Link>{" "}
              and{" "}
              <Link to="/terms" className="text-primary hover:underline">
                Terms
              </Link>
              .
            </p>

            <p className="mt-3 text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Log in
              </Link>
            </p>
          </form>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
