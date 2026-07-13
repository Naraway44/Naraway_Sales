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

    const result = await authService.changePassword(req.user!.id, req.user!.sessionId, parsed.data);
    res.json(result);
  })
);

authRouter.post(
  "/logout",
  requireAuth,
  asyncHandler(async (req, res) => {
    await authService.logout(req.user!.sessionId);
    res.status(204).send();
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
