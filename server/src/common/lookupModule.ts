import { Router } from "express";
import { z } from "zod";
import { prisma } from "@/common/prisma";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ConflictError, ValidationError } from "@/common/errors/AppError";

const nameSchema = z.object({ name: z.string().min(1) });

/**
 * Factory for simple admin-managed lookup tables (Team, Service, LeadSource) that all
 * share the same shape: { id, name }. Keeps these three modules from duplicating identical
 * CRUD boilerplate while still being three separate Prisma models/routes.
 */
export function createLookupRouter(modelName: "team" | "service" | "leadSource") {
  const router = Router();
  const model = (prisma as any)[modelName];

  router.use(requireAuth, requirePasswordChanged);

  router.get(
    "/",
    asyncHandler(async (_req, res) => {
      const items = await model.findMany({ orderBy: { name: "asc" } });
      res.json(items);
    })
  );

  router.post(
    "/",
    requireRole("FOUNDER"),
    asyncHandler(async (req, res) => {
      const parsed = nameSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.flatten());

      const existing = await model.findUnique({ where: { name: parsed.data.name } });
      if (existing) throw new ConflictError(`"${parsed.data.name}" already exists`);

      const item = await model.create({ data: parsed.data });
      res.status(201).json(item);
    })
  );

  router.patch(
    "/:id",
    requireRole("FOUNDER"),
    asyncHandler(async (req, res) => {
      const parsed = nameSchema.safeParse(req.body);
      if (!parsed.success) throw new ValidationError(parsed.error.flatten());

      const item = await model.update({ where: { id: req.params.id }, data: parsed.data });
      res.json(item);
    })
  );

  router.delete(
    "/:id",
    requireRole("FOUNDER"),
    asyncHandler(async (req, res) => {
      await model.delete({ where: { id: req.params.id } });
      res.status(204).send();
    })
  );

  return router;
}
