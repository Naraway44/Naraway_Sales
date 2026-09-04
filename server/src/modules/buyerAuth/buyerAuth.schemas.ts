import { z } from "zod";

export const buyerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type BuyerLoginInput = z.infer<typeof buyerLoginSchema>;

export const buyerSignupSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

export type BuyerSignupInput = z.infer<typeof buyerSignupSchema>;

export const verifyEmailSchema = z.object({
  token: z.string().min(1),
});

export const auth0LoginSchema = z.object({
  idToken: z.string().min(1),
});
