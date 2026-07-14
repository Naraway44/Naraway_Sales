import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { NotFoundError, ValidationError } from "@/common/errors/AppError";
import { prisma } from "@/common/prisma";
import { attendanceQuerySchema } from "./attendance.schemas";
import { getAttendanceCalendar } from "./attendance.service";

export const attendanceRouter = Router();

attendanceRouter.use(requireAuth, requirePasswordChanged);

/** Parses "YYYY-MM" (defaulting to the current month) into a [start, end) range. */
function monthRange(month?: string): [Date, Date] {
  const now = new Date();
  const [year, monthNum] = month ? month.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  return [new Date(year, monthNum - 1, 1), new Date(year, monthNum, 1)];
}

async function loadCalendar(userId: string, month?: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, workStartTime: true, workEndTime: true, workDays: true },
  });
  if (!user) throw new NotFoundError("User");

  const [monthStart, monthEnd] = monthRange(month);
  return getAttendanceCalendar(user, monthStart, monthEnd);
}

attendanceRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const parsed = attendanceQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await loadCalendar(req.user!.id, parsed.data.month));
  })
);

attendanceRouter.get(
  "/:userId",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const parsed = attendanceQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await loadCalendar(req.params.userId, parsed.data.month));
  })
);
