import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { submitAccessRequest } from "@/api/accessRequests";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";
import { useAuth } from "@/lib/auth";
import { redirectToAuth0Login } from "@/lib/auth0";
import { GoogleIcon } from "@/components/GoogleIcon";

export function RequestAccessPage() {
  const navigate = useNavigate();
  const { buyer } = useAuth();
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
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
      await submitAccessRequest({
        name,
        company: company || undefined,
        email,
        phone: phone || undefined,
        message: message || undefined,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your request. Please try again.");
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
          {submitted ? (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center shadow-sm">
              <h1 className="mb-1 text-lg font-semibold text-primary">Request received</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Thanks. LeadStack will review your details and email you with login credentials if approved. This is not
                instant self-serve signup; reviews are manual.
              </p>
              <ul className="mt-4 space-y-1.5 text-left text-xs text-muted-foreground">
                <li>Check spam if you don't see a reply within a few business days</li>
                <li>Once approved, use Log in to browse and purchase leads</li>
              </ul>
              <Link to="/login" className="mt-5 inline-block text-sm font-medium text-primary hover:underline">
                Already have an account? Log in
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="rounded-2xl border border-border bg-card p-6 shadow-sm">
              <h1 className="mb-1 text-lg font-semibold">Start finding exclusive leads</h1>
              <p className="mb-5 text-sm leading-relaxed text-muted-foreground">
                Tell us a bit about you and what you sell. We review every request, free to apply, no card needed.
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

              <label className="mb-1 block text-xs font-medium text-muted-foreground">
                What are you looking for? (optional)
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={3}
                placeholder="e.g. Retail leads in Delhi NCR for CRM / website projects, ~100 leads / month"
                className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />

              {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={submitting}
                className="w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
              >
                {submitting ? "Submitting..." : "Submit request"}
              </button>

              <p className="mt-4 text-center text-xs leading-relaxed text-muted-foreground">
                By submitting you agree we may contact you about this request. See{" "}
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
                Already approved?{" "}
                <Link to="/login" className="font-medium text-primary hover:underline">
                  Log in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
