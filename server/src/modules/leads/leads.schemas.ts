import { z } from "zod";

export const leadStatusEnum = z.enum([
  "NEW",
  "CONTACTED",
  "QUALIFIED",
  "MEETING_SCHEDULED",
  "PROPOSAL_SENT",
  "NEGOTIATION",
  "WON",
  "LOST",
  "ON_HOLD",
]);

export const priorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"]);

export const createLeadSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email().optional().nullable(),
  website: z.string().optional().nullable(),
  industry: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  serviceId: z.string().cuid().optional().nullable(),
  sourceId: z.string().cuid().optional().nullable(),
  ownerId: z.string().cuid().optional().nullable(),
  priority: priorityEnum.optional(),
  status: leadStatusEnum.optional(),
  expectedDealValue: z.coerce.number().optional().nullable(),
  probability: z.coerce.number().int().min(0).max(100).optional().nullable(),
  expectedClosingDate: z.coerce.date().optional().nullable(),
  lostReason: z.string().optional().nullable(),
  lastContactAt: z.coerce.date().optional().nullable(),
  nextFollowUp: z.coerce.date().optional().nullable(),
});

export const updateLeadSchema = createLeadSchema.partial();

export const listLeadsQuerySchema = z.object({
  search: z.string().optional(),
  status: leadStatusEnum.optional(),
  priority: priorityEnum.optional(),
  ownerId: z.string().cuid().optional(),
  serviceId: z.string().cuid().optional(),
  sourceId: z.string().cuid().optional(),
  state: z.string().optional(),
  unassigned: z.coerce.boolean().optional(),
  createdFrom: z.coerce.date().optional(),
  createdTo: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sortBy: z
    .enum(["createdAt", "companyName", "status", "priority", "nextFollowUp", "expectedDealValue"])
    .default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
});

export const bulkAssignSchema = z.object({
  leadIds: z.array(z.string().cuid()).min(1),
  ownerId: z.string().cuid(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;
export type ListLeadsQuery = z.infer<typeof listLeadsQuerySchema>;
export type BulkAssignInput = z.infer<typeof bulkAssignSchema>;
