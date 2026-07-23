import { z } from "zod";

export const createBuyerSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
});

export type CreateBuyerInput = z.infer<typeof createBuyerSchema>;
