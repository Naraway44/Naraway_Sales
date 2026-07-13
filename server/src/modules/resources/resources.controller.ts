import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { resourcesService } from "./resources.service";
import { createResourceSchema, listResourcesQuerySchema, updateResourceSchema } from "./resources.schemas";

export const resourcesRouter = Router();

resourcesRouter.use(requireAuth, requirePasswordChanged);

resourcesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listResourcesQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await resourcesService.list(parsed.data));
  })
);

resourcesRouter.post(
  "/",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = createResourceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await resourcesService.create(parsed.data, req.user!.id));
  })
);

resourcesRouter.patch(
  "/:id",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = updateResourceSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await resourcesService.update(req.params.id, parsed.data));
  })
);

resourcesRouter.delete(
  "/:id",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    await resourcesService.delete(req.params.id);
    res.status(204).send();
  })
);
