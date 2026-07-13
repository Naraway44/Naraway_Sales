import { Role } from "@prisma/client";
import { prisma } from "@/common/prisma";

const PREFIX: Record<Role, string> = {
  FOUNDER: "NRW-FD",
  MANAGER: "NRW-SM",
  EXECUTIVE: "NRW-SE",
};

/** Generates the next sequential employeeId for a role, e.g. NRW-SE-014. */
export async function generateEmployeeId(role: Role): Promise<string> {
  const prefix = PREFIX[role];
  const last = await prisma.user.findFirst({
    where: { employeeId: { startsWith: `${prefix}-` } },
    orderBy: { employeeId: "desc" },
    select: { employeeId: true },
  });

  const lastNumber = last ? parseInt(last.employeeId.split("-").pop() ?? "0", 10) : 0;
  const next = (lastNumber + 1).toString().padStart(3, "0");
  return `${prefix}-${next}`;
}
