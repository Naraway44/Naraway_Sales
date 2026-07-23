import { FormEvent, useState } from "react";
import { checkout, searchLeads } from "@/api/marketplace";
import { MarketplaceFilters, SearchResult } from "@/api/types";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const emptyFilters: MarketplaceFilters = {};

export function CatalogPage() {
  const [filters, setFilters] = useState<MarketplaceFilters>(emptyFilters);
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setCheckoutError("");
    try {
      const data = await searchLeads(filters, quantity);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  function updateFilter<K extends keyof MarketplaceFilters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function startCheckout() {
    setCheckoutError("");
    try {
      const order = await checkout(filters, quantity);
      const razorpay = new window.Razorpay({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        name: "Naraway Lead Marketplace",
        description: `${order.leadCount} lead${order.leadCount === 1 ? "" : "s"}`,
        handler: () => {
          setPurchaseComplete(true);
          setResult(null);
        },
      });
      razorpay.open();
    } catch {
      setCheckoutError("Couldn't start checkout — please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold">Browse Leads</h1>

      {purchaseComplete && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          Purchase complete — check your dashboard for the leads.
        </div>
      )}

      <form onSubmit={runSearch} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Service</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("service", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Industry</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("industry", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("city", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("state", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Lost Reason</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("lostReason", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Keyword</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("keyword", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal Value Min</label>
          <input type="number" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dealValueMin", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal Value Max</label>
          <input type="number" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dealValueMax", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Listed From</label>
          <input type="date" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dateListedFrom", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Listed To</label>
          <input type="date" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dateListedTo", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">How many leads?</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {loading ? "Checking..." : "Check availability"}
          </button>
        </div>
      </form>

      {result && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm">
            <strong>{result.availableCount}</strong> leads match your filters.
          </p>
          {result.deliverableQuantity > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                You'll get <strong>{result.deliverableQuantity}</strong> lead{result.deliverableQuantity === 1 ? "" : "s"} for{" "}
                <strong>₹{result.estimatedTotal}</strong>.
              </p>
              {checkoutError && <p className="mt-2 text-sm text-destructive">{checkoutError}</p>}
              <button onClick={startCheckout} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Buy now
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No leads currently available matching these filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
