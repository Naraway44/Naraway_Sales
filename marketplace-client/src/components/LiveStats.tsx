import { useEffect, useState } from "react";
import { getMarketplaceStats, type MarketplaceStats } from "@/api/marketplace";

// Real numbers straight from the database — no hardcoded figures here. Self-updates on
// every page load, so it stays accurate without anyone touching this file again.
export function LiveStats() {
  const [stats, setStats] = useState<MarketplaceStats | null>(null);

  useEffect(() => {
    getMarketplaceStats()
      .then(setStats)
      .catch(() => setStats(null));
  }, []);

  if (!stats) return null;

  const maxDaily = Math.max(1, ...stats.dailyLeadsScored.map((d) => d.count));

  return (
    <section className="border-t border-border bg-foreground text-white">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <p className="mb-2 text-sm font-semibold text-primary">Live</p>
        <h2 className="max-w-xl text-2xl font-bold tracking-tight sm:text-3xl">
          Our AI is scoring and matching leads right now.
        </h2>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
          LeadStack runs its own matching engine continuously — every lead below reflects real activity in our
          system, updated live.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
          <div className="border-l-2 border-primary pl-4">
            <p className="text-4xl font-extrabold tracking-tight">{stats.leadsInCatalog.toLocaleString()}</p>
            <p className="mt-1 text-sm text-white/70">Leads available right now.</p>
          </div>
          <div className="border-l-2 border-primary pl-4">
            <p className="text-4xl font-extrabold tracking-tight">{stats.leadsScoredLast30Days.toLocaleString()}</p>
            <p className="mt-1 text-sm text-white/70">Leads scored by our AI in the last 30 days.</p>
          </div>
          <div className="border-l-2 border-primary pl-4">
            <p className="text-4xl font-extrabold tracking-tight">{stats.leadsMatchedToBuyers.toLocaleString()}</p>
            <p className="mt-1 text-sm text-white/70">Leads matched to a buyer, exclusively.</p>
          </div>
        </div>

        {stats.dailyLeadsScored.length > 1 && (
          <div className="mt-12">
            <p className="mb-3 text-xs text-white/50">Leads scored per day — last 30 days</p>
            <div className="flex h-24 items-end gap-1">
              {stats.dailyLeadsScored.map((d) => (
                <div
                  key={d.date}
                  title={`${d.date}: ${d.count}`}
                  className="flex-1 rounded-t bg-primary/70"
                  style={{ height: `${Math.max(4, (d.count / maxDaily) * 100)}%` }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
