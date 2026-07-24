import { FormEvent, useState } from "react";
import { checkout, searchLeads } from "@/api/marketplace";
import { MarketplaceFilters, SearchResult } from "@/api/types";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const emptyFilters: MarketplaceFilters = {};

const FILTER_FIELDS: { key: keyof MarketplaceFilters; label: string; type?: string }[] = [
  { key: "service", label: "Service" },
  { key: "industry", label: "Industry" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "lostReason", label: "Lost Reason" },
  { key: "keyword", label: "Company name" },
];

const RANGE_FIELDS: { key: keyof MarketplaceFilters; label: string; type: string }[] = [
  { key: "dealValueMin", label: "Min", type: "number" },
  { key: "dealValueMax", label: "Max", type: "number" },
];

const DATE_FIELDS: { key: keyof MarketplaceFilters; label: string }[] = [
  { key: "dateListedFrom", label: "From" },
  { key: "dateListedTo", label: "To" },
];

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-border py-4 first:pt-0 last:border-0">
      <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

export function CatalogPage() {
  const [filters, setFilters] = useState<MarketplaceFilters>(emptyFilters);
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setCheckoutError("");
    try {
      const data = await searchLeads(filters, quantity);
      setResult(data);
      setHasSearched(true);
    } finally {
      setLoading(false);
    }
  }

  function updateFilter<K extends keyof MarketplaceFilters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  function clearAll() {
    setFilters(emptyFilters);
    setResult(null);
    setHasSearched(false);
  }

  async function startCheckout() {
    setCheckoutError("");
    setCheckingOut(true);
    try {
      const order = await checkout(filters, quantity);
      const razorpay = new window.Razorpay({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        name: "Naraway Lead Marketplace",
        description: `${order.leadCount} lead${order.leadCount === 1 ? "" : "s"}`,
        theme: { color: "#0f766e" },
        handler: () => {
          setPurchaseComplete(true);
          setResult(null);
          setHasSearched(false);
        },
        modal: { ondismiss: () => setCheckingOut(false) },
      });
      razorpay.open();
    } catch {
      setCheckoutError("Couldn't start checkout — please try again.");
      setCheckingOut(false);
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="mx-auto flex max-w-7xl gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {/* Left sidebar — filters, Hunter Discover-style */}
      <aside className="w-64 shrink-0">
        <form onSubmit={runSearch} className="sticky top-6 rounded-xl border border-border bg-card p-4 shadow-sm">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Filters</h2>
            {activeFilterCount > 0 && (
              <button type="button" onClick={clearAll} className="text-xs font-medium text-primary hover:underline">
                Clear all
              </button>
            )}
          </div>

          <div>
            {FILTER_FIELDS.map((field) => (
              <FilterField key={field.key} label={field.label}>
                <input
                  type="text"
                  value={(filters[field.key] as string) ?? ""}
                  onChange={(e) => updateFilter(field.key, e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </FilterField>
            ))}

            <FilterField label="Deal Value (₹)">
              <div className="flex gap-2">
                {RANGE_FIELDS.map((field) => (
                  <input
                    key={field.key}
                    type={field.type}
                    placeholder={field.label}
                    value={(filters[field.key] as string) ?? ""}
                    onChange={(e) => updateFilter(field.key, e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                ))}
              </div>
            </FilterField>

            <FilterField label="Listed Date">
              <div className="flex gap-2">
                {DATE_FIELDS.map((field) => (
                  <input
                    key={field.key}
                    type="date"
                    value={(filters[field.key] as string) ?? ""}
                    onChange={(e) => updateFilter(field.key, e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-xs outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                ))}
              </div>
            </FilterField>

            <FilterField label="How many leads?">
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </FilterField>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-4 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
          >
            {loading ? "Checking..." : "Apply filters"}
          </button>
        </form>
      </aside>

      {/* Main content — live count, buy action, results table */}
      <main className="min-w-0 flex-1">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Browse Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Naraway's released lead pool. Contact details are revealed only after purchase.
          </p>
        </div>

        {purchaseComplete && (
          <div className="mb-6 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm text-primary">
            <strong>Purchase complete.</strong> Head to <span className="underline">My Leads</span> to view and export them.
          </div>
        )}

        {!hasSearched && (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Set your filters on the left and click <strong>Apply filters</strong> to see matching leads.
          </div>
        )}

        {hasSearched && result && (
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-3 border-b border-border bg-muted/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm">
                  <strong className="text-base">{result.availableCount}</strong>{" "}
                  <span className="text-muted-foreground">lead{result.availableCount === 1 ? "" : "s"} match your filters</span>
                </p>
                {result.deliverableQuantity > 0 ? (
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    You'll get <strong className="text-foreground">{result.deliverableQuantity}</strong> for{" "}
                    <strong className="text-foreground">₹{result.estimatedTotal}</strong>
                  </p>
                ) : (
                  <p className="mt-0.5 text-sm text-muted-foreground">Nothing available for these filters right now.</p>
                )}
              </div>
              {result.deliverableQuantity > 0 && (
                <div className="flex flex-col items-start gap-1 sm:items-end">
                  <button
                    onClick={startCheckout}
                    disabled={checkingOut}
                    className="rounded-md bg-primary px-5 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
                  >
                    {checkingOut ? "Opening checkout..." : "Buy now"}
                  </button>
                  {checkoutError && <p className="text-xs text-destructive">{checkoutError}</p>}
                </div>
              )}
            </div>

            {result.items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Company</th>
                      <th className="px-5 py-2.5 font-medium">Industry</th>
                      <th className="px-5 py-2.5 font-medium">Location</th>
                      <th className="px-5 py-2.5 font-medium">Service</th>
                      <th className="px-5 py-2.5 font-medium">Lost Reason</th>
                      <th className="px-5 py-2.5 font-medium">Listed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.items.map((lead) => (
                      <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                        <td className="px-5 py-2.5 font-medium">{lead.companyName}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">{lead.industry ?? "—"}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">
                          {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-5 py-2.5 text-muted-foreground">{lead.service ?? "—"}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">{lead.lostReason ?? "—"}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">{new Date(lead.listedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {result.availableCount > result.items.length && (
                  <p className="border-t border-border px-5 py-3 text-xs text-muted-foreground">
                    Showing {result.items.length} of {result.availableCount} matching leads.
                  </p>
                )}
              </div>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No leads currently match these filters. Try widening your search.
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
