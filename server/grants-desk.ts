/**
 * Local CLI for the grants engine. The engine itself now lives in
 * src/modules/grants/ and runs in-process inside the API server (see index.ts).
 *
 * This wrapper exists so the team can still drive a cycle by hand:
 *
 *   npm run grants-desk -- --once    one crawl cycle, then exit
 *   npm run grants-desk -- --demo    demo the recurring-vs-one-time retirement filter
 *
 * Needs DATABASE_URL — state lives in Postgres, not local files.
 */
import "dotenv/config";
import { prisma } from "@/common/prisma";
import { crawlCycle, readStore, runDemo } from "@/modules/grants/grants.engine";

async function main() {
  const args = process.argv.slice(2);

  if (args.includes("--demo")) {
    await runDemo();
    return;
  }

  if (args.includes("--once")) {
    const store = await crawlCycle(await readStore());
    console.log(
      `cycle ${store.cycle}: active=${store.active.length} removed=${store.removed.length} errors=${store.lastErrors.length}`
    );
    return;
  }

  console.log(
    [
      "Grants engine CLI",
      "",
      "  --once   run one crawl cycle against the DB, then exit",
      "  --demo   seed demo rows and show the active/removed split",
      "",
      "The continuous loop runs inside the API server itself.",
      "Enable it there with GRANTS_ENGINE_ENABLED=true.",
    ].join("\n")
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
