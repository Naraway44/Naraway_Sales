import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { analyticsService } from "./analytics.service";

export const analyticsRouter = Router();

analyticsRouter.use(requireAuth, requirePasswordChanged, requireRole("FOUNDER", "MANAGER"));

analyticsRouter.get(
  "/overview",
  asyncHandler(async (_req, res) => {
    res.json(await analyticsService.overview());
  })
);

analyticsRouter.get(
  "/by-user",
  asyncHandler(async (_req, res) => {
    res.json(await analyticsService.byUser());
  })
);
