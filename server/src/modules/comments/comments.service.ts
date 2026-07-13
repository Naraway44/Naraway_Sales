import { randomUUID } from "crypto";
import { prisma } from "@/common/prisma";
import { NotFoundError } from "@/common/errors/AppError";

export interface LeadCommentEntry {
  id: string;
  userId: string;
  userName: string;
  employeeId: string;
  body: string;
  createdAt: string;
}

export class CommentsService {
  async list(leadId: string): Promise<LeadCommentEntry[]> {
    const lead = await prisma.lead.findUnique({ where: { id: leadId }, select: { comments: true } });
    if (!lead) throw new NotFoundError("Lead");
    return lead.comments as unknown as LeadCommentEntry[];
  }

  /**
   * Appends atomically via a raw jsonb `||` concat in a single UPDATE statement — not a
   * fetch-then-write in JS, which would lose a concurrent comment posted to the same lead
   * in the gap between the read and the write.
   */
  async create(leadId: string, userId: string, body: string): Promise<LeadCommentEntry> {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { name: true, employeeId: true },
    });

    const entry: LeadCommentEntry = {
      id: randomUUID(),
      userId,
      userName: user.name,
      employeeId: user.employeeId,
      body,
      createdAt: new Date().toISOString(),
    };

    const updated = await prisma.$queryRaw<{ comments: LeadCommentEntry[] }[]>`
      update leads
      set comments = comments || ${JSON.stringify([entry])}::jsonb
      where id = ${leadId}
      returning comments
    `;
    if (updated.length === 0) throw new NotFoundError("Lead");

    return entry;
  }
}

export const commentsService = new CommentsService();
