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

const FEATURES = [
  {
    title: "Exclusive access",
    body: "Every lead is sold once. No sharing it with four other buyers racing to be first to call.",
  },
  {
    title: "Transparent live pricing",
    body: "See your exact total before you check out — priced by volume, computed live, no hidden fees.",
  },
  {
    title: "Powerful filters",
    body: "Industry, location, service, deal value, and listing date — find exactly the leads you're after.",
  },
  {
    title: "Instant export",
    body: "Download everything you've purchased as a CSV, ready for your own CRM or outreach tools.",
  },
  {
    title: "Secure checkout",
    body: "Payments run through Razorpay — your card details never touch our servers.",
  },
  {
    title: "Reviewed access",
    body: "Every buyer account is reviewed before activation, keeping the marketplace to serious buyers.",
  },
];

const FAQS = [
  {
    q: "How is pricing determined?",
    a: "Price depends on how many leads you buy in one order — bigger orders cost less per lead. Your exact total is always shown before checkout.",
  },
  {
    q: "Are leads ever shared with other buyers?",
    a: "No. Every lead you purchase is exclusive to you for 2 months from the purchase date.",
  },
  {
    q: "How do I get access?",
    a: "Submit a request with your name, company, and contact details. Naraway reviews every request and follows up with login details if approved.",
  },
  {
    q: "Can I export what I've purchased?",
    a: "Yes — download a CSV of your purchased leads any time from your dashboard.",
  },
  {
    q: "What if a lead's contact information is wrong?",
    a: "Reach out to our support email from your dashboard and we'll look into it.",
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

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6">
          <h2 className="mb-10 text-center text-2xl font-semibold tracking-tight">Built for serious buyers</h2>
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <div key={feature.title}>
                <h3 className="mb-1.5 font-semibold">{feature.title}</h3>
                <p className="text-sm text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
          <h2 className="mb-8 text-center text-2xl font-semibold tracking-tight">Common questions</h2>
          <div className="divide-y divide-border rounded-xl border border-border bg-card">
            {FAQS.map((faq) => (
              <div key={faq.q} className="p-4 sm:p-5">
                <h3 className="mb-1 text-sm font-semibold">{faq.q}</h3>
                <p className="text-sm text-muted-foreground">{faq.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-3 px-4 py-8 text-center text-xs text-muted-foreground sm:px-6">
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <a href="mailto:support@naraway.com" className="hover:text-foreground">
              Contact
            </a>
          </div>
          <p>© {new Date().getFullYear()} Naraway. Access by invitation only.</p>
        </div>
      </footer>
    </div>
  );
}
