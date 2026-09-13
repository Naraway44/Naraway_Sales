import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { bdApplicantsService } from "./bdApplicants.service";
import { createBdApplicantSchema } from "./bdApplicants.schemas";

export const bdApplicantsRouter = Router();

// Public — submitted from the /careers page by people who don't have an account and never
// will (this is gig work, not a Buyer or staff User). Founder/Manager reviews and follows
// up manually; staff routes for that live on buyersRouter (/buyers/bd-applicants).
bdApplicantsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createBdApplicantSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await bdApplicantsService.create(parsed.data));
  })
);
