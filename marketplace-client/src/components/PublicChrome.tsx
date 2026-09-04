import { Link } from "react-router-dom";
import { useState } from "react";

const NAV_LINKS = [
  { label: "Product", href: "#how-it-works" },
  { label: "Pricing", href: "#pricing" },
  { label: "Resources", href: "#faq" },
  { label: "Company", href: "#company" },
];

function scrollToHash(href: string) {
  if (!href.startsWith("#")) return;
  if (window.location.pathname === "/") {
    document.querySelector(href)?.scrollIntoView({ behavior: "smooth" });
  } else {
    window.location.href = `/${href}`;
  }
}

export function PublicHeader() {
  const [open, setOpen] = useState(false);

  return (
    <header className="absolute left-0 right-0 top-0 z-40 px-3 pt-4 sm:px-6 sm:pt-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 rounded-2xl border border-border/80 bg-white/95 px-4 py-3 shadow-sm shadow-black/[0.04] backdrop-blur sm:px-5">
        <div className="flex min-w-0 items-center gap-6 lg:gap-8">
          <Link to="/" className="flex shrink-0 items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
              L
            </span>
            <span className="text-[15px] font-bold tracking-tight text-foreground">LeadStack</span>
          </Link>

          <nav className="hidden items-center gap-5 md:flex">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                type="button"
                onClick={() => scrollToHash(link.href)}
                className="text-sm font-medium text-foreground/80 transition hover:text-foreground"
              >
                {link.label}
              </button>
            ))}
          </nav>
        </div>

        <div className="hidden items-center gap-5 sm:flex">
          <Link
            to="/request-access"
            className="text-sm font-medium text-foreground/80 transition hover:text-foreground"
          >
            Create an account
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center gap-1 text-sm font-semibold text-primary transition hover:opacity-80"
          >
            Log in <span aria-hidden>→</span>
          </Link>
        </div>

        <button
          type="button"
          className="rounded-lg border border-border px-2.5 py-1.5 text-sm font-medium text-foreground sm:hidden"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Toggle menu"
        >
          Menu
        </button>
      </div>

      {open && (
        <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-border bg-white p-4 shadow-lg sm:hidden">
          <div className="flex flex-col gap-3">
            {NAV_LINKS.map((link) => (
              <button
                key={link.label}
                type="button"
                className="text-left text-sm font-medium text-foreground"
                onClick={() => {
                  setOpen(false);
                  scrollToHash(link.href);
                }}
              >
                {link.label}
              </button>
            ))}
            <Link to="/request-access" className="text-sm font-medium" onClick={() => setOpen(false)}>
              Create an account
            </Link>
            <Link to="/login" className="text-sm font-semibold text-primary" onClick={() => setOpen(false)}>
              Log in →
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-border bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
                L
              </span>
              <span className="text-sm font-bold tracking-tight">LeadStack</span>
            </div>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">
              Exclusive B2B leads for serious buyers. Find companies that fit, pay clear prices, own the contact — not a
              shared list.
            </p>
            <a
              href="mailto:support@equidamai.com"
              className="mt-4 inline-block text-sm font-medium text-primary hover:underline"
            >
              support@equidamai.com
            </a>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Product</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/#how-it-works" className="hover:text-foreground">
                  How it works
                </a>
              </li>
              <li>
                <a href="/#product" className="hover:text-foreground">
                  Who it's for
                </a>
              </li>
              <li>
                <a href="/#pricing" className="hover:text-foreground">
                  Pricing
                </a>
              </li>
              <li>
                <Link to="/login" className="hover:text-foreground">
                  Browse (login)
                </Link>
              </li>
              <li>
                <Link to="/login" className="hover:text-foreground">
                  My Leads dashboard
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Company</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <a href="/#company" className="hover:text-foreground">
                  About LeadStack
                </a>
              </li>
              <li>
                <Link to="/request-access" className="hover:text-foreground">
                  Request access
                </Link>
              </li>
              <li>
                <a href="mailto:support@equidamai.com" className="hover:text-foreground">
                  Contact support
                </a>
              </li>
              <li>
                <a href="/#faq" className="hover:text-foreground">
                  FAQ
                </a>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Legal</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link to="/terms" className="hover:text-foreground">
                  Terms of use
                </Link>
              </li>
              <li>
                <Link to="/privacy" className="hover:text-foreground">
                  Privacy
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Payments processed by Razorpay. Buyer accounts are separate from LeadStack's internal Sales OS.
            </p>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-start justify-between gap-3 border-t border-border pt-6 text-xs text-muted-foreground sm:flex-row sm:items-center">
          <p>© {new Date().getFullYear()} LeadStack. All rights reserved. Access by invitation only.</p>
          <p>Exclusive leads · Live pricing · CSV export</p>
        </div>
      </div>
    </footer>
  );
}
