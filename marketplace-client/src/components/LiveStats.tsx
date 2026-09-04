import { useEffect, useRef, useState } from "react";
import { getMarketplaceStats, type MarketplaceStats } from "@/api/marketplace";

/** Counts up to `value` once the element scrolls into view. The numbers are the proof on
 *  this section, so they earn the movement — everything else here stays still. Honours
 *  reduced-motion by rendering the final figure immediately. */
function useCountUp(value: number, durationMs = 1100) {
  const [shown, setShown] = useState(0);
  const ref = useRef<HTMLParagraphElement | null>(null);
  const done = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || done.current) return;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      done.current = true;
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting || done.current) return;
        done.current = true;
        observer.disconnect();

        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / durationMs);
          // Ease-out cubic: fast at first, settling onto the real figure rather than
          // stopping dead on it.
          setShown(Math.round(value * (1 - Math.pow(1 - progress, 3))));
          if (progress < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      },
      { threshold: 0.4 }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [value, durationMs]);

  return { ref, shown };
}

function Stat({ value, label }: { value: number; label: string }) {
  const { ref, shown } = useCountUp(value);
  return (
    <div className="border-l-2 border-primary pl-4">
      <p ref={ref} className="text-4xl font-extrabold tracking-tight tabular-nums">
        {shown.toLocaleString()}
      </p>
      <p className="mt-1 text-sm text-white/70">{label}</p>
    </div>
  );
}

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
          <Stat value={stats.leadsInCatalog} label="Leads available right now." />
          <Stat value={stats.leadsScoredLast30Days} label="Leads scored by our AI in the last 30 days." />
          <Stat value={stats.leadsMatchedToBuyers} label="Leads matched to a buyer, exclusively." />
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
