import bcrypt from "bcryptjs";
import { prisma } from "@/common/prisma";
import { signToken } from "@/common/middleware/auth";
import { UnauthorizedError } from "@/common/errors/AppError";
import { LoginInput, ChangePasswordInput } from "./auth.schemas";

export class AuthService {
  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !user.isActive) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const [session] = await prisma.$transaction([
      prisma.userSession.create({ data: { userId: user.id } }),
      prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } }),
    ]);

    const token = signToken({
      id: user.id,
      role: user.role,
      teamId: user.teamId,
      mustChangePassword: user.mustChangePassword,
      sessionId: session.id,
    });

    return {
      token,
      user: this.toSafeUser(user),
    };
  }

  /** Closes out the session's check-out time. Safe to call even if already closed. */
  async logout(sessionId: string) {
    await prisma.userSession.updateMany({
      where: { id: sessionId, logoutAt: null },
      data: { logoutAt: new Date() },
    });
  }

  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput) {
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });

    const valid = await bcrypt.compare(input.currentPassword, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Current password is incorrect");
    }

    const passwordHash = await bcrypt.hash(input.newPassword, 10);
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });

    const token = signToken({
      id: updated.id,
      role: updated.role,
      teamId: updated.teamId,
      mustChangePassword: updated.mustChangePassword,
      sessionId,
    });

    return { token, user: this.toSafeUser(updated) };
  }

  async me(userId: string) {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: { team: true },
    });
    return this.toSafeUser(user);
  }

  private toSafeUser<T extends { passwordHash: string }>(user: T) {
    const { passwordHash: _passwordHash, ...safe } = user;
    return safe;
  }
}

export const authService = new AuthService();
