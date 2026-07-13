import { ActivityAction } from "@prisma/client";
import { prisma } from "@/common/prisma";

/**
 * Single funnel for all lead activity logging. Every lead mutation (create, assign,
 * status change, import, etc.) should call this instead of writing LeadActivity rows
 * directly, so future consumers (notifications, AI summaries) can hook in here once.
 */
export async function logActivity(params: {
  leadId: string;
  userId?: string | null;
  action: ActivityAction;
  notes?: string;
}) {
  return prisma.leadActivity.create({
    data: {
      leadId: params.leadId,
      userId: params.userId ?? null,
      action: params.action,
      notes: params.notes,
    },
  });
}

export async function listActivities(leadId: string) {
  return prisma.leadActivity.findMany({
    where: { leadId },
    include: { user: { select: { id: true, name: true, employeeId: true } } },
    orderBy: { timestamp: "desc" },
  });
}
