import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { checkout, myPurchases, searchLeads, SortBy, SortDir } from "@/api/marketplace";
import { MarketplaceFilters, SearchResult } from "@/api/types";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => {
      open: () => void;
      on?: (event: string, handler: () => void) => void;
    };
  }
}

const emptyFilters: MarketplaceFilters = {};
const SAVED_SEARCHES_KEY = "naraway_marketplace_saved_searches";

interface SavedSearch {
  name: string;
  filters: MarketplaceFilters;
}

function loadSavedSearches(): SavedSearch[] {
  try {
    const raw = localStorage.getItem(SAVED_SEARCHES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

const FILTER_FIELDS: { key: keyof MarketplaceFilters; label: string }[] = [
  { key: "service", label: "Service" },
  { key: "industry", label: "Industry" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "lostReason", label: "Notes" },
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
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortBy>("listedAt");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [checkingOut, setCheckingOut] = useState(false);
  const [purchaseComplete, setPurchaseComplete] = useState(false);
  const [purchasesReady, setPurchasesReady] = useState(0);
  const [searchError, setSearchError] = useState("");
  const [savedSearches, setSavedSearches] = useState<SavedSearch[]>(loadSavedSearches);
  const purchaseBaseline = useRef(0);

  useEffect(() => {
    localStorage.setItem(SAVED_SEARCHES_KEY, JSON.stringify(savedSearches));
  }, [savedSearches]);

  // Load the full listed pool on first visit so buyers aren't stuck on an empty dashed box.
  useEffect(() => {
    void runSearch(undefined, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional mount-only bootstrap
  }, []);

  // After Razorpay success, payment confirmation is webhook-driven — poll My Leads until new rows appear.
  useEffect(() => {
    if (!purchaseComplete) return;
    let cancelled = false;
    let attempts = 0;
    const tick = async () => {
      try {
        const leads = await myPurchases();
        if (cancelled) return;
        const gained = Math.max(0, leads.length - purchaseBaseline.current);
        setPurchasesReady(gained);
        if (gained > 0 || attempts >= 12) return;
      } catch {
        /* keep trying briefly */
      }
      attempts += 1;
      if (!cancelled && attempts < 12) window.setTimeout(tick, 2500);
    };
    void tick();
    return () => {
      cancelled = true;
    };
  }, [purchaseComplete]);

  async function runSearch(e?: FormEvent, targetPage = 1, targetSortBy = sortBy, targetSortDir = sortDir) {
    e?.preventDefault();
    setLoading(true);
    setCheckoutError("");
    setSearchError("");
    try {
      const data = await searchLeads(filters, quantity, targetPage, targetSortBy, targetSortDir);
      setResult(data);
      setPage(targetPage);
      setHasSearched(true);
    } catch {
      setSearchError("Couldn't load leads — please try again.");
      setResult(null);
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

  function saveCurrentSearch() {
    const name = window.prompt("Name this search (e.g. \"Retail leads, Delhi NCR\")");
    if (!name) return;
    setSavedSearches((prev) => [...prev.filter((s) => s.name !== name), { name, filters }]);
  }

  function loadSavedSearch(saved: SavedSearch) {
    setFilters(saved.filters);
    // Re-run after state settles — pass filters via a dedicated search call.
    setLoading(true);
    setSearchError("");
    searchLeads(saved.filters, quantity, 1, sortBy, sortDir)
      .then((data) => {
        setResult(data);
        setPage(1);
        setHasSearched(true);
      })
      .catch(() => {
        setSearchError("Couldn't load leads — please try again.");
        setResult(null);
        setHasSearched(true);
      })
      .finally(() => setLoading(false));
  }

  function removeSavedSearch(name: string) {
    setSavedSearches((prev) => prev.filter((s) => s.name !== name));
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
        handler: async () => {
          try {
            const before = await myPurchases();
            purchaseBaseline.current = before.length;
          } catch {
            purchaseBaseline.current = 0;
          }
          setPurchasesReady(0);
          setPurchaseComplete(true);
          setCheckingOut(false);
          setResult(null);
          setHasSearched(false);
        },
        modal: { ondismiss: () => setCheckingOut(false) },
      });
      razorpay.on?.("payment.failed", () => {
        setCheckoutError("Payment failed — please try again.");
        setCheckingOut(false);
      });
      razorpay.open();
    } catch {
      setCheckoutError("Couldn't start checkout — please try again.");
      setCheckingOut(false);
    }
  }

  const activeFilterCount = Object.values(filters).filter(Boolean).length;

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:flex-row sm:px-6 sm:py-8">
      {/* Left sidebar — filters, Hunter Discover-style */}
      <aside className="w-full shrink-0 sm:w-64">
        <form onSubmit={(e) => runSearch(e, 1)} className="rounded-xl border border-border bg-card p-4 shadow-sm sm:sticky sm:top-6">
          <div className="mb-1 flex items-center justify-between">
            <h2 className="text-sm font-semibold">Filters</h2>
            <div className="flex items-center gap-2">
              <button type="button" onClick={saveCurrentSearch} className="text-xs font-medium text-primary hover:underline">
                Save
              </button>
              {activeFilterCount > 0 && (
                <button type="button" onClick={clearAll} className="text-xs font-medium text-muted-foreground hover:underline">
                  Clear all
                </button>
              )}
            </div>
          </div>

          {savedSearches.length > 0 && (
            <div className="mb-2 border-b border-border pb-3">
              <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Saved</p>
              <div className="flex flex-col gap-1">
                {savedSearches.map((saved) => (
                  <div key={saved.name} className="flex items-center justify-between rounded-md px-1.5 py-1 hover:bg-muted/50">
                    <button
                      type="button"
                      onClick={() => loadSavedSearch(saved)}
                      className="truncate text-left text-xs text-foreground hover:text-primary"
                      title={saved.name}
                    >
                      {saved.name}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeSavedSearch(saved.name)}
                      className="ml-2 text-xs text-muted-foreground hover:text-destructive"
                      aria-label={`Remove ${saved.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

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
            {purchasesReady > 0 ? (
              <>
                <strong>Your leads are ready.</strong>{" "}
                <Link to="/dashboard" className="font-semibold underline">
                  Open My Leads
                </Link>{" "}
                to view and export {purchasesReady} new lead{purchasesReady === 1 ? "" : "s"}.
              </>
            ) : (
              <>
                <strong>Payment received.</strong> Confirming your purchase… leads usually show in{" "}
                <Link to="/dashboard" className="font-semibold underline">
                  My Leads
                </Link>{" "}
                within a minute.
              </>
            )}
          </div>
        )}

        {searchError && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
            {searchError}
          </div>
        )}

        {!hasSearched && loading && (
          <div className="rounded-xl border border-border bg-card p-12 text-center text-sm text-muted-foreground">
            Loading leads…
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
                <div className="flex items-center justify-end gap-2 border-b border-border px-5 py-2">
                  <label className="text-xs text-muted-foreground">Sort by</label>
                  <select
                    value={`${sortBy}:${sortDir}`}
                    onChange={(e) => {
                      const [nextSortBy, nextSortDir] = e.target.value.split(":") as [SortBy, SortDir];
                      setSortBy(nextSortBy);
                      setSortDir(nextSortDir);
                      runSearch(undefined, 1, nextSortBy, nextSortDir);
                    }}
                    className="rounded-md border border-border bg-background px-2 py-1 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="listedAt:asc">Oldest listed first</option>
                    <option value="listedAt:desc">Newest listed first</option>
                    <option value="companyName:asc">Company name (A–Z)</option>
                    <option value="companyName:desc">Company name (Z–A)</option>
                    <option value="expectedDealValue:desc">Deal value (high to low)</option>
                    <option value="expectedDealValue:asc">Deal value (low to high)</option>
                  </select>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                      <th className="px-5 py-2.5 font-medium">Company</th>
                      <th className="px-5 py-2.5 font-medium">Industry</th>
                      <th className="px-5 py-2.5 font-medium">Location</th>
                      <th className="px-5 py-2.5 font-medium">Service</th>
                      <th className="px-5 py-2.5 font-medium">Deal value</th>
                      <th className="px-5 py-2.5 font-medium">Notes</th>
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
                        <td className="px-5 py-2.5 text-muted-foreground">
                          {lead.expectedDealValue != null && lead.expectedDealValue !== ""
                            ? `₹${Number(lead.expectedDealValue).toLocaleString("en-IN")}`
                            : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-muted-foreground">{lead.lostReason ?? "—"}</td>
                        <td className="px-5 py-2.5 text-muted-foreground">{new Date(lead.listedAt).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="flex items-center justify-between border-t border-border px-5 py-3">
                  <p className="text-xs text-muted-foreground">
                    Page {result.page} of {result.totalPages} — {result.availableCount} total matching leads
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={page <= 1 || loading}
                      onClick={() => runSearch(undefined, page - 1)}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium transition hover:bg-muted/50 disabled:opacity-40"
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      disabled={page >= result.totalPages || loading}
                      onClick={() => runSearch(undefined, page + 1)}
                      className="rounded-md border border-border px-3 py-1 text-xs font-medium transition hover:bg-muted/50 disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                </div>
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
