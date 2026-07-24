import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { buyersService } from "./buyers.service";
import { createBuyerSchema } from "./buyers.schemas";
import { accessRequestsService } from "./accessRequests.service";

export const buyersRouter = Router();

buyersRouter.use(requireAuth, requirePasswordChanged, requireRole("FOUNDER", "MANAGER"));

buyersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await buyersService.list());
  })
);

buyersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createBuyerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await buyersService.create(req.user!, parsed.data));
  })
);

buyersRouter.get(
  "/access-requests",
  asyncHandler(async (req, res) => {
    res.json(await accessRequestsService.list());
  })
);

buyersRouter.post(
  "/access-requests/:id/resolve",
  asyncHandler(async (req, res) => {
    const { status } = req.body as { status: "APPROVED" | "DECLINED" };
    if (status !== "APPROVED" && status !== "DECLINED") {
      throw new ValidationError("status must be APPROVED or DECLINED");
    }
    res.json(await accessRequestsService.resolve(req.user!, req.params.id, status));
  })
);
