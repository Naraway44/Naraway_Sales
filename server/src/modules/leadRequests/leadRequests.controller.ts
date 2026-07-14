import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { leadRequestsService } from "./leadRequests.service";
import { createLeadRequestSchema, resolveLeadRequestSchema } from "./leadRequests.schemas";

export const leadRequestsRouter = Router();

leadRequestsRouter.use(requireAuth, requirePasswordChanged);

/** Any rep can ask for more leads for themselves — eligibility is enforced server-side. */
leadRequestsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createLeadRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await leadRequestsService.create(req.user!.id, parsed.data.note));
  })
);

leadRequestsRouter.get(
  "/",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (_req, res) => {
    res.json(await leadRequestsService.listPending());
  })
);

leadRequestsRouter.post(
  "/:id/resolve",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = resolveLeadRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await leadRequestsService.resolve(req.params.id, parsed.data.approve, req.user!.id));
  })
);
