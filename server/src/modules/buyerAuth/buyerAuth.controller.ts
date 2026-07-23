import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { requireBuyerAuth } from "@/common/middleware/buyerAuth";
import { buyerAuthService } from "./buyerAuth.service";
import { buyerLoginSchema } from "./buyerAuth.schemas";

export const buyerAuthRouter = Router();

buyerAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = buyerLoginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await buyerAuthService.login(parsed.data));
  })
);

buyerAuthRouter.get(
  "/me",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    res.json(await buyerAuthService.me(req.buyer!.buyerId));
  })
);
