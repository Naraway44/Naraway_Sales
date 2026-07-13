import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/common/prisma";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ConflictError, ValidationError } from "@/common/errors/AppError";

export const assignmentRulesRouter = Router();

const ruleSchema = z.object({
  serviceId: z.string().cuid(),
  teamId: z.string().cuid(),
});

assignmentRulesRouter.use(requireAuth, requirePasswordChanged);

assignmentRulesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const rules = await prisma.assignmentRule.findMany({
      include: { service: true, team: true },
    });
    res.json(rules);
  })
);

assignmentRulesRouter.post(
  "/",
  requireRole("FOUNDER"),
  asyncHandler(async (req, res) => {
    const parsed = ruleSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const existing = await prisma.assignmentRule.findUnique({
      where: { serviceId: parsed.data.serviceId },
    });
    if (existing) throw new ConflictError("A rule for this service already exists");

    const rule = await prisma.assignmentRule.create({ data: parsed.data });
    res.status(201).json(rule);
  })
);

assignmentRulesRouter.patch(
  "/:id",
  requireRole("FOUNDER"),
  asyncHandler(async (req, res) => {
    const parsed = ruleSchema.partial().safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const rule = await prisma.assignmentRule.update({
      where: { id: req.params.id },
      data: parsed.data,
    });
    res.json(rule);
  })
);

assignmentRulesRouter.delete(
  "/:id",
  requireRole("FOUNDER"),
  asyncHandler(async (req, res) => {
    await prisma.assignmentRule.delete({ where: { id: req.params.id } });
    res.status(204).send();
  })
);
