import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { askAssistant, isAssistantConfigured } from "./assistant.service";

export const assistantRouter = Router();

const askSchema = z.object({
  // Capped hard: this is spoken input from a landing page, not an essay box, and every
  // character forwarded costs tokens against our own API credits.
  question: z.string().trim().min(1).max(400),
  // Prior turns, supplied by the client because an anonymous visitor has no server session.
  // Capped in both length and count for the same reason the question is.
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().max(500),
      })
    )
    .max(10)
    .optional(),
});

/* Unauthenticated by necessity — the assistant answers visitors who don't have accounts
 * yet, which is the entire point of it. That makes spend the real exposure: without a cap,
 * one script could drain the API credits overnight. Twenty questions per IP per five
 * minutes is far more than a genuine visitor asks and far less than an abuser needs. */
const askLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many questions just now. Please try again in a few minutes." },
});

assistantRouter.post(
  "/ask",
  askLimiter,
  asyncHandler(async (req, res) => {
    const parsed = askSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const result = await askAssistant(parsed.data.question, parsed.data.history ?? []);
    // answered:false is a normal outcome (no key configured, upstream down, timeout) and
    // the client has its own answers to fall back on — so this is a 200, not an error.
    res.json(result);
  })
);

assistantRouter.get(
  "/status",
  asyncHandler(async (_req, res) => {
    res.json({ configured: isAssistantConfigured() });
  })
);
