import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const aiTeam = await prisma.team.upsert({
    where: { name: "AI Sales Team" },
    update: {},
    create: { name: "AI Sales Team" },
  });
  const legalTeam = await prisma.team.upsert({
    where: { name: "Legal Sales Team" },
    update: {},
    create: { name: "Legal Sales Team" },
  });

  const aiService = await prisma.service.upsert({
    where: { name: "AI Development" },
    update: {},
    create: { name: "AI Development" },
  });
  await prisma.service.upsert({
    where: { name: "Company Registration" },
    update: {},
    create: { name: "Company Registration" },
  });

  await prisma.leadSource.upsert({
    where: { name: "Website" },
    update: {},
    create: { name: "Website" },
  });
  await prisma.leadSource.upsert({
    where: { name: "Referral" },
    update: {},
    create: { name: "Referral" },
  });

  await prisma.assignmentRule.upsert({
    where: { serviceId: aiService.id },
    update: {},
    create: { serviceId: aiService.id, teamId: aiTeam.id },
  });

  const passwordHash = await bcrypt.hash("ChangeMe123!", 10);

  await prisma.user.upsert({
    where: { email: "founder@naraway.com" },
    update: {},
    create: {
      employeeId: "NRW-FD-001",
      name: "Founder Admin",
      email: "founder@naraway.com",
      passwordHash,
      role: Role.FOUNDER,
      mustChangePassword: true,
    },
  });

  await prisma.user.upsert({
    where: { email: "exec1@naraway.com" },
    update: {},
    create: {
      employeeId: "NRW-SE-001",
      name: "Demo Executive",
      email: "exec1@naraway.com",
      passwordHash,
      role: Role.EXECUTIVE,
      teamId: aiTeam.id,
      mustChangePassword: true,
    },
  });

  console.log("Seed complete. Login: founder@naraway.com / ChangeMe123!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
