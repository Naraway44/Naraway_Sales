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

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: "5mb" }));
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

  app.use(errorHandler);

  return app;
}
