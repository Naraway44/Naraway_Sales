import bcrypt from "bcryptjs";
import { Role } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@/common/errors/AppError";
import { generateEmployeeId } from "./employeeId";
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from "./users.schemas";

export class UsersService {
  /** Admin (Founder) sets the password directly here — no auto-generated temp password, no email invite. */
  async create(input: CreateUserInput, actorId: string) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("A user with this email already exists");

    const employeeId = await generateEmployeeId(input.role);
    const passwordHash = await bcrypt.hash(input.password, 10);

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        teamId: input.teamId ?? null,
        employeeId,
        passwordHash,
        mustChangePassword: input.requirePasswordChange,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId,
        action: "USER_CREATED",
        entityType: "User",
        entityId: user.id,
      },
    });

    const { passwordHash: _hash, ...safeUser } = user;
    return { user: safeUser };
  }

  async list(query: ListUsersQuery) {
    const where = {
      ...(query.teamId ? { teamId: query.teamId } : {}),
      ...(query.role ? { role: query.role } : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        include: { team: true },
        orderBy: { createdAt: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return {
      items: items.map(({ passwordHash: _hash, ...u }) => u),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  }

  async getById(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, include: { team: true } });
    if (!user) throw new NotFoundError("User");
    const { passwordHash: _hash, ...safe } = user;
    return safe;
  }

  async update(id: string, input: UpdateUserInput, actorId: string) {
    await this.getById(id);
    const user = await prisma.user.update({ where: { id }, data: input });

    await prisma.auditLog.create({
      data: { actorId, action: "USER_UPDATED", entityType: "User", entityId: id },
    });

    const { passwordHash: _hash, ...safe } = user;
    return safe;
  }

  /**
   * Permanently removes a user account (offboarding) — they can no longer log in, and the
   * row is gone from the database entirely (not just deactivated). Leads they owned are
   * unassigned; leads/comments/activity they created are kept for history but show as
   * created by "Deleted user" rather than being destroyed or blocked by foreign keys.
   * (Comments need no such handling — they're a jsonb snapshot of the author's name at
   * post time, not a live foreign key, so deleting the account doesn't touch them.)
   * Founders can delete anyone; Managers can only delete Executives (not other
   * Managers/Founders), to prevent a Manager from removing peers or admins.
   */
  async delete(id: string, actorId: string, actorRole: Role) {
    const target = await this.getById(id);
    if (id === actorId) throw new ValidationError("You cannot delete your own account");
    if (actorRole === Role.MANAGER && target.role !== Role.EXECUTIVE) {
      throw new ForbiddenError("Managers can only delete Sales Executive accounts");
    }

    await prisma.$transaction([
      prisma.lead.updateMany({ where: { ownerId: id }, data: { ownerId: null } }),
      prisma.lead.updateMany({ where: { createdById: id }, data: { createdById: null } }),
      prisma.leadActivity.updateMany({ where: { userId: id }, data: { userId: null } }),
      prisma.auditLog.updateMany({ where: { actorId: id }, data: { actorId: null } }),
      prisma.user.delete({ where: { id } }),
    ]);

    await prisma.auditLog.create({
      data: { actorId, action: "USER_DELETED", entityType: "User", entityId: id },
    });
  }
}

export const usersService = new UsersService();
