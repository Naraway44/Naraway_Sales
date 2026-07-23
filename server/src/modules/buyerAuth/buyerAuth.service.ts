import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { prisma } from "@/common/prisma";
import { signBuyerToken } from "@/common/middleware/buyerAuth";
import { UnauthorizedError } from "@/common/errors/AppError";
import { BuyerLoginInput } from "./buyerAuth.schemas";

export class BuyerAuthService {
  async login(input: BuyerLoginInput) {
    const buyer = await prisma.buyer.findUnique({ where: { email: input.email } });
    if (!buyer || !buyer.isActive) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, buyer.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // A fresh session token on every login overwrites whatever was active before —
    // this is the actual enforcement behind "single, not shareable" buyer access.
    const sessionToken = randomUUID();
    const updated = await prisma.buyer.update({
      where: { id: buyer.id },
      data: { currentSessionToken: sessionToken },
    });

    const token = signBuyerToken({ buyerId: buyer.id, sessionToken });
    return { token, buyer: this.toSafeBuyer(updated) };
  }

  async me(buyerId: string) {
    const buyer = await prisma.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    return this.toSafeBuyer(buyer);
  }

  private toSafeBuyer<T extends { passwordHash: string }>(buyer: T) {
    const { passwordHash: _passwordHash, ...safe } = buyer;
    return safe;
  }
}

export const buyerAuthService = new BuyerAuthService();
