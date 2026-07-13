import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const aiTeam = await prisma.team.upsert({
    where: { name: "AI Sales Team" },
    update: {},
    create: { name: "AI Sales Team" },
  });
  await prisma.team.upsert({
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
    create: { name: "Website", isOrganic: true },
  });
  await prisma.leadSource.upsert({
    where: { name: "Referral" },
    update: {},
    create: { name: "Referral", isOrganic: true },
  });
  await prisma.leadSource.upsert({
    where: { name: "Paid Ads" },
    update: {},
    create: { name: "Paid Ads", isOrganic: false },
  });

  await prisma.assignmentRule.upsert({
    where: { serviceId: aiService.id },
    update: {},
    create: { serviceId: aiService.id, teamId: aiTeam.id },
  });

  const passwordHash = await bcrypt.hash("Jack@7775", 10);

  await prisma.user.upsert({
    where: { email: "ceo@naraway.com" },
    update: {},
    create: {
      employeeId: "NRW-FD-001",
      name: "Naraway CEO",
      email: "ceo@naraway.com",
      passwordHash,
      role: Role.FOUNDER,
      mustChangePassword: true,
    },
  });

  console.log("Seed complete. Login: ceo@naraway.com / Jack@7775");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
