// Both Supabase (free-tier Postgres) and Render (free-tier web services) pause/spin down
// an app after a period with no traffic. This keeps both alive with a cheap daily ping:
// one trivial query against the database, and one HTTP request against our own /health
// endpoint (self-ping — needed because a Render free service only counts *inbound* HTTP
// traffic as activity, not outbound calls the process makes on its own).
import { prisma } from "@/common/prisma";
import { env } from "@/common/env";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function pingDatabase() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    console.log("[keepalive] database ping ok");
  } catch (e) {
    console.error("[keepalive] database ping failed:", e instanceof Error ? e.message : e);
  }
}

async function pingSelf() {
  try {
    const url = `${env.selfUrl.replace(/\/$/, "")}/health`;
    const res = await fetch(url);
    console.log(`[keepalive] self ping ok (${res.status})`);
  } catch (e) {
    console.error("[keepalive] self ping failed:", e instanceof Error ? e.message : e);
  }
}

export function startKeepalive() {
  // Run once shortly after boot (covers deploys that land during a quiet window), then
  // once every 24h for the life of the process.
  void pingDatabase();
  void pingSelf();
  setInterval(() => void pingDatabase(), ONE_DAY_MS);
  setInterval(() => void pingSelf(), ONE_DAY_MS);
}
