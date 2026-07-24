import { useEffect, useState } from "react";
import { exportPurchasesCsv, myPurchases } from "@/api/marketplace";
import { PurchasedLead } from "@/api/types";

export function DashboardPage() {
  const [leads, setLeads] = useState<PurchasedLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myPurchases()
      .then(setLeads)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Leads</h1>
          <p className="mt-1 text-sm text-muted-foreground">Leads you've purchased — exclusive to you for 2 months from purchase.</p>
        </div>
        {leads.length > 0 && (
          <button
            onClick={() => exportPurchasesCsv()}
            className="rounded-md border border-border bg-card px-4 py-2 text-sm font-medium shadow-sm transition hover:bg-muted/50"
          >
            Download CSV
          </button>
        )}
      </div>

      {loading ? (
        <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">Loading...</div>
      ) : leads.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
          You haven't purchased any leads yet — head to <span className="font-medium text-foreground">Browse</span> to get started.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2.5 font-medium">Company</th>
                  <th className="px-5 py-2.5 font-medium">Contact</th>
                  <th className="px-5 py-2.5 font-medium">Phone</th>
                  <th className="px-5 py-2.5 font-medium">Email</th>
                  <th className="px-5 py-2.5 font-medium">Exclusive Until</th>
                </tr>
              </thead>
              <tbody>
                {leads.map((lead) => (
                  <tr key={lead.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-5 py-2.5 font-medium">{lead.companyName}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{lead.contactPerson ?? "—"}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{lead.phone ?? "—"}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{lead.email ?? "—"}</td>
                    <td className="px-5 py-2.5 text-muted-foreground">{new Date(lead.exclusiveUntil).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
