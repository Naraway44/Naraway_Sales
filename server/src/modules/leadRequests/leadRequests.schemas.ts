import { z } from "zod";

export const createLeadRequestSchema = z.object({
  note: z.string().optional().nullable(),
});

export const resolveLeadRequestSchema = z.object({
  approve: z.boolean(),
});

export type CreateLeadRequestInput = z.infer<typeof createLeadRequestSchema>;
export type ResolveLeadRequestInput = z.infer<typeof resolveLeadRequestSchema>;
