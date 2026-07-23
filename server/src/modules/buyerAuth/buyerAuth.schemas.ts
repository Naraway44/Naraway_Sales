import { z } from "zod";

export const buyerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type BuyerLoginInput = z.infer<typeof buyerLoginSchema>;
