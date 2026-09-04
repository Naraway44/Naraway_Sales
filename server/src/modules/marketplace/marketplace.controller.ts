import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { requireBuyerAuth } from "@/common/middleware/buyerAuth";
import { accessRequestsService } from "@/modules/buyers/accessRequests.service";
import { createAccessRequestSchema } from "@/modules/buyers/accessRequests.schemas";
import { marketplaceService } from "./marketplace.service";
import { checkoutSchema, marketplaceSearchQuerySchema } from "./marketplace.schemas";

export const marketplaceRouter = Router();

// Public — submitted from the landing page by people who don't have an account yet.
// This does NOT create a Buyer; Founder/Manager still reviews and creates accounts
// manually from the Sales OS (see buyersRouter's /access-requests endpoints).
marketplaceRouter.post(
  "/access-requests",
  asyncHandler(async (req, res) => {
    const parsed = createAccessRequestSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await accessRequestsService.create(parsed.data));
  })
);

// Public, unauthenticated — real numbers, self-updating, for the marketing site's live
// stats section. No buyer/staff data exposed (just aggregate counts).
marketplaceRouter.get(
  "/stats",
  asyncHandler(async (_req, res) => {
    res.json(await marketplaceService.stats());
  })
);

marketplaceRouter.get(
  "/leads/search",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    const parsed = marketplaceSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await marketplaceService.search(parsed.data));
  })
);

marketplaceRouter.post(
  "/checkout",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await marketplaceService.createCheckout(req.buyer!.buyerId, parsed.data));
  })
);

marketplaceRouter.get(
  "/my-leads",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    res.json(await marketplaceService.myPurchases(req.buyer!.buyerId));
  })
);

marketplaceRouter.get(
  "/my-leads/export",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    const csv = await marketplaceService.exportCsv(req.buyer!.buyerId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=my-leads.csv");
    res.send(csv);
  })
);

// Razorpay calls this directly — authenticated via HMAC signature verification inside
// handleWebhook, not requireBuyerAuth (there's no buyer JWT on a server-to-server call).
marketplaceRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
    const result = await marketplaceService.handleWebhook(rawBody, signature);
    res.json(result);
  })
);
