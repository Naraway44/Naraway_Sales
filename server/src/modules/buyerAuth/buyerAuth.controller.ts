import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { requireBuyerAuth } from "@/common/middleware/buyerAuth";
import { buyerAuthService } from "./buyerAuth.service";
import { auth0LoginSchema, buyerLoginSchema, buyerSignupSchema, verifyEmailSchema } from "./buyerAuth.schemas";

export const buyerAuthRouter = Router();

// Public self-signup — creates the account and logs the buyer in immediately (they can
// browse right away); checkout is gated separately until email verification completes.
buyerAuthRouter.post(
  "/signup",
  asyncHandler(async (req, res) => {
    const parsed = buyerSignupSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await buyerAuthService.signup(parsed.data));
  })
);

buyerAuthRouter.post(
  "/verify-email",
  asyncHandler(async (req, res) => {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await buyerAuthService.verifyEmail(parsed.data.token));
  })
);

buyerAuthRouter.post(
  "/resend-verification",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    res.json(await buyerAuthService.resendVerification(req.buyer!.buyerId));
  })
);

buyerAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = buyerLoginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await buyerAuthService.login(parsed.data));
  })
);

// "Log in with Google" (and any other Auth0 connection) — alongside, not instead of, the
// email/password login above.
buyerAuthRouter.post(
  "/auth0-login",
  asyncHandler(async (req, res) => {
    const parsed = auth0LoginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await buyerAuthService.loginWithAuth0(parsed.data.idToken));
  })
);

buyerAuthRouter.get(
  "/me",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    res.json(await buyerAuthService.me(req.buyer!.buyerId));
  })
);
