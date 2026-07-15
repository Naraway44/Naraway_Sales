import { z } from "zod";

export const resourceCategoryEnum = z.enum([
  "CALL_SCRIPT",
  "OBJECTION_HANDLING",
  "EMAIL",
  "WHATSAPP",
  "SMS",
  "FAQ",
  "PRICING",
  "PAYMENT_INFO",
  "COMPANY_OVERVIEW",
]);

export const createResourceSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: resourceCategoryEnum,
  serviceId: z.string().cuid().optional().nullable(),
  fileUrl: z.string().url().optional().nullable(),
});

export const updateResourceSchema = createResourceSchema.partial();

export const listResourcesQuerySchema = z.object({
  category: resourceCategoryEnum.optional(),
  serviceId: z.string().cuid().optional(),
  search: z.string().optional(),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
