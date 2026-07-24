import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

const STEPS = [
  {
    title: "Browse",
    body: "Filter by industry, location, service, and more to see exactly what's available before you commit.",
  },
  {
    title: "Buy",
    body: "See a live count and price for your selection, then check out securely. No published rate card, no guesswork.",
  },
  {
    title: "Own it exclusively",
    body: "Every lead you buy is locked to you for 2 months — never resold, never shared with a competitor.",
  },
];

export function LandingPage() {
  const { buyer } = useAuth();
  if (buyer) return <Navigate to="/catalog" replace />;

  return (
    <div className="min-h-screen bg-background">
      <nav className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <span className="text-sm font-semibold tracking-tight">
            Naraway <span className="text-primary">Lead Marketplace</span>
          </span>
          <div className="flex items-center gap-4">
            <Link to="/request-access" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Request Access
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary px-4 py-1.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Log in
            </Link>
          </div>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-4 py-20 text-center sm:px-6">
        <p className="mb-3 text-sm font-medium text-muted-foreground">Naraway Lead Marketplace</p>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Finally, <span className="text-primary">B2B leads</span>
          <br />
          you can own exclusively.
        </h1>
        <p className="mx-auto mt-5 max-w-xl text-base text-muted-foreground">
          Verified B2B leads, filtered by industry and location, priced transparently, and sold to exactly one
          buyer at a time. Never shared, never resold.
        </p>
        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            to="/request-access"
            className="rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
          >
            Request Access
          </Link>
          <Link
            to="/login"
            className="rounded-md border border-border px-6 py-2.5 text-sm font-medium transition hover:bg-muted/50"
          >
            Log in
          </Link>
        </div>
        <p className="mt-4 text-xs text-muted-foreground">Access is by invitation — Naraway reviews every request.</p>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">How it works</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <div key={step.title}>
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                  {i + 1}
                </div>
                <h3 className="mb-1.5 font-semibold">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-4 py-6 text-center text-xs text-muted-foreground sm:px-6">
          © {new Date().getFullYear()} Naraway. Access by invitation only.
        </div>
      </footer>
    </div>
  );
}
