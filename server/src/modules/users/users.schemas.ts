import { z } from "zod";

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8, "Password must be at least 8 characters"),
  role: z.enum(["FOUNDER", "MANAGER", "EXECUTIVE"]),
  teamId: z.string().cuid().optional().nullable(),
  requirePasswordChange: z.boolean().optional().default(true),
  leadCapacity: z.coerce.number().int().min(1).max(500).optional(),
});

const timeStringSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "must be HH:MM 24-hour");
const workDaysSchema = z.array(z.number().int().min(0).max(6)).min(0).max(7);

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  role: z.enum(["FOUNDER", "MANAGER", "EXECUTIVE"]).optional(),
  teamId: z.string().cuid().optional().nullable(),
  isActive: z.boolean().optional(),
  password: z.string().min(8, "Password must be at least 8 characters").optional(),
  requirePasswordChange: z.boolean().optional(),
  leadCapacity: z.coerce.number().int().min(1).max(500).optional(),
  workStartTime: timeStringSchema.optional(),
  workEndTime: timeStringSchema.optional(),
  workDays: workDaysSchema.optional(),
});

export const bulkScheduleSchema = z.object({
  workStartTime: timeStringSchema,
  workEndTime: timeStringSchema,
  workDays: workDaysSchema,
});

export type BulkScheduleInput = z.infer<typeof bulkScheduleSchema>;

export const listUsersQuerySchema = z.object({
  teamId: z.string().cuid().optional(),
  role: z.enum(["FOUNDER", "MANAGER", "EXECUTIVE"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
