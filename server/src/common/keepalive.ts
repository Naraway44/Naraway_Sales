// Supabase's free-tier Postgres pauses after a period with no queries. This keeps it
// alive with a trivial query, run from inside the app process (Keeping the Render backend
// itself awake needs an *external* trigger instead — a timer inside the process can't
// wake the process back up once Render has already suspended it — that's handled by an
// external cron hitting /health every few minutes).
//
// The database ping is driven off that same /health traffic rather than only a bare
// setInterval: a setInterval resets on every deploy/restart, so relying on it alone could
// silently skip a day whenever a deploy happens to land near the 24h mark. Piggybacking
// on real inbound traffic means it self-corrects as long as something keeps pinging
// /health, which we already need for the backend anyway.
import { prisma } from "@/common/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let lastPingedAt = 0;

async function pingDatabase() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    console.log("[keepalive] database ping ok");
  } catch (e) {
    console.error("[keepalive] database ping failed:", e instanceof Error ? e.message : e);
  }
}

export function startKeepalive() {
  // Covers a deploy that lands during a long quiet window before the first health check
  // arrives.
  lastPingedAt = Date.now();
  void pingDatabase();
}

// Call this from the /health handler. Cheap no-op most of the time (just a Date.now() and
// a comparison) — only actually queries the database once ~24h has passed since the last
// ping.
export function onHealthCheck() {
  const now = Date.now();
  if (now - lastPingedAt >= ONE_DAY_MS) {
    lastPingedAt = now;
    void pingDatabase();
  }
}
