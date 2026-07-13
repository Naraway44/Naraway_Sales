import { Router } from "express";
import multer from "multer";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { leadsService } from "./leads.service";
import {
  bulkAssignSchema,
  createLeadSchema,
  listLeadsQuerySchema,
  updateLeadSchema,
} from "./leads.schemas";
import { assignmentService } from "@/modules/assignment/assignment.service";
import { listActivities } from "@/modules/activities/activities.service";
import { commentsService } from "@/modules/comments/comments.service";
import { confirmImport, leadsToCsv, parseSpreadsheet, previewImport } from "./leadsImport.service";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const leadsRouter = Router();

leadsRouter.use(requireAuth, requirePasswordChanged);

leadsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = listLeadsQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await leadsService.list(req.user!, parsed.data));
  })
);

leadsRouter.get(
  "/export",
  asyncHandler(async (req, res) => {
    const parsed = listLeadsQuerySchema
      .extend({ pageSize: listLeadsQuerySchema.shape.pageSize.default(10000) })
      .safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());

    const { items } = await leadsService.list(req.user!, parsed.data);
    const csv = leadsToCsv(
      items.map((l) => ({
        id: l.id,
        companyName: l.companyName,
        contactPerson: l.contactPerson,
        phone: l.phone,
        email: l.email,
        status: l.status,
        priority: l.priority,
        owner: l.owner?.name ?? "",
        service: l.service?.name ?? "",
        source: l.source?.name ?? "",
        city: l.city,
        state: l.state,
        country: l.country,
        expectedDealValue: l.expectedDealValue,
        createdAt: l.createdAt,
      }))
    );
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leads-export.csv");
    res.send(csv);
  })
);

leadsRouter.post(
  "/import/parse",
  requireRole("FOUNDER", "MANAGER"),
  upload.single("file"),
  asyncHandler(async (req, res) => {
    if (!req.file) throw new ValidationError("A CSV or Excel (.xlsx) file is required");
    const sheets = await parseSpreadsheet(req.file.buffer, req.file.originalname);
    res.json(sheets);
  })
);

leadsRouter.post(
  "/import/preview",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { rows, columnMapping } = req.body as {
      rows: Record<string, string>[];
      columnMapping: Record<string, string>;
    };
    res.json(await previewImport(rows, columnMapping));
  })
);

leadsRouter.post(
  "/import/confirm",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { rows } = req.body as { rows: Record<string, string>[] };
    res.json(await confirmImport(rows, req.user!.id));
  })
);

leadsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    res.json(await leadsService.getById(req.user!, req.params.id));
  })
);

leadsRouter.post(
  "/",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = createLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await leadsService.create(req.user!, parsed.data));
  })
);

leadsRouter.patch(
  "/:id",
  asyncHandler(async (req, res) => {
    const parsed = updateLeadSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await leadsService.update(req.user!, req.params.id, parsed.data));
  })
);

leadsRouter.delete(
  "/:id",
  requireRole("FOUNDER"),
  asyncHandler(async (req, res) => {
    await leadsService.delete(req.params.id);
    res.status(204).send();
  })
);

leadsRouter.post(
  "/:id/assign",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { ownerId } = req.body as { ownerId: string };
    if (!ownerId) throw new ValidationError("ownerId is required");
    res.json(await assignmentService.assignManual(req.params.id, ownerId, req.user!.id));
  })
);

leadsRouter.post(
  "/bulk-assign",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = bulkAssignSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(
      await assignmentService.assignBulk(parsed.data.leadIds, parsed.data.ownerId, req.user!.id)
    );
  })
);

leadsRouter.get(
  "/:id/activities",
  asyncHandler(async (req, res) => {
    await leadsService.getById(req.user!, req.params.id); // enforces RBAC scope
    res.json(await listActivities(req.params.id));
  })
);

leadsRouter.get(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    await leadsService.getById(req.user!, req.params.id);
    res.json(await commentsService.list(req.params.id));
  })
);

leadsRouter.post(
  "/:id/comments",
  asyncHandler(async (req, res) => {
    await leadsService.getById(req.user!, req.params.id);
    const { body } = req.body as { body: string };
    if (!body?.trim()) throw new ValidationError("Comment body is required");
    res.status(201).json(await commentsService.create(req.params.id, req.user!.id, body.trim()));
  })
);
