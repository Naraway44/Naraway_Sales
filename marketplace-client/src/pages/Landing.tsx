import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";

const STEPS = [
  {
    title: "Find the right companies",
    body: "Pick industry, city, and what they need. See who is available before you spend anything.",
  },
  {
    title: "Know the price. Buy with confidence.",
    body: "Choose how many leads you want. See your total upfront. Pay with UPI or card in seconds.",
  },
  {
    title: "Get contacts only you can use",
    body: "Phone and email unlock for you alone for 2 months. No shared lists. No race to call first.",
  },
];

const FEATURES = [
  {
    title: "Yours alone — not shared",
    body: "Every lead goes to one buyer. You are not fighting other agencies for the same number.",
  },
  {
    title: "Real businesses, real context",
    body: "Leads come from real sales conversations — not random scraped directories.",
  },
  {
    title: "Match what you sell",
    body: "Filter by industry, location, and service so you only look at companies that fit.",
  },
  {
    title: "Preview before you pay",
    body: "See company and context first. Contact details open only after you buy.",
  },
  {
    title: "Bigger orders, better rates",
    body: "Buy more, pay less per lead. Your total is always clear before checkout.",
  },
  {
    title: "Save your favourite searches",
    body: "Keep filters like “Retail, Delhi” ready for next time — one click back to your market.",
  },
  {
    title: "Keep everything in one place",
    body: "Purchased leads stay in My Leads. Search, call, email, or download anytime.",
  },
  {
    title: "Simple, secure checkout",
    body: "Pay the way you already do in India. Your payment details stay with the payment partner.",
  },
  {
    title: "Serious buyers only",
    body: "Every account is reviewed. That keeps the marketplace focused and high quality.",
  },
];

const WHO_FOR = [
  {
    title: "Agencies & freelancers",
    body: "Fill your pipeline for websites, SEO, CRM, and consulting — without shared leads everyone else already called.",
  },
  {
    title: "Sales teams",
    body: "Add exclusive contacts in the cities and industries you care about when inbound slows down.",
  },
  {
    title: "Founders selling outbound",
    body: "Buy only what you need today, download the list, and start conversations the same afternoon.",
  },
];

const IN_A_LEAD = [
  {
    label: "Before you buy",
    items: ["Company name", "Industry", "City & state", "What they need", "Helpful notes", "Deal size hint", "When listed"],
  },
  {
    label: "After you buy",
    items: ["Decision-maker name", "Phone", "Email", "Everything above", "What you paid", "Exclusive until", "Download anytime"],
  },
];

const FILTERS = [
  "Company",
  "Industry",
  "City",
  "State",
  "Service",
  "Notes",
  "Deal size",
  "Listed date",
  "How many",
];

const COMPARE = [
  {
    label: "Typical shared leads",
    bad: true,
    points: ["Same lead sold to many buyers", "Race to dial first", "Monthly fees stack up", "You pay for noise"],
  },
  {
    label: "With LeadStack",
    bad: false,
    points: ["One buyer per lead", "Yours for 2 months", "Pay only when you buy", "Only pay for what you get"],
  },
];

const AFTER_BUY = [
  { title: "Unlock contacts", body: "Name, phone, and email show up in My Leads as soon as payment clears." },
  { title: "Download your list", body: "Export to Excel or your CRM whenever you need — no expiring links." },
  { title: "We’re here to help", body: "Something look off? Email support@equidamai.com and we’ll look into it." },
];

const FAQS = [
  {
    q: "What is this marketplace?",
    a: "A place for approved buyers to find exclusive B2B leads — companies you can reach out to, without sharing them with competitors.",
  },
  {
    q: "Where do the leads come from?",
    a: "From real sales work — AI-matched to your business, then released to you exclusively when a lead is no longer a fit for us.",
  },
  {
    q: "Will other buyers get the same lead?",
    a: "No. Once you buy a lead, it is yours alone for 2 months. We don’t resell it.",
  },
  {
    q: "What do I see before paying?",
    a: "Company, industry, location, what they need, and helpful notes. Phone and email unlock after you buy.",
  },
  {
    q: "How does pricing work?",
    a: "You choose quantity, see the total, then pay. Larger orders cost less per lead. No surprise fees.",
  },
  {
    q: "What if fewer leads are left when I check out?",
    a: "You only pay for what we can deliver — never more.",
  },
  {
    q: "How do I get access?",
    a: "Request access with your details. We review every request and send login details if approved.",
  },
  {
    q: "Is there a monthly subscription?",
    a: "No. Buy when you need pipeline. Skip when you don’t.",
  },
  {
    q: "Can I download what I bought?",
    a: "Yes — export from My Leads anytime.",
  },
  {
    q: "How do I pay?",
    a: "UPI or card through our payment partner. We never store your card details.",
  },
  {
    q: "What if a contact seems wrong?",
    a: "Email support@equidamai.com with the details and we’ll check it.",
  },
  {
    q: "Who is this for?",
    a: "Agencies, sales teams, and founders who want exclusive B2B contacts — not free spam lists or shared lead dumps.",
  },
];

function useReveal<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add("is-visible");
          io.unobserve(el);
        }
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return ref;
}

function Reveal({ children, className = "", stagger = false }: { children: ReactNode; className?: string; stagger?: boolean }) {
  const ref = useReveal<HTMLDivElement>();
  return (
    <div ref={ref} className={`${stagger ? "reveal-stagger" : "reveal"} ${className}`}>
      {children}
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-border last:border-0">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left transition hover:bg-muted/30 sm:px-5"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="text-sm font-semibold text-foreground">{q}</span>
        <span
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium text-muted-foreground transition-transform duration-300 ${
            open ? "rotate-45 bg-primary/10 text-primary" : ""
          }`}
        >
          +
        </span>
      </button>
      <div
        className={`grid transition-all duration-300 ease-out ${open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
      >
        <div className="overflow-hidden">
          <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground sm:px-5">{a}</p>
        </div>
      </div>
    </div>
  );
}

function ProductPreview() {
  const rows = [
    { company: "Apex Logistics Pvt Ltd", domain: "apexlogistics.in", industry: "Logistics", location: "Mumbai, MH" },
    { company: "Northline Retail", domain: "northline.co", industry: "Retail", location: "Delhi NCR" },
    { company: "Orbit Fintech", domain: "orbitfin.tech", industry: "Fintech", location: "Bengaluru, KA" },
    { company: "Harbor Clinics", domain: "harborclinics.com", industry: "Healthcare", location: "Pune, MH" },
  ];

  return (
    <div className="anim-float overflow-hidden rounded-xl border border-border bg-white shadow-2xl shadow-black/10">
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border px-3 py-2.5 sm:gap-2 sm:px-4">
        <div className="mr-2 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary text-[10px] font-bold text-white">
          N
        </div>
        <span className="flex shrink-0 items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1.5 text-xs font-semibold text-primary">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
          Discover
        </span>
        {["Browse", "My Leads", "Export"].map((item) => (
          <span key={item} className="hidden shrink-0 px-2 py-1.5 text-xs font-medium text-muted-foreground sm:inline">
            {item}
          </span>
        ))}
        <div className="ml-auto flex shrink-0 items-center gap-2 pl-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
            YU
          </div>
          <div className="hidden text-left sm:block">
            <p className="text-[11px] font-semibold leading-tight text-foreground">Your account</p>
            <p className="text-[10px] leading-tight text-muted-foreground">Approved buyer</p>
          </div>
        </div>
      </div>

      <div className="grid min-h-[280px] sm:grid-cols-[220px_1fr]">
        <aside className="hidden border-r border-border bg-white p-4 sm:block">
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Filters</p>
            <div className="flex gap-2 text-[11px] font-medium text-primary">
              <span>Clear</span>
              <span>Save</span>
            </div>
          </div>
          {[
            { label: "Company", placeholder: "Search company…" },
            { label: "Industry", placeholder: "e.g. Retail" },
            { label: "Location", placeholder: "City or state" },
            { label: "Need", placeholder: "e.g. Website, CRM" },
          ].map((f) => (
            <div key={f.label} className="mb-3">
              <p className="mb-1.5 text-xs font-medium text-foreground">{f.label}</p>
              <div className="rounded-md border border-border bg-white px-2.5 py-2 text-[11px] text-muted-foreground">
                {f.placeholder}
              </div>
            </div>
          ))}
        </aside>

        <div className="bg-white p-4 sm:p-5">
          <h3 className="count-glow text-base font-semibold tracking-tight text-foreground sm:text-lg">
            538 companies match
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">See your total before you buy · contacts unlock after payment</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="pulse-ring rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white">Buy now</span>
            <span className="rounded-md border border-border px-3 py-1.5 text-xs font-medium text-foreground">Download list</span>
          </div>

          <div className="mt-4 overflow-hidden rounded-lg border border-border">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                  <th className="w-8 px-3 py-2.5 font-medium">
                    <span className="inline-block h-3.5 w-3.5 rounded border border-border" />
                  </th>
                  <th className="px-3 py-2.5 font-medium">Company</th>
                  <th className="hidden px-3 py-2.5 font-medium md:table-cell">Industry</th>
                  <th className="hidden px-3 py-2.5 font-medium sm:table-cell">Location</th>
                  <th className="px-3 py-2.5 text-right font-medium">Contacts</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.company} className="border-b border-border transition-colors last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-3">
                      <span className="inline-block h-3.5 w-3.5 rounded border border-border" />
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground">
                          {row.company.charAt(0)}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-foreground">{row.company}</p>
                          <p className="truncate text-[11px] text-muted-foreground">{row.domain}</p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">{row.industry}</td>
                    <td className="hidden px-3 py-3 text-muted-foreground sm:table-cell">{row.location}</td>
                    <td className="px-3 py-3 text-right">
                      <span className="rounded-md border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground">
                        Unlock after buy
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

export function LandingPage() {
  const { buyer } = useAuth();
  if (buyer) return <Navigate to="/catalog" replace />;

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader />

      <section className="bg-hero-grid relative overflow-hidden pb-8 pt-28 sm:pb-12 sm:pt-32">
        <div className="pointer-events-none absolute left-1/2 top-24 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/10 blur-3xl" />
        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <p className="anim-fade-up mb-4 text-sm font-medium text-foreground/70 sm:text-base">
            The world's leading AI-matched B2B leads platform — used in 120+ countries, including the US and UK
          </p>
          <h1 className="anim-fade-up anim-delay-1 text-[2.35rem] font-bold leading-[1.12] tracking-tight text-foreground sm:text-5xl lg:text-[3.5rem]">
            Finally, <span className="text-primary">B2B leads</span>
            <br />
            you can trust.
          </h1>
          <p className="anim-fade-up anim-delay-2 mx-auto mt-5 max-w-2xl text-[15px] leading-relaxed text-muted-foreground sm:text-lg">
            Stop buying shared lists. Get companies that match what you sell — with contacts{" "}
            <strong className="font-semibold text-foreground">only you</strong> can use.
          </p>
          <div className="anim-fade-up anim-delay-3 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/request-access"
              className="btn-pop inline-flex w-full items-center justify-center rounded-lg bg-primary px-7 py-3 text-sm font-semibold text-primary-foreground sm:w-auto"
            >
              Start finding leads
            </Link>
            <a
              href="#how-it-works"
              className="inline-flex w-full items-center justify-center rounded-lg border border-border bg-white px-7 py-3 text-sm font-semibold text-foreground transition hover:bg-muted/40 sm:w-auto"
            >
              See how it works
            </a>
          </div>
          <p className="anim-fade-up anim-delay-4 mt-4 text-xs text-muted-foreground sm:text-sm">
            Free to request access. No card needed to apply. We review every request.
          </p>
        </div>

        <div className="anim-fade-up anim-delay-5 relative mx-auto mt-12 max-w-5xl px-3 sm:mt-16 sm:px-6">
          <div className="pointer-events-none absolute -inset-x-8 -bottom-4 top-12 bg-gradient-to-b from-transparent via-white/40 to-white sm:top-20" />
          <div className="relative">
            <ProductPreview />
          </div>
        </div>
      </section>

      <section className="border-y border-border bg-white">
        <Reveal className="mx-auto max-w-6xl px-4 py-12 sm:px-6" stagger>
          <p className="reveal-child mb-8 text-center text-sm text-muted-foreground">
            Built for people who need real pipeline — not another shared list
          </p>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              { k: "1 buyer", v: "per lead — always" },
              { k: "2 months", v: "exclusively yours" },
              { k: "No monthly fee", v: "pay only when you buy" },
              { k: "Download anytime", v: "your list, your tools" },
            ].map((item) => (
              <div key={item.k} className="reveal-child card-lift rounded-xl border border-border bg-muted/40 px-4 py-5 text-center">
                <p className="text-lg font-bold text-foreground">{item.k}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{item.v}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      <section className="border-b border-border bg-white">
        <Reveal className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Leads that help you close — not compete</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Most “lead” platforms sell the same contact to several buyers. You dial, someone else already did. Here,
            every lead is exclusive: you buy it, you own the outreach window. Simple.
          </p>
          <div className="mx-auto mt-6 h-1 w-16 rounded-full shimmer-line" />
        </Reveal>
      </section>

      <section id="how-it-works" className="scroll-mt-24 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <p className="mb-2 text-sm font-semibold text-primary">How it works</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Three steps to exclusive contacts</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground sm:text-base">
              From search to conversation — without wasting budget on shared lists.
            </p>
          </Reveal>

          <Reveal className="mt-12 grid gap-6 sm:grid-cols-3" stagger>
            {STEPS.map((step, i) => (
              <div key={step.title} className="reveal-child card-lift rounded-2xl border border-border bg-white p-6 shadow-sm">
                <div className="mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-sm font-bold text-white shadow-md shadow-primary/25">
                  {i + 1}
                </div>
                <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{step.body}</p>
              </div>
            ))}
          </Reveal>

          <Reveal className="mt-10 text-center">
            <Link
              to="/request-access"
              className="btn-pop inline-flex rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
            >
              Request access
            </Link>
          </Reveal>
        </div>
      </section>

      <section id="product" className="scroll-mt-24 border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Who wins with LeadStack</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">If you sell B2B and need fresh conversations, this is for you.</p>
          </Reveal>
          <Reveal className="mt-12 grid gap-6 sm:grid-cols-3" stagger>
            {WHO_FOR.map((item) => (
              <div key={item.title} className="reveal-child card-lift rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">What you get with every lead</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">Enough to decide before you buy. Full contacts after you pay.</p>
          </Reveal>
          <Reveal className="mt-12 grid gap-6 md:grid-cols-2" stagger>
            {IN_A_LEAD.map((col) => (
              <div key={col.label} className="reveal-child card-lift rounded-2xl border border-border bg-muted/20 p-6 shadow-sm">
                <h3 className="mb-4 text-sm font-semibold text-foreground">{col.label}</h3>
                <ul className="space-y-2.5">
                  {col.items.map((item) => (
                    <li key={item} className="flex items-start gap-2.5 text-sm text-muted-foreground">
                      <span className="mt-0.5 font-bold text-primary">✓</span>
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Find companies that fit your offer</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">Zero in on your market — then buy only the matches.</p>
          </Reveal>
          <Reveal className="mx-auto mt-10 flex max-w-3xl flex-wrap justify-center gap-2" stagger>
            {FILTERS.map((f) => (
              <span
                key={f}
                className="reveal-child rounded-full border border-border bg-white px-3.5 py-1.5 text-sm font-medium text-foreground shadow-sm transition hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
              >
                {f}
              </span>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Why buyers stick with exclusive leads</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">More conversations that actually go somewhere.</p>
          </Reveal>
          <Reveal className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" stagger>
            {FEATURES.map((feature) => (
              <div key={feature.title} className="reveal-child card-lift rounded-2xl border border-border bg-white p-5 shadow-sm">
                <div className="mb-3 h-1.5 w-8 rounded-full bg-primary" />
                <h3 className="mb-1.5 font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Shared lists vs exclusive leads</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">Same budget. Very different results.</p>
          </Reveal>
          <Reveal className="mt-12 grid gap-6 md:grid-cols-2" stagger>
            {COMPARE.map((col) => (
              <div
                key={col.label}
                className={`reveal-child card-lift rounded-2xl border p-6 shadow-sm ${
                  col.bad ? "border-border bg-white" : "border-primary/30 bg-primary/5"
                }`}
              >
                <h3 className={`mb-4 text-base font-semibold ${col.bad ? "text-muted-foreground" : "text-primary"}`}>
                  {col.label}
                </h3>
                <ul className="space-y-3">
                  {col.points.map((p) => (
                    <li key={p} className="flex gap-2.5 text-sm text-muted-foreground">
                      <span className={col.bad ? "text-destructive" : "font-bold text-primary"}>{col.bad ? "×" : "✓"}</span>
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">After you buy</h2>
            <p className="mt-3 text-sm text-muted-foreground sm:text-base">Your leads stay with you — ready to call, email, or export.</p>
          </Reveal>
          <Reveal className="mt-12 grid gap-6 sm:grid-cols-3" stagger>
            {AFTER_BUY.map((item) => (
              <div key={item.title} className="reveal-child card-lift rounded-2xl border border-border bg-white p-6 shadow-sm">
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="pricing" className="scroll-mt-24 border-t border-border bg-muted/30">
        <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <Reveal>
            <p className="mb-2 text-sm font-semibold text-primary">Pricing</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Clear prices. No monthly trap.</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Choose how many leads you need, see the total, then pay. Buy more, pay less per lead. No subscription
              required.
            </p>
          </Reveal>
          <Reveal className="mt-8 rounded-2xl border border-border bg-white p-6 text-left shadow-sm sm:p-8">
            <ul className="space-y-3 text-sm text-muted-foreground">
              {[
                ["See the total first", " — no guesswork at checkout"],
                ["Volume rewards", " — larger orders cost less per lead"],
                ["Pay only for what you get", " — never charged for empty inventory"],
                ["No monthly fee", " — buy when you need pipeline"],
                ["UPI & cards", " — checkout the way India already pays"],
              ].map(([strong, rest]) => (
                <li key={strong} className="flex gap-3">
                  <span className="mt-0.5 font-bold text-primary">✓</span>
                  <span>
                    <strong className="text-foreground">{strong}</strong>
                    {rest}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Link
                to="/request-access"
                className="btn-pop inline-flex justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
              >
                Request access
              </Link>
              <Link
                to="/login"
                className="inline-flex justify-center rounded-lg border border-border px-5 py-2.5 text-sm font-medium transition hover:bg-muted/50"
              >
                Already approved? Log in
              </Link>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-white">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Safe, simple, supported</h2>
          </Reveal>
          <Reveal className="mt-12 grid gap-6 sm:grid-cols-3" stagger>
            {[
              {
                title: "Invite-only access",
                body: "Request access with your business details. We review and open accounts for real buyers.",
              },
              {
                title: "Your data stays yours",
                body: "Buyer accounts are separate. You only see leads you browse and purchase.",
              },
              {
                title: "Real people on support",
                body: (
                  <>
                    Questions?{" "}
                    <a href="mailto:support@equidamai.com" className="font-medium text-primary hover:underline">
                      support@equidamai.com
                    </a>
                  </>
                ),
              },
            ].map((item) => (
              <div key={item.title} className="reveal-child card-lift rounded-2xl border border-border p-6 shadow-sm">
                <h3 className="mb-2 font-semibold">{item.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      <section id="company" className="scroll-mt-24 border-t border-border bg-muted/30">
        <Reveal className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <p className="mb-2 text-sm font-semibold text-primary">About us</p>
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">From LeadStack’s sales floor to your pipeline</h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            We sell B2B every day. When a lead is no longer right for us, we can offer it to you — exclusively — so good
            opportunities keep moving and you get contacts worth calling.
          </p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a href="mailto:support@equidamai.com" className="inline-flex text-sm font-semibold text-primary hover:underline">
              Talk to us →
            </a>
            <Link to="/terms" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link to="/privacy" className="text-sm font-medium text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
          </div>
        </Reveal>
      </section>

      <section id="faq" className="scroll-mt-24 border-t border-border bg-white">
        <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
          <Reveal className="mb-8 text-center">
            <p className="mb-2 text-sm font-semibold text-primary">FAQ</p>
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Questions buyers ask first</h2>
            <p className="mt-3 text-sm text-muted-foreground">
              Still curious?{" "}
              <a href="mailto:support@equidamai.com" className="font-semibold text-primary hover:underline">
                Email us
              </a>
              .
            </p>
          </Reveal>
          <Reveal className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm">
            {FAQS.map((faq) => (
              <FaqItem key={faq.q} q={faq.q} a={faq.a} />
            ))}
          </Reveal>
        </div>
      </section>

      <section className="border-t border-border bg-hero-grid">
        <Reveal className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6 sm:py-20">
          <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">Ready for leads only you can call?</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-muted-foreground">
            Request access. Once approved, browse companies that fit, see clear prices, and buy contacts you own.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/request-access"
              className="btn-pop inline-flex w-full justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground sm:w-auto"
            >
              Request access
            </Link>
            <Link to="/login" className="inline-flex w-full justify-center text-sm font-semibold text-primary sm:w-auto">
              Log in →
            </Link>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No card required to apply.</p>
        </Reveal>
      </section>

      <PublicFooter />
    </div>
  );
}
