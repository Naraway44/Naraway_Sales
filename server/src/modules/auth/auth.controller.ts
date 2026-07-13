import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { authService } from "./auth.service";
import { changePasswordSchema, loginSchema } from "./auth.schemas";

export const authRouter = Router();

authRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const result = await authService.login(parsed.data);
    res.json(result);
  })
);

authRouter.post(
  "/change-password",
  requireAuth,
  asyncHandler(async (req, res) => {
    const parsed = changePasswordSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const result = await authService.changePassword(req.user!.id, parsed.data);
    res.json(result);
  })
);

authRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    const me = await authService.me(req.user!.id);
    res.json(me);
  })
);
