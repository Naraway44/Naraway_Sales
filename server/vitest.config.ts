import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    setupFiles: ["./src/test/setup.ts"],
    // Tests hit the real dev Supabase DB (pooled, 5-connection limit) and share mutable
    // state (Team.lastAssignedIdx for round-robin) — running files/tests in parallel would
    // cause connection exhaustion and cross-test races, so everything runs sequentially.
    fileParallelism: false,
    pool: "threads",
    poolOptions: {
      threads: { singleThread: true },
    },
    // Tests hit a remote Supabase pooler (not local Postgres), and run single-threaded, so
    // per-test latency varies more than a typical unit-test suite — generous headroom
    // avoids flaky failures that are really just network variance, not logic bugs.
    testTimeout: 45000,
  },
});
