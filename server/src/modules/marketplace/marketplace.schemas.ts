import { z } from "zod";
import { CompanySize } from "@prisma/client";

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
  companySize: z.nativeEnum(CompanySize).optional(),
  dealValueMin: z.coerce.number().optional(),
  dealValueMax: z.coerce.number().optional(),
  dateListedFrom: z.coerce.date().optional(),
  dateListedTo: z.coerce.date().optional(),
});

export const marketplaceSearchQuerySchema = marketplaceFilterSchema.extend({
  quantity: z.coerce.number().int().min(1).default(1),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  sortBy: z.enum(["listedAt", "companyName", "expectedDealValue"]).default("listedAt"),
  sortDir: z.enum(["asc", "desc"]).default("asc"),
});

export const checkoutSchema = marketplaceFilterSchema.extend({
  quantity: z.number().int().min(1),
});

// Externally sourced leads (scraper, enrichment run, purchased list) coming in for bulk
// listing. Every field except companyName is optional because no source populates all of
// them — but a row still has to carry a phone or an email to be sellable, which the ingest
// service enforces rather than the schema, so the caller gets a per-row reason back.
export const ingestLeadSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  industry: z.string().optional(),
  companySize: z.nativeEnum(CompanySize).optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  service: z.string().optional(),
  notes: z.string().optional(),
  // The buying signal and when it fired — what makes this a qualified lead rather than a
  // contact row, and the only field on here a buyer sees before paying.
  intentSignal: z.string().optional(),
  signalAt: z.coerce.date().optional(),
  expectedDealValue: z.coerce.number().optional(),
  overridePrice: z.coerce.number().optional(),
  /** The source's own id for this company, so a re-scrape is traceable to the same record. */
  externalId: z.string().optional(),
});

export const ingestBatchSchema = z.object({
  /** Which scraper/run produced these — stored on every row for tracing a bad batch. */
  source: z.string().min(1).max(64),
  leads: z.array(ingestLeadSchema).min(1).max(1000),
});

export type IngestLead = z.infer<typeof ingestLeadSchema>;
export type IngestBatch = z.infer<typeof ingestBatchSchema>;

export type MarketplaceFilter = z.infer<typeof marketplaceFilterSchema>;
export type MarketplaceSearchQuery = z.infer<typeof marketplaceSearchQuerySchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
