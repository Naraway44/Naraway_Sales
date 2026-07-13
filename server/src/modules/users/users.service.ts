import bcrypt from "bcryptjs";
import { prisma } from "@/common/prisma";
import { ConflictError, NotFoundError } from "@/common/errors/AppError";
import { generateEmployeeId, generateTempPassword } from "./employeeId";
import { CreateUserInput, ListUsersQuery, UpdateUserInput } from "./users.schemas";

export class UsersService {
  async create(input: CreateUserInput, actorId: string) {
    const existing = await prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("A user with this email already exists");

    const employeeId = await generateEmployeeId(input.role);
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const user = await prisma.user.create({
      data: {
        name: input.name,
        email: input.email,
        role: input.role,
        teamId: input.teamId ?? null,
        employeeId,
        passwordHash,
        mustChangePassword: true,
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
    // Temp password is returned once only; it is never stored in plaintext or logged.
    return { user: safeUser, tempPassword };
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
}

export const usersService = new UsersService();
