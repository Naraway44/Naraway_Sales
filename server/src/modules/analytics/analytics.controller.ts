import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { analyticsService } from "./analytics.service";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requirePasswordChanged);

analyticsRouter.get(
  "/overview",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (_req, res) => {
    res.json(await analyticsService.overview());
  })
);

/** Org-wide neglected-leads triage — worst 20 plus by-rep and by-service groupings. */
analyticsRouter.get(
  "/neglected-leads",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (_req, res) => {
    res.json(await analyticsService.orgNeglectedLeads());
  })
);

analyticsRouter.get(
  "/by-user",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (_req, res) => {
    res.json(await analyticsService.byUser());
  })
);

/** Any authenticated user's own performance summary — safe for Executives too, since it's self-scoped. */
analyticsRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.myOverview(req.user!.id));
  })
);

/** Full activity/progress profile for one team member — the "member profile" page. */
analyticsRouter.get(
  "/members/:id",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.memberProfile(req.params.id));
  })
);

/**
 * Live "what needs attention right now" feed — polled by the client every ~60s. Org-wide
 * for Founder/Manager (and doubles as the trigger for the stale-lead auto-reassignment
 * sweep); self-scoped for Executives.
 */
analyticsRouter.get(
  "/alerts",
  asyncHandler(async (req, res) => {
    res.json(await analyticsService.getAlerts(req.user!));
  })
);
