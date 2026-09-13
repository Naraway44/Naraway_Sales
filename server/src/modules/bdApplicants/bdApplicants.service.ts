import { prisma } from "@/common/prisma";
import { NotFoundError, ValidationError } from "@/common/errors/AppError";
import { AuthUser } from "@/common/middleware/auth";
import { CreateBdApplicantInput } from "./bdApplicants.schemas";

export class BdApplicantsService {
  async create(input: CreateBdApplicantInput) {
    return prisma.bdApplicant.create({
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        city: input.city,
        pitch: input.pitch,
        hoursPerWeek: input.hoursPerWeek,
      },
    });
  }

  async list() {
    return prisma.bdApplicant.findMany({ orderBy: { createdAt: "desc" } });
  }

  async resolve(staff: AuthUser, id: string, status: "APPROVED" | "DECLINED") {
    const applicant = await prisma.bdApplicant.findUnique({ where: { id } });
    if (!applicant) throw new NotFoundError("Applicant");
    if (applicant.status !== "PENDING") {
      throw new ValidationError("This applicant has already been resolved");
    }

    return prisma.bdApplicant.update({
      where: { id },
      data: { status, resolvedAt: new Date(), resolvedById: staff.id },
    });
  }
}

export const bdApplicantsService = new BdApplicantsService();
