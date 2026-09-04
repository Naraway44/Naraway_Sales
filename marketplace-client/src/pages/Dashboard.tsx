import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { exportPurchasesCsv, myPurchases } from "@/api/marketplace";
import { PurchasedLead } from "@/api/types";

export function DashboardPage() {
  const [leads, setLeads] = useState<PurchasedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    myPurchases()
      .then(setLeads)
      .catch(() => setError("Couldn't load your leads. Please refresh and try again."))
      .finally(() => setLoading(false));
  }, []);

  const filtered = leads.filter((lead) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return [lead.companyName, lead.contactPerson, lead.email, lead.phone, lead.industry, lead.city, lead.state, lead.service]
      .filter(Boolean)
      .some((v) => String(v).toLowerCase().includes(q));
  });

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Leads you've purchased, exclusive to you for 2 months from purchase.{" "}
            <a href="mailto:support@equidamai.com" className="text-primary hover:underline">
              Report an issue with a lead
            </a>
          </p>
        </div>
        {leads.length > 0 && (
          <div className="flex gap-2">
            <Link
              to="/catalog"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              Browse more leads
            </Link>
            <button
              onClick={() => exportPurchasesCsv()}
              className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-muted/50"
            >
              Download CSV
            </button>
          </div>
        )}
      </div>

      {leads.length > 0 && (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Leads owned</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">{leads.length}</div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Total invested</div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              ₹
              {leads
                .reduce((sum, l) => sum + (l.pricePaid != null && l.pricePaid !== "" ? Number(l.pricePaid) : 0), 0)
                .toLocaleString("en-IN")}
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Next exclusivity ends
            </div>
            <div className="mt-1 text-2xl font-semibold tracking-tight">
              {new Date(
                Math.min(...leads.map((l) => new Date(l.exclusiveUntil).getTime()))
              ).toLocaleDateString()}
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          Loading...
        </div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          You haven't purchased any leads yet. Head to{" "}
          <Link to="/catalog" className="font-medium text-primary hover:underline">
            Browse
          </Link>{" "}
          to get started.
        </div>
      ) : (
        <>
          <div className="mb-4">
            <input
              type="search"
              placeholder="Search company, contact, email, phone…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full max-w-md rounded-md border border-border bg-card px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-5 py-2.5 font-medium">Company</th>
                    <th className="px-5 py-2.5 font-medium">Contact</th>
                    <th className="px-5 py-2.5 font-medium">Phone</th>
                    <th className="px-5 py-2.5 font-medium">Email</th>
                    <th className="px-5 py-2.5 font-medium">Location</th>
                    <th className="px-5 py-2.5 font-medium">Service</th>
                    <th className="px-5 py-2.5 font-medium">Paid</th>
                    <th className="px-5 py-2.5 font-medium">Exclusive until</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((lead) => (
                    <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                      <td className="px-5 py-2.5 font-medium">
                        <div>{lead.companyName}</div>
                        {lead.industry && (
                          <div className="text-xs font-normal text-muted-foreground">{lead.industry}</div>
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">{lead.contactPerson ?? "—"}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="text-primary hover:underline">
                            {lead.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="text-primary hover:underline">
                            {lead.email}
                          </a>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {[lead.city, lead.state].filter(Boolean).join(", ") || "—"}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">{lead.service ?? "—"}</td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {lead.pricePaid != null && lead.pricePaid !== ""
                          ? `₹${Number(lead.pricePaid).toLocaleString("en-IN")}`
                          : "—"}
                      </td>
                      <td className="px-5 py-2.5 text-muted-foreground">
                        {new Date(lead.exclusiveUntil).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filtered.length === 0 && (
              <div className="p-8 text-center text-sm text-muted-foreground">No leads match that search.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
