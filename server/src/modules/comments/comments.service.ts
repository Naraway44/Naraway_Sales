import { prisma } from "@/common/prisma";

export class CommentsService {
  async list(leadId: string) {
    return prisma.leadComment.findMany({
      where: { leadId },
      include: { user: { select: { id: true, name: true, employeeId: true } } },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(leadId: string, userId: string, body: string) {
    return prisma.leadComment.create({
      data: { leadId, userId, body },
      include: { user: { select: { id: true, name: true, employeeId: true } } },
    });
  }
}

export const commentsService = new CommentsService();
