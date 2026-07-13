import { z } from "zod";

export const resourceCategoryEnum = z.enum(["MESSAGE", "EMAIL", "CALL_SCRIPT"]);

export const createResourceSchema = z.object({
  title: z.string().min(1),
  body: z.string().min(1),
  category: resourceCategoryEnum,
  serviceId: z.string().cuid().optional().nullable(),
});

export const updateResourceSchema = createResourceSchema.partial();

export const listResourcesQuerySchema = z.object({
  category: resourceCategoryEnum.optional(),
  serviceId: z.string().cuid().optional(),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ListResourcesQuery = z.infer<typeof listResourcesQuerySchema>;
