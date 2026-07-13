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
