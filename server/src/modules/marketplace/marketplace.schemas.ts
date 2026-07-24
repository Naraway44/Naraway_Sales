import { z } from "zod";

// Note: price is deliberately not a filter dimension here — it's computed live per
// checkout from the total quantity purchased (see marketplace.pricing), not a fixed
// per-lead attribute buyers can range-filter on.
export const marketplaceFilterSchema = z.object({
  service: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  lostReason: z.string().optional(),
  keyword: z.string().optional(),
  dealValueMin: z.coerce.number().optional(),
  dealValueMax: z.coerce.number().optional(),
  dateListedFrom: z.coerce.date().optional(),
  dateListedTo: z.coerce.date().optional(),
});

export const marketplaceSearchQuerySchema = marketplaceFilterSchema.extend({
  quantity: z.coerce.number().int().min(1).default(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export const checkoutSchema = marketplaceFilterSchema.extend({
  quantity: z.number().int().min(1),
});

export type MarketplaceFilter = z.infer<typeof marketplaceFilterSchema>;
export type MarketplaceSearchQuery = z.infer<typeof marketplaceSearchQuerySchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
