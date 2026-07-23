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
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">My Leads</h1>
        {leads.length > 0 && (
          <button onClick={() => exportPurchasesCsv()} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
            Download CSV
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't purchased any leads yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Exclusive Until</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="px-3 py-2">{lead.companyName}</td>
                  <td className="px-3 py-2">{lead.contactPerson ?? "-"}</td>
                  <td className="px-3 py-2">{lead.phone ?? "-"}</td>
                  <td className="px-3 py-2">{lead.email ?? "-"}</td>
                  <td className="px-3 py-2">{new Date(lead.exclusiveUntil).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
