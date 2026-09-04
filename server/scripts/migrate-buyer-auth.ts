// One-off migration run via `render jobs create` — `prisma db push` can't be used here
// because Prisma's schema engine mangles Supabase's pooler URL (rewrites the port and
// breaks auth) regardless of directUrl. This uses the same PrismaClient/query engine the
// running app already connects with successfully, so it's not affected by that bug.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`ALTER TABLE "buyers" ALTER COLUMN "created_by_id" DROP NOT NULL`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "buyers" ADD COLUMN IF NOT EXISTS "email_verified" BOOLEAN NOT NULL DEFAULT false`
  );
  await prisma.$executeRawUnsafe(`ALTER TABLE "buyers" ADD COLUMN IF NOT EXISTS "email_verification_token" TEXT`);
  await prisma.$executeRawUnsafe(
    `ALTER TABLE "buyers" ADD COLUMN IF NOT EXISTS "email_verification_expires" TIMESTAMP(3)`
  );
  await prisma.$executeRawUnsafe(
    `CREATE UNIQUE INDEX IF NOT EXISTS "buyers_email_verification_token_key" ON "buyers"("email_verification_token")`
  );

  // Every buyer that already exists was created by staff by hand (self-signup didn't exist
  // until this migration), so they're already vetted — retroactively mark them verified so
  // this change doesn't lock existing buyers out of checkout.
  const result = await prisma.$executeRawUnsafe(
    `UPDATE "buyers" SET "email_verified" = true WHERE "created_by_id" IS NOT NULL`
  );

  console.log(`Migration complete. Backfilled email_verified=true for ${result} existing staff-created buyer(s).`);
}

main()
  .catch((e) => {
    console.error("Migration failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
