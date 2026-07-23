import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { buyersService } from "./buyers.service";
import { createBuyerSchema } from "./buyers.schemas";

export const buyersRouter = Router();

buyersRouter.use(requireAuth, requirePasswordChanged, requireRole("FOUNDER", "MANAGER"));

buyersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await buyersService.list());
  })
);

buyersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createBuyerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await buyersService.create(req.user!, parsed.data));
  })
);
