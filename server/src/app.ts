import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "@/common/env";
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

export function createApp() {
  const app = express();

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

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

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

  app.use(errorHandler);

  return app;
}
