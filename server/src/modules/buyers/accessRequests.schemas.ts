import { z } from "zod";

export const createAccessRequestSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  message: z.string().optional().nullable(),
});

export type CreateAccessRequestInput = z.infer<typeof createAccessRequestSchema>;
