import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "@/common/env";
import { requireAuth, requireRole } from "@/common/middleware/auth";
import { errorHandler } from "@/common/middleware/errorHandler";
import { createLookupRouter } from "@/common/lookupModule";
import { authRouter } from "@/modules/auth/auth.controller";
import { usersRouter } from "@/modules/users/users.controller";
import { leadsRouter } from "@/modules/leads/leads.controller";
import { assignmentRulesRouter } from "@/modules/assignmentRules/assignmentRules.controller";
import { analyticsRouter } from "@/modules/analytics/analytics.controller";
import { resourcesRouter } from "@/modules/resources/resources.controller";
import { leadRequestsRouter } from "@/modules/leadRequests/leadRequests.controller";
import { attendanceRouter } from "@/modules/attendance/attendance.controller";
import { buyerAuthRouter } from "@/modules/buyerAuth/buyerAuth.controller";
import { buyersRouter } from "@/modules/buyers/buyers.controller";
import { marketplaceRouter } from "@/modules/marketplace/marketplace.controller";
import { assistantRouter } from "@/modules/assistant/assistant.controller";
import { grantsRouter } from "@/modules/grants/grants.controller";
import { onHealthCheck } from "@/common/keepalive";

export function createApp() {
  const app = express();

  // Render sits in front of the app as a reverse proxy and sets X-Forwarded-For on every
  // request. Without this, express-rate-limit throws on that header (and per-IP limiting
  // falls back to a single shared bucket for the whole service).
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(
    express.json({
      limit: "5mb",
      // Captures the raw request body alongside the parsed one, so the Razorpay webhook
      // handler can verify its HMAC signature against the exact bytes Razorpay signed —
      // signature verification breaks if it runs against a re-serialized JSON object
      // instead of the original wire bytes.
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      // Per-IP, not global — was fine for a handful of test users, but an office where
      // several reps share one public IP could realistically stack heartbeats (60s) +
      // alert polling (60s) + normal CRUD across multiple people against the same budget.
      // Raised for headroom now that the team's scaling to ~100 people.
      max: 2000,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/health", (_req, res) => {
    // Piggyback the daily database keepalive ping on real health-check traffic — see
    // common/keepalive.ts for why.
    onHealthCheck();
    res.json({ status: "ok" });
  });

  // TEMPORARY — one-off schema migration endpoint, remove after running once. Render's
  // free tier doesn't allow one-off jobs, and `prisma db push` fails against this
  // Supabase pooler URL (schema engine bug), so this runs the same raw SQL through the
  // normal query engine the app already connects with successfully. Idempotent
  // (IF NOT EXISTS everywhere) and gated by a one-time secret, not staff auth, since it
  // must run before any buyer/staff login even works.
  app.post("/internal/migrate-buyer-auth-x7f2q9", requireAuth, requireRole("FOUNDER"), async (_req, res) => {
    try {
      const { prisma } = await import("@/common/prisma");
      await prisma.$executeRawUnsafe(`ALTER TABLE "buyers" ALTER COLUMN "created_by_id" DROP NOT NULL`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "buyers" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false`
      );
      await prisma.$executeRawUnsafe(`ALTER TABLE "buyers" ADD COLUMN IF NOT EXISTS "email_verification_token" TEXT`);
      await prisma.$executeRawUnsafe(
        `ALTER TABLE "buyers" ADD COLUMN IF NOT EXISTS "email_verification_expires" TIMESTAMP(3)`
      );
      await prisma.$executeRawUnsafe(
        `CREATE UNIQUE INDEX IF NOT EXISTS "buyers_email_verification_token_key" ON "buyers"("email_verification_token")`
      );
      const backfilled = await prisma.$executeRawUnsafe(
        `UPDATE "buyers" SET "email_verified" = true WHERE "created_by_id" IS NOT NULL`
      );
      res.json({ ok: true, backfilled });
    } catch (e) {
      res.status(500).json({ ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  });

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/leads", leadsRouter);
  app.use("/api/v1/teams", createLookupRouter("team"));
  app.use("/api/v1/services", createLookupRouter("service"));
  app.use("/api/v1/lead-sources", createLookupRouter("leadSource"));
  app.use("/api/v1/assignment-rules", assignmentRulesRouter);
  app.use("/api/v1/analytics", analyticsRouter);
  app.use("/api/v1/resources", resourcesRouter);
  app.use("/api/v1/lead-requests", leadRequestsRouter);
  app.use("/api/v1/attendance", attendanceRouter);
  app.use("/api/v1/buyer-auth", buyerAuthRouter);
  app.use("/api/v1/buyers", buyersRouter);
  app.use("/api/v1/marketplace", marketplaceRouter);
  app.use("/api/v1/assistant", assistantRouter);
  // Gov grants desk — separate product surface from CRM/marketplace; staff-only.
  app.use("/api/v1/grants", grantsRouter);

  app.use(errorHandler);

  return app;
}
