import { z } from "zod";

export const createBdApplicantSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  city: z.string().optional().nullable(),
  pitch: z.string().optional().nullable(),
  hoursPerWeek: z.string().optional().nullable(),
});

export type CreateBdApplicantInput = z.infer<typeof createBdApplicantSchema>;
