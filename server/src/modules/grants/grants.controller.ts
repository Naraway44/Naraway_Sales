import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import {
  buildWorkbookBuffer,
  crawlCycle,
  deactivateExpiredPackages,
  deleteStartup,
  ensureFilters,
  isPackageExpired,
  readMatches,
  readNotifications,
  readStartups,
  readStore,
  recomputeMatches,
  runNotifications,
  saveMatches,
  saveStartups,
} from "./grants.engine";
import { backfillNotifiedWithoutSending } from "./grants.repo";
import type { ClientPlan, StartupClient } from "./grants.types";

export const grantsRouter = Router();

// Grants desk is staff-only. Without this, /sync would be a public crawl trigger
// and /notify a public send button.
grantsRouter.use(requireAuth, requirePasswordChanged, requireRole("FOUNDER", "MANAGER"));

grantsRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const [store, startups, matches, notifications] = await Promise.all([
      readStore(),
      deactivateExpiredPackages(),
      readMatches(),
      readNotifications(),
    ]);
    const active = store.active.map(ensureFilters);
    res.json({
      meta: {
        active: active.length,
        allYear: active.filter((x) => x.windowType === "ALL_YEAR").length,
        openClose: active.filter((x) => x.windowType !== "ALL_YEAR").length,
        cycle: store.cycle,
        syncedAt: store.syncedAt,
        lastErrors: store.lastErrors,
      },
      schemes: active,
      startups,
      matches,
      notifications,
    });
  })
);

grantsRouter.get(
  "/schemes",
  asyncHandler(async (req, res) => {
    const store = await readStore();
    let rows = store.active.map(ensureFilters);
    const { industry, state, instrument, window: win, recurrence } = req.query as Record<string, string>;
    if (industry) rows = rows.filter((r) => r.industries.toLowerCase().includes(industry.toLowerCase()));
    if (state) rows = rows.filter((r) => r.state.toLowerCase().includes(state.toLowerCase()) || r.level === "Central");
    if (instrument) rows = rows.filter((r) => r.instrument.toLowerCase() === instrument.toLowerCase());
    if (win) rows = rows.filter((r) => r.windowType === win);
    if (recurrence) rows = rows.filter((r) => r.recurrence === recurrence);
    res.json({ count: rows.length, schemes: rows });
  })
);

grantsRouter.get(
  "/startups",
  asyncHandler(async (_req, res) => res.json(await readStartups()))
);

grantsRouter.get(
  "/startups/:id",
  asyncHandler(async (req, res) => {
    const list = await readStartups();
    const startup = list.find((x) => x.id === req.params.id);
    if (!startup) return res.status(404).json({ error: "startup not found" });
    const matches = (await readMatches()).filter((m) => m.startupId === startup.id);
    const notifications = (await readNotifications()).filter((n) => n.startupId === startup.id);
    res.json({
      startup,
      matches,
      notifications,
      filingQueue: matches.filter((m) => m.filingStatus === "queued" || m.filingStatus === "in_progress"),
      filed: matches.filter((m) => m.filingStatus === "filed"),
    });
  })
);

grantsRouter.post(
  "/startups",
  asyncHandler(async (req, res) => {
    const body = req.body as Partial<StartupClient> & { name?: string; id?: string };
    if (!body?.name?.trim()) throw new ValidationError({ name: ["name required"] });

    const list = await readStartups();
    const id =
      (body.id || "").trim() ||
      `su-${body.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 40)}`;
    const prev = list.find((s) => s.id === id);

    const draft: StartupClient = {
      id,
      name: body.name.trim(),
      industries: body.industries || prev?.industries || [],
      states: body.states || prev?.states || [],
      stage: body.stage || prev?.stage || "Any",
      incorporationDate: body.incorporationDate ?? prev?.incorporationDate ?? "",
      dpiitRecognised: body.dpiitRecognised ?? prev?.dpiitRecognised ?? false,
      audienceTags: body.audienceTags || prev?.audienceTags || [],
      notifyEmails: body.notifyEmails || prev?.notifyEmails || [],
      plan: (body.plan as ClientPlan) || prev?.plan || "NOTIFICATION",
      packageStartDate: body.packageStartDate || prev?.packageStartDate || "",
      packageEndDate: body.packageEndDate || prev?.packageEndDate || "",
      active: body.active !== false,
      notes: body.notes ?? prev?.notes ?? "",
    };

    // Past package end → force inactive so no further notifications go out.
    const row: StartupClient = isPackageExpired(draft)
      ? {
          ...draft,
          active: false,
          notes: draft.notes?.includes("[auto-inactive: package ended]")
            ? draft.notes
            : `${draft.notes || ""} [auto-inactive: package ended]`.trim(),
        }
      : draft;

    await saveStartups([row]);
    const store = await readStore();
    const matches = await recomputeMatches(store.active);
    res.json({ ok: true, startup: row, matches: matches.length });
  })
);

grantsRouter.delete(
  "/startups/:id",
  asyncHandler(async (req, res) => {
    await deleteStartup(req.params.id);
    res.json({ ok: true });
  })
);

grantsRouter.get(
  "/matches",
  asyncHandler(async (_req, res) => res.json(await readMatches()))
);

grantsRouter.get(
  "/filing-queue",
  asyncHandler(async (_req, res) => {
    const matches = await readMatches();
    res.json(matches.filter((m) => m.filingStatus === "queued" || m.filingStatus === "in_progress"));
  })
);

grantsRouter.post(
  "/matches/:id/filing",
  asyncHandler(async (req, res) => {
    const status = String((req.body as { status?: string })?.status || "");
    const allowed = ["none", "queued", "in_progress", "filed", "skipped"];
    if (!allowed.includes(status)) throw new ValidationError({ status: [`must be one of ${allowed.join(", ")}`] });

    const matches = await readMatches();
    const idx = matches.findIndex((m) => m.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "match not found" });
    matches[idx] = { ...matches[idx], filingStatus: status as (typeof matches)[number]["filingStatus"] };
    await saveMatches(matches);
    res.json({ ok: true, match: matches[idx] });
  })
);

grantsRouter.get(
  "/notifications",
  asyncHandler(async (_req, res) => res.json(await readNotifications()))
);

grantsRouter.post(
  "/match",
  asyncHandler(async (_req, res) => {
    const store = await readStore();
    const matches = await recomputeMatches(store.active);
    res.json({ ok: true, matches: matches.length });
  })
);

grantsRouter.post(
  "/notify",
  asyncHandler(async (_req, res) => {
    const result = await runNotifications(await readMatches());
    res.json({ ok: true, ...result });
  })
);

/**
 * One-time safety valve: marks all pending matches as already-notified WITHOUT sending.
 * Run this before turning GRANTS_NOTIFY_ENABLED on, so enabling delivery does not
 * blast the historical backlog at real client inboxes.
 */
grantsRouter.post(
  "/suppress-backlog",
  requireRole("FOUNDER"),
  asyncHandler(async (_req, res) => {
    const suppressed = await backfillNotifiedWithoutSending();
    res.json({ ok: true, suppressed });
  })
);

grantsRouter.post(
  "/sync",
  asyncHandler(async (_req, res) => {
    const store = await crawlCycle(await readStore());
    res.json({ ok: true, active: store.active.length, removed: store.removed.length, cycle: store.cycle });
  })
);

grantsRouter.get(
  "/export.xlsx",
  asyncHandler(async (_req, res) => {
    const [store, startups, matches, notifications] = await Promise.all([
      readStore(),
      readStartups(),
      readMatches(),
      readNotifications(),
    ]);
    // Built on demand — nothing is written to disk (Render's filesystem is ephemeral).
    const buffer = await buildWorkbookBuffer(store.active, store.removed, startups, matches, notifications);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", 'attachment; filename="active-gov-schemes.xlsx"');
    res.send(Buffer.from(buffer));
  })
);
