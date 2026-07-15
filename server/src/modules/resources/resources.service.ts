import { prisma } from "@/common/prisma";
import { NotFoundError } from "@/common/errors/AppError";
import { CreateResourceInput, ListResourcesQuery, UpdateResourceInput } from "./resources.schemas";

export class ResourcesService {
  async list(query: ListResourcesQuery) {
    return prisma.resource.findMany({
      where: {
        ...(query.category ? { category: query.category } : {}),
        ...(query.serviceId ? { serviceId: query.serviceId } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: "insensitive" } },
                { body: { contains: query.search, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      include: { service: true, createdBy: { select: { id: true, name: true, employeeId: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  async create(input: CreateResourceInput, actorId: string) {
    return prisma.resource.create({
      data: { ...input, createdById: actorId },
      include: { service: true, createdBy: { select: { id: true, name: true, employeeId: true } } },
    });
  }

  async update(id: string, input: UpdateResourceInput) {
    const existing = await prisma.resource.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError("Resource");

    return prisma.resource.update({
      where: { id },
      data: input,
      include: { service: true, createdBy: { select: { id: true, name: true, employeeId: true } } },
    });
  }

  async delete(id: string) {
    await prisma.resource.delete({ where: { id } });
  }
}

export const resourcesService = new ResourcesService();
