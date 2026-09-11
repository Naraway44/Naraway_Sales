import { useState } from "react";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";

const APPLY_URL = "https://docs.google.com/forms/d/1qovft1ZUyFoUBkhR10Ikb-oqfU9hOvKjT9d3JDiX4a8/viewform";

const WHAT_YOU_DO = [
  "Call and message warm leads from your network into paying LeadStack buyers — fully remote, over phone and chat.",
  "Pitch and close founders, agencies and sales teams who need pipeline.",
  "Get paid commission on every deal you close, for as long as the buyer keeps buying.",
];

const WHO_FITS = [
  "You're comfortable on the phone, pitching a paid product and asking for the close.",
  "You already talk to business owners, agency founders or sales teams, or can build that network fast.",
  "You want a full-time role where your pay is tied to what you actually sell.",
];

export function CareersPage() {
  const [selected, setSelected] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <section className="bg-hero-grid relative overflow-hidden pb-8 pt-28 sm:pb-12 sm:pt-32">
        <div className="pointer-events-none absolute left-1/2 top-24 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-3xl px-4 text-center sm:px-6">
          <span className="mb-4 inline-block rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold tracking-wide text-primary">
            We're hiring
          </span>
          <h1 className="text-[2.1rem] font-bold leading-[1.15] tracking-tight text-foreground sm:text-5xl">
            Careers at <span className="text-primary">LeadStack</span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
            LeadStack, by Equidam AI, is hiring. One open role right now — full-time, remote, paid on what you close.
          </p>
        </div>
      </section>

      <section className="border-t border-border bg-white">
        <div className="mx-auto max-w-2xl px-4 py-14 sm:px-6 sm:py-16">
          {!selected ? (
            <button
              type="button"
              onClick={() => setSelected(true)}
              className="btn-pop flex w-full items-center justify-between rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition hover:border-primary/40"
            >
              <div>
                <h2 className="text-base font-semibold text-foreground">Inside Sales Executive</h2>
                <p className="mt-1 text-sm text-muted-foreground">Full-time · Remote · Commission-based pay</p>
              </div>
              <span className="text-primary">→</span>
            </button>
          ) : (
            <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
              <button
                type="button"
                onClick={() => setSelected(false)}
                className="mb-4 text-xs font-medium text-muted-foreground hover:text-primary"
              >
                ← All roles
              </button>

              <h2 className="text-xl font-bold text-foreground">Inside Sales Executive</h2>
              <p className="mt-1 text-sm font-medium text-primary">Full-time · Remote · Commission-based pay</p>

              <div className="mt-8 grid gap-8 sm:grid-cols-2">
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">What you'd do</h3>
                  <ul className="space-y-3">
                    {WHAT_YOU_DO.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                        <span className="mt-0.5 font-bold text-primary">→</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="mb-3 text-sm font-semibold text-foreground">Who fits</h3>
                  <ul className="space-y-3">
                    {WHO_FITS.map((item) => (
                      <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-muted-foreground">
                        <span className="mt-0.5 font-bold text-primary">→</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <a
                href={APPLY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-pop mt-8 inline-block w-full rounded-lg bg-primary px-4 py-2.5 text-center text-sm font-semibold text-primary-foreground sm:w-auto"
              >
                Apply now
              </a>
            </div>
          )}
        </div>
      </section>

      <PublicFooter />
    </div>
  );
}
