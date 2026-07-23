import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { prisma } from "@/common/prisma";
import { ConflictError } from "@/common/errors/AppError";
import { AuthUser } from "@/common/middleware/auth";
import { CreateBuyerInput } from "./buyers.schemas";

function generateTempPassword(): string {
  return randomBytes(9).toString("base64url");
}

export class BuyersService {
  async create(staff: AuthUser, input: CreateBuyerInput) {
    const existing = await prisma.buyer.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("A buyer with this email already exists");

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const buyer = await prisma.buyer.create({
      data: {
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        passwordHash,
        createdById: staff.id,
      },
    });

    const { passwordHash: _passwordHash, ...safeBuyer } = buyer;
    return { buyer: safeBuyer, tempPassword };
  }

  async list() {
    return prisma.buyer.findMany({ orderBy: { createdAt: "desc" } });
  }
}

export const buyersService = new BuyersService();
