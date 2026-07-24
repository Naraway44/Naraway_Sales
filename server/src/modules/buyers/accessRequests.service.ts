import { prisma } from "@/common/prisma";
import { NotFoundError, ValidationError } from "@/common/errors/AppError";
import { AuthUser } from "@/common/middleware/auth";
import { CreateAccessRequestInput } from "./accessRequests.schemas";

export class AccessRequestsService {
  async create(input: CreateAccessRequestInput) {
    return prisma.buyerAccessRequest.create({
      data: {
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        message: input.message,
      },
    });
  }

  async list() {
    return prisma.buyerAccessRequest.findMany({ orderBy: { createdAt: "desc" } });
  }

  async resolve(staff: AuthUser, id: string, status: "APPROVED" | "DECLINED") {
    const request = await prisma.buyerAccessRequest.findUnique({ where: { id } });
    if (!request) throw new NotFoundError("Access request");
    if (request.status !== "PENDING") {
      throw new ValidationError("This request has already been resolved");
    }

    return prisma.buyerAccessRequest.update({
      where: { id },
      data: { status, resolvedAt: new Date(), resolvedById: staff.id },
    });
  }
}

export const accessRequestsService = new AccessRequestsService();
