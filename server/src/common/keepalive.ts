// Supabase's free-tier Postgres pauses after a period with no queries. This keeps it
// alive with a trivial daily query, run from inside the app process. (Keeping the Render
// backend itself awake needs an *external* trigger — a timer inside the process can't
// wake the process back up once Render has already suspended it — see
// .github/workflows/keepalive.yml, which pings /health every 4 minutes from GitHub
// Actions instead.)
import { prisma } from "@/common/prisma";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function pingDatabase() {
  try {
    await prisma.$queryRawUnsafe("SELECT 1");
    console.log("[keepalive] database ping ok");
  } catch (e) {
    console.error("[keepalive] database ping failed:", e instanceof Error ? e.message : e);
  }
}

export function startKeepalive() {
  // Run once shortly after boot (covers deploys that land during a quiet window), then
  // once every 24h for the life of the process.
  void pingDatabase();
  setInterval(() => void pingDatabase(), ONE_DAY_MS);
}
