import { z } from "zod";

export const attendanceQuerySchema = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/, "month must be in YYYY-MM format")
    .optional(),
});

export type AttendanceQuery = z.infer<typeof attendanceQuerySchema>;
