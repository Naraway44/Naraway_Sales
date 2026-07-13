import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { usersService } from "./users.service";
import { createUserSchema, listUsersQuerySchema, updateUserSchema } from "./users.schemas";

export const usersRouter = Router();

usersRouter.use(requireAuth, requirePasswordChanged);

usersRouter.post(
  "/",
  requireRole("FOUNDER"),
  asyncHandler(async (req, res) => {
    const parsed = createUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const result = await usersService.create(parsed.data, req.user!.id);
    res.status(201).json(result);
  })
);

usersRouter.get(
  "/",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = listUsersQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const result = await usersService.list(parsed.data);
    res.json(result);
  })
);

usersRouter.get(
  "/:id",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const result = await usersService.getById(req.params.id);
    res.json(result);
  })
);

usersRouter.patch(
  "/:id",
  requireRole("FOUNDER"),
  asyncHandler(async (req, res) => {
    const parsed = updateUserSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const result = await usersService.update(req.params.id, parsed.data, req.user!.id);
    res.json(result);
  })
);
