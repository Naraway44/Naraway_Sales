# Lead Resale Marketplace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a separate buyer-facing marketplace where external buyers pay to unlock Naraway's discarded (Lost) leads, sharing the existing backend but with fully isolated data, auth, and a new standalone frontend app.

**Architecture:** Two new Prisma tables (`Buyer`, `MarketplaceLead`) added to the existing Supabase Postgres DB. Buyer-facing Express routes (`/api/v1/buyer-auth/*`, `/api/v1/marketplace/*`) only ever query those two tables — never the internal `Lead`/`User` models. A new internal-facing route (`/api/v1/buyers`, plus a new action on `/api/v1/leads/:id`) lets Founder/Manager create buyer accounts and release Lost leads to the marketplace. A brand-new Vite/React app (`marketplace-client/`) is the buyer-facing frontend, deployed as its own Render static site, hitting the same backend.

**Tech Stack:** Same as the existing project — Node/Express/TypeScript/Prisma/Postgres on the backend, React/TypeScript/Vite/Tailwind on the frontend, Vitest for backend tests (no frontend test infra exists in this repo, so frontend tasks end with manual dev-server verification instead, matching current convention). Razorpay for payments (new dependency).

**Deviation from the approved spec, flagged for visibility:** §7 of the spec lists "price (min–max)" as a buyer filter. Because pricing is computed live per checkout (based on total quantity purchased in that order, not a fixed per-lead attribute), a coherent "filter the catalog by price" doesn't apply the same way it would to a fixed-price catalog — a lead's price depends on how many you buy alongside it. This plan omits the price-range filter and keeps the other 8 filter dimensions. Flag if you want this handled differently (e.g. filtering by a lead's `overridePrice` when Founder/Manager has set one).

---

## File Structure

**Backend — new files:**
- `server/src/common/middleware/buyerAuth.ts` — buyer JWT verification + single-session check
- `server/src/common/razorpay.ts` — Razorpay client singleton
- `server/src/modules/buyerAuth/{buyerAuth.schemas,buyerAuth.service,buyerAuth.controller,buyerAuth.test}.ts` — buyer login
- `server/src/modules/buyers/{buyers.schemas,buyers.service,buyers.controller,buyers.test}.ts` — staff-side buyer account management
- `server/src/modules/marketplace/{marketplace.pricing,marketplace.pricing.test}.ts` — volume tier pricing (pure function)
- `server/src/modules/marketplace/{curation.service,curation.test}.ts` — release a Lost lead to the marketplace
- `server/src/modules/marketplace/{marketplace.schemas,marketplace.service,marketplace.controller,marketplace.test}.ts` — catalog search, checkout, webhook, buyer dashboard

**Backend — modified files:**
- `server/prisma/schema.prisma` — new models/enums
- `server/prisma/supabase.sql` — dated migration block
- `server/src/common/env.ts` — buyer JWT + Razorpay + multi-origin CORS env vars
- `server/src/app.ts` — mount new routers, multi-origin CORS, raw-body capture for webhook signature verification
- `server/src/modules/leads/leads.controller.ts` — new `POST /:id/release-to-marketplace` route
- `server/src/test/fixtures.ts` — `TestWorld.buyer()` / `TestWorld.marketplaceLead()` helpers
- `server/package.json` — add `razorpay` dependency
- `server/.env.example` — document new env vars

**Frontend — new app `marketplace-client/`** (sibling to `client/` and `server/`, own `package.json`, own Render static site):
- Scaffold: `package.json`, `vite.config.ts`, `tsconfig*.json`, `tailwind.config.js`, `postcss.config.js`, `index.html`, `.env.example`
- `src/main.tsx`, `src/index.css`, `src/App.tsx`
- `src/api/{client,types,buyerAuth,marketplace}.ts`
- `src/lib/auth.tsx`, `src/components/ProtectedRoute.tsx`
- `src/pages/{Login,Catalog,Dashboard}.tsx`

**Sales OS (`client/`) — modified files:**
- `client/src/api/leads.ts` — `releaseLeadToMarketplace()`
- `client/src/api/buyers.ts` — new file, `createBuyer()` / `listBuyers()`
- `client/src/pages/LeadDetail.tsx` — "List on Marketplace" action for Lost leads
- `client/src/pages/Buyers.tsx` — new page, Founder/Manager buyer account admin
- `client/src/App.tsx`, `client/src/components/Layout.tsx` — route + nav link for the new Buyers page

---

## Phase 1 — Database Schema

### Task 1: Add `Buyer` and `MarketplaceLead` models

**Files:**
- Modify: `server/prisma/schema.prisma`
- Modify: `server/prisma/supabase.sql`
- Create (temporary, deleted after use): `server/prisma/migrate-marketplace.ts`

- [ ] **Step 1: Add the new enums and models to `schema.prisma`**

Add near the other enums (after `enum LeadRequestStatus { ... }`, around line 77):

```prisma
enum MarketplaceLeadStatus {
  LISTED
  PENDING
  SOLD
}
```

Add `RELEASED_TO_MARKETPLACE` to the existing `ActivityAction` enum (around line 34-45):

```prisma
enum ActivityAction {
  CREATED
  ASSIGNED
  REASSIGNED
  STATUS_CHANGED
  FIELD_UPDATED
  IMPORTED
  CALLED
  CROSS_ROUTED
  // Founder/Manager approved a Lost lead for resale on the marketplace platform.
  RELEASED_TO_MARKETPLACE
}
```

Add a `releasedToMarketplaceAt` field to `Lead` (near `ownerPinnedAt`, around line 279):

```prisma
  // Set when a Founder/Manager releases this Lost lead to the resale marketplace — lets
  // Sales OS staff see at a glance it's already been sent there, same pattern as
  // ownerPinnedAt. The actual resale record lives entirely in MarketplaceLead; this is
  // just a marker on the original.
  releasedToMarketplaceAt DateTime? @map("released_to_marketplace_at")
```

Add two new relations to `User` (near the other relation lists, around line 192-201):

```prisma
  createdBuyers            Buyer[]           @relation("BuyerCreatedBy")
  approvedMarketplaceLeads MarketplaceLead[] @relation("MarketplaceLeadApprovedBy")
```

Add the new models at the end of the file, after `AuditLog`:

```prisma
// A buyer on the lead resale marketplace — completely separate identity from internal
// User accounts. Created only by Founder/Manager (no public signup). currentSessionToken
// enforces "single, not shareable, only one person" access: a fresh login overwrites it,
// so a shared password just repeatedly logs the other device out rather than granting
// simultaneous access.
model Buyer {
  id                  String    @id @default(cuid())
  name                String
  company             String?
  email               String    @unique
  phone               String?
  passwordHash        String    @map("password_hash")
  currentSessionToken String?   @map("current_session_token")
  isActive            Boolean   @default(true) @map("is_active")
  createdById         String    @map("created_by_id")
  createdBy           User      @relation("BuyerCreatedBy", fields: [createdById], references: [id])
  createdAt           DateTime  @default(now()) @map("created_at")

  purchasedLeads MarketplaceLead[]

  @@map("buyers")
}

// A copy of a Lost lead's resale-safe fields, created the moment Founder/Manager releases
// it to the marketplace. Deliberately a separate table from Lead — buyer-facing code only
// ever queries this model, never Lead or User, so there is no code path (not even a bug)
// that can expose internal Sales OS data to a buyer. A lead is sold at most once in its
// lifetime (exclusive, never recycled after its 2-month window — see marketplace.pricing),
// so purchase fields live directly on this row instead of a separate order/purchase table.
// resaleStatus flow: LISTED -> PENDING (claimed mid-checkout) -> SOLD (payment confirmed),
// or PENDING -> LISTED again if the checkout is abandoned (see releaseAbandonedCheckouts).
model MarketplaceLead {
  id             String  @id @default(cuid())
  originalLeadId String  @map("original_lead_id")
  companyName    String  @map("company_name")
  contactPerson  String?
  phone          String?
  email          String?
  industry       String?
  city           String?
  state          String?
  service        String?
  lostReason     String? @map("lost_reason")

  expectedDealValue Decimal? @map("expected_deal_value") @db.Decimal(14, 2)

  resaleStatus MarketplaceLeadStatus @default(LISTED) @map("resale_status")

  approvedById String   @map("approved_by_id")
  approvedBy   User     @relation("MarketplaceLeadApprovedBy", fields: [approvedById], references: [id])
  // Founder/Manager can override the standard volume-tier price for a specific lead at
  // approval time (a lead lost on budget/timing is worth more than one lost because the
  // company shut down) — the flat rate card can't capture that variance on its own.
  overridePrice Decimal? @map("override_price") @db.Decimal(10, 2)
  listedAt      DateTime @default(now()) @map("listed_at")

  buyerId           String?   @map("buyer_id")
  buyer             Buyer?    @relation(fields: [buyerId], references: [id])
  pricePaid         Decimal?  @map("price_paid") @db.Decimal(10, 2)
  checkoutStartedAt DateTime? @map("checkout_started_at")
  purchasedAt       DateTime? @map("purchased_at")
  // 2 months from purchase. Display/audit field only — expired leads are never re-listed
  // or recycled, so nothing reads this to gate availability.
  exclusiveUntil    DateTime? @map("exclusive_until")
  gatewayOrderId    String?   @map("gateway_order_id")
  gatewayPaymentId  String?   @map("gateway_payment_id")

  @@index([resaleStatus, listedAt])
  @@index([service])
  @@index([industry])
  @@index([city])
  @@index([state])
  @@index([gatewayOrderId])
  @@index([buyerId])
  @@map("marketplace_leads")
}
```

- [ ] **Step 2: Write and run the raw-SQL migration script**

Create `server/prisma/migrate-marketplace.ts`:

```ts
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.$executeRawUnsafe(`
    do $$ begin
      create type "MarketplaceLeadStatus" as enum ('LISTED', 'PENDING', 'SOLD');
    exception when duplicate_object then null; end $$;
  `);
  await prisma.$executeRawUnsafe(`
    do $$ begin
      alter type "ActivityAction" add value if not exists 'RELEASED_TO_MARKETPLACE';
    exception when duplicate_object then null; end $$;
  `);
  await prisma.$executeRawUnsafe(`
    alter table leads add column if not exists released_to_marketplace_at timestamptz;
  `);
  await prisma.$executeRawUnsafe(`
    create table if not exists buyers (
      id text primary key default gen_random_uuid()::text,
      name text not null,
      company text,
      email text not null unique,
      phone text,
      password_hash text not null,
      current_session_token text,
      is_active boolean not null default true,
      created_by_id text not null references users(id),
      created_at timestamptz not null default now()
    );
  `);
  await prisma.$executeRawUnsafe(`
    create table if not exists marketplace_leads (
      id text primary key default gen_random_uuid()::text,
      original_lead_id text not null,
      company_name text not null,
      contact_person text,
      phone text,
      email text,
      industry text,
      city text,
      state text,
      service text,
      lost_reason text,
      expected_deal_value decimal(14,2),
      resale_status "MarketplaceLeadStatus" not null default 'LISTED',
      approved_by_id text not null references users(id),
      override_price decimal(10,2),
      listed_at timestamptz not null default now(),
      buyer_id text references buyers(id),
      price_paid decimal(10,2),
      checkout_started_at timestamptz,
      purchased_at timestamptz,
      exclusive_until timestamptz,
      gateway_order_id text,
      gateway_payment_id text
    );
  `);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_status_listed_idx on marketplace_leads(resale_status, listed_at);`);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_service_idx on marketplace_leads(service);`);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_industry_idx on marketplace_leads(industry);`);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_city_idx on marketplace_leads(city);`);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_state_idx on marketplace_leads(state);`);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_gateway_order_idx on marketplace_leads(gateway_order_id);`);
  await prisma.$executeRawUnsafe(`create index if not exists marketplace_leads_buyer_idx on marketplace_leads(buyer_id);`);

  console.log("Marketplace migration applied.");
}

main().finally(() => prisma.$disconnect());
```

Run: `cd server && npx tsx prisma/migrate-marketplace.ts`
Expected: `Marketplace migration applied.` printed, no errors.

- [ ] **Step 3: Delete the temporary migration script**

Run: `rm server/prisma/migrate-marketplace.ts` (or `Remove-Item` on Windows)

- [ ] **Step 4: Append the same SQL to `supabase.sql` as a dated block**

Add to the end of `server/prisma/supabase.sql`:

```sql

-- 2026-07-23: lead resale marketplace — buyers and marketplace_leads are a deliberately
-- separate pair of tables. Buyer-facing code only ever queries these two; the internal
-- Lead/User tables are never touched by marketplace routes. A lead is sold at most once
-- (exclusive, 2-month window, never recycled), so purchase fields live directly on
-- marketplace_leads rather than a separate order table.
do $$ begin
  create type "MarketplaceLeadStatus" as enum ('LISTED', 'PENDING', 'SOLD');
exception when duplicate_object then null; end $$;
do $$ begin
  alter type "ActivityAction" add value if not exists 'RELEASED_TO_MARKETPLACE';
exception when duplicate_object then null; end $$;
alter table leads add column if not exists released_to_marketplace_at timestamptz;

create table if not exists buyers (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  company text,
  email text not null unique,
  phone text,
  password_hash text not null,
  current_session_token text,
  is_active boolean not null default true,
  created_by_id text not null references users(id),
  created_at timestamptz not null default now()
);

create table if not exists marketplace_leads (
  id text primary key default gen_random_uuid()::text,
  original_lead_id text not null,
  company_name text not null,
  contact_person text,
  phone text,
  email text,
  industry text,
  city text,
  state text,
  service text,
  lost_reason text,
  expected_deal_value decimal(14,2),
  resale_status "MarketplaceLeadStatus" not null default 'LISTED',
  approved_by_id text not null references users(id),
  override_price decimal(10,2),
  listed_at timestamptz not null default now(),
  buyer_id text references buyers(id),
  price_paid decimal(10,2),
  checkout_started_at timestamptz,
  purchased_at timestamptz,
  exclusive_until timestamptz,
  gateway_order_id text,
  gateway_payment_id text
);
create index if not exists marketplace_leads_status_listed_idx on marketplace_leads(resale_status, listed_at);
create index if not exists marketplace_leads_service_idx on marketplace_leads(service);
create index if not exists marketplace_leads_industry_idx on marketplace_leads(industry);
create index if not exists marketplace_leads_city_idx on marketplace_leads(city);
create index if not exists marketplace_leads_state_idx on marketplace_leads(state);
create index if not exists marketplace_leads_gateway_order_idx on marketplace_leads(gateway_order_id);
create index if not exists marketplace_leads_buyer_idx on marketplace_leads(buyer_id);
```

- [ ] **Step 5: Regenerate the Prisma client**

Run: `cd server && npx prisma generate`
Expected: `Generated Prisma Client` success message.

- [ ] **Step 6: Commit**

```bash
git add server/prisma/schema.prisma server/prisma/supabase.sql
git commit -m "feat: add Buyer and MarketplaceLead schema for lead resale marketplace"
```

---

## Phase 2 — Pricing

### Task 2: Volume-tier pricing function

**Files:**
- Create: `server/src/modules/marketplace/marketplace.pricing.ts`
- Test: `server/src/modules/marketplace/marketplace.pricing.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { priceForQuantity } from "./marketplace.pricing";

describe("priceForQuantity", () => {
  it("charges ₹10/lead for 1-99", () => {
    expect(priceForQuantity(1)).toBe(10);
    expect(priceForQuantity(99)).toBe(10);
  });

  it("charges ₹5/lead for 100-999", () => {
    expect(priceForQuantity(100)).toBe(5);
    expect(priceForQuantity(999)).toBe(5);
  });

  it("charges ₹3/lead for 1000-4999", () => {
    expect(priceForQuantity(1000)).toBe(3);
    expect(priceForQuantity(4999)).toBe(3);
  });

  it("charges ₹2/lead for 5000-9999", () => {
    expect(priceForQuantity(5000)).toBe(2);
    expect(priceForQuantity(9999)).toBe(2);
  });

  it("charges ₹1/lead for 10000+", () => {
    expect(priceForQuantity(10000)).toBe(1);
    expect(priceForQuantity(50000)).toBe(1);
  });

  it("rejects a quantity below 1", () => {
    expect(() => priceForQuantity(0)).toThrow(RangeError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run marketplace.pricing -t priceForQuantity`
Expected: FAIL with "Cannot find module './marketplace.pricing'"

- [ ] **Step 3: Write the implementation**

```ts
// Standard volume rate card — computed live per checkout, never published to buyers as a
// static table (see design spec §8). Founder/Manager can still override an individual
// lead's price at approval time; that override is applied by the caller, not here.
const TIERS: { maxQuantity: number; pricePerLead: number }[] = [
  { maxQuantity: 99, pricePerLead: 10 },
  { maxQuantity: 999, pricePerLead: 5 },
  { maxQuantity: 4999, pricePerLead: 3 },
  { maxQuantity: 9999, pricePerLead: 2 },
  { maxQuantity: Infinity, pricePerLead: 1 },
];

export function priceForQuantity(quantity: number): number {
  if (quantity < 1) {
    throw new RangeError("quantity must be at least 1");
  }
  const tier = TIERS.find((t) => quantity <= t.maxQuantity)!;
  return tier.pricePerLead;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run marketplace.pricing -t priceForQuantity`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/marketplace/marketplace.pricing.ts server/src/modules/marketplace/marketplace.pricing.test.ts
git commit -m "feat: add marketplace volume-tier pricing function"
```

---

## Phase 3 — Buyer Authentication

### Task 3: Env vars and buyer auth middleware

**Files:**
- Modify: `server/src/common/env.ts`
- Modify: `server/.env.example`
- Create: `server/src/common/middleware/buyerAuth.ts`

- [ ] **Step 1: Add new env vars**

Replace the full contents of `server/src/common/env.ts`:

```ts
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  // Comma-separated — the internal Sales OS and the buyer-facing marketplace are two
  // different origins hitting this same backend, so a single CORS_ORIGIN string isn't
  // enough once the marketplace frontend exists.
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),
  // Deliberately a separate secret from jwtSecret: a buyer token must never verify
  // successfully against staff auth, or vice versa, even if one secret were ever leaked.
  buyerJwtSecret: required("BUYER_JWT_SECRET"),
  buyerJwtExpiresIn: process.env.BUYER_JWT_EXPIRES_IN ?? "8h",
  razorpayKeyId: required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: required("RAZORPAY_WEBHOOK_SECRET"),
};
```

- [ ] **Step 2: Document the new env vars**

Replace the full contents of `server/.env.example`:

```
DATABASE_URL="postgresql://postgres:password@db.xxxxxxxxxxxx.supabase.co:5432/postgres"
JWT_SECRET="replace-with-a-long-random-string"
JWT_EXPIRES_IN="3d"
PORT=4000
NODE_ENV=development
CORS_ORIGIN="http://localhost:5173,http://localhost:5174"
BUYER_JWT_SECRET="replace-with-a-different-long-random-string"
BUYER_JWT_EXPIRES_IN="8h"
RAZORPAY_KEY_ID="rzp_test_xxxxxxxxxxxx"
RAZORPAY_KEY_SECRET="replace-with-razorpay-key-secret"
RAZORPAY_WEBHOOK_SECRET="replace-with-razorpay-webhook-secret"
```

- [ ] **Step 3: Add `BUYER_JWT_SECRET` and Razorpay test keys to the local `.env`**

Run (adjust the actual secret values):
```bash
cat >> server/.env << 'EOF'
BUYER_JWT_SECRET=dev-only-buyer-secret-change-me
BUYER_JWT_EXPIRES_IN=8h
RAZORPAY_KEY_ID=rzp_test_placeholder
RAZORPAY_KEY_SECRET=placeholder_secret
RAZORPAY_WEBHOOK_SECRET=placeholder_webhook_secret
EOF
```
Expected: no output; `server/.env` now has the 5 new lines. (Real Razorpay test-mode keys are needed before checkout/webhook tasks can be exercised end-to-end — see Task 16's note.)

- [ ] **Step 4: Write the buyer auth middleware**

```ts
import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/common/env";
import { prisma } from "@/common/prisma";
import { UnauthorizedError } from "@/common/errors/AppError";

export interface BuyerAuthPayload {
  buyerId: string;
  sessionToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      buyer?: BuyerAuthPayload;
    }
  }
}

export function signBuyerToken(payload: BuyerAuthPayload): string {
  return jwt.sign(payload, env.buyerJwtSecret, {
    expiresIn: env.buyerJwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/** Verifies the JWT, then checks the embedded sessionToken still matches the Buyer row's
 *  currentSessionToken — a newer login elsewhere overwrites that column, so this is what
 *  actually enforces "single session" rather than just being a stateless JWT check. */
export async function requireBuyerAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  let payload: BuyerAuthPayload;
  try {
    payload = jwt.verify(token, env.buyerJwtSecret) as BuyerAuthPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const buyer = await prisma.buyer.findUnique({ where: { id: payload.buyerId } });
  if (!buyer || !buyer.isActive || buyer.currentSessionToken !== payload.sessionToken) {
    throw new UnauthorizedError("Session expired — this account signed in elsewhere");
  }

  req.buyer = payload;
  next();
}
```

- [ ] **Step 5: Commit**

```bash
git add server/src/common/env.ts server/.env.example server/src/common/middleware/buyerAuth.ts
git commit -m "feat: add buyer auth env vars and single-session middleware"
```

### Task 4: Buyer login service, schema, controller

**Files:**
- Create: `server/src/modules/buyerAuth/buyerAuth.schemas.ts`
- Create: `server/src/modules/buyerAuth/buyerAuth.service.ts`
- Create: `server/src/modules/buyerAuth/buyerAuth.controller.ts`
- Test: `server/src/modules/buyerAuth/buyerAuth.test.ts`
- Modify: `server/src/test/fixtures.ts`

- [ ] **Step 1: Add a `buyer()` fixture helper**

In `server/src/test/fixtures.ts`, add `buyerIds: string[] = [];` to the class field list (next to `leadIds`, around line 13), add this method (anywhere among the other factory methods):

```ts
  async buyer(opts: { createdById: string; isActive?: boolean } ) {
    const suffix = randomUUID().slice(0, 8);
    const passwordHash = await bcrypt.hash("TestPass123!", 4);
    const buyer = await prisma.buyer.create({
      data: {
        name: `Test Buyer ${suffix}`,
        email: `${this.tag}-buyer-${suffix}@test.local`,
        passwordHash,
        isActive: opts.isActive ?? true,
        createdById: opts.createdById,
      },
    });
    this.buyerIds.push(buyer.id);
    return buyer;
  }
```

And add cleanup, at the top of `cleanup()` (buyers have no FK dependents among other tracked fixtures, so order doesn't matter relative to the rest, but must run before `userIds` cleanup since `createdById` references a user):

```ts
    if (this.buyerIds.length) {
      await prisma.buyer.deleteMany({ where: { id: { in: this.buyerIds } } });
    }
```

- [ ] **Step 2: Write the schema**

```ts
import { z } from "zod";

export const buyerLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type BuyerLoginInput = z.infer<typeof buyerLoginSchema>;
```

- [ ] **Step 3: Write the failing service test**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/common/prisma";
import { UnauthorizedError } from "@/common/errors/AppError";
import { TestWorld } from "@/test/fixtures";
import { buyerAuthService } from "./buyerAuth.service";

const PASSWORD = "TestPass123!";

describe("BuyerAuthService", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("logs in with correct credentials", async () => {
    const staff = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: staff.id });

    const result = await buyerAuthService.login({ email: buyer.email, password: PASSWORD });

    expect(result.token).toBeTruthy();
    expect(result.buyer.id).toBe(buyer.id);
    expect((result.buyer as any).passwordHash).toBeUndefined();
  });

  it("rejects a wrong password", async () => {
    const staff = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: staff.id });

    await expect(
      buyerAuthService.login({ email: buyer.email, password: "wrong" })
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("a second login invalidates the first session's token", async () => {
    const staff = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: staff.id });

    await buyerAuthService.login({ email: buyer.email, password: PASSWORD });
    const firstSessionToken = (await prisma.buyer.findUniqueOrThrow({ where: { id: buyer.id } })).currentSessionToken;

    await buyerAuthService.login({ email: buyer.email, password: PASSWORD });
    const secondSessionToken = (await prisma.buyer.findUniqueOrThrow({ where: { id: buyer.id } })).currentSessionToken;

    expect(secondSessionToken).not.toBe(firstSessionToken);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npx vitest run buyerAuth.test`
Expected: FAIL with "Cannot find module './buyerAuth.service'"

- [ ] **Step 5: Write the service implementation**

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run buyerAuth.test`
Expected: PASS, 3 tests

- [ ] **Step 7: Write the controller**

```ts
import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { requireBuyerAuth } from "@/common/middleware/buyerAuth";
import { buyerAuthService } from "./buyerAuth.service";
import { buyerLoginSchema } from "./buyerAuth.schemas";

export const buyerAuthRouter = Router();

buyerAuthRouter.post(
  "/login",
  asyncHandler(async (req, res) => {
    const parsed = buyerLoginSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await buyerAuthService.login(parsed.data));
  })
);

buyerAuthRouter.get(
  "/me",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    res.json(await buyerAuthService.me(req.buyer!.buyerId));
  })
);
```

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/buyerAuth server/src/test/fixtures.ts
git commit -m "feat: add buyer login with single-session enforcement"
```

---

## Phase 4 — Internal Buyer Account Management

### Task 5: Founder/Manager creates buyer accounts

**Files:**
- Create: `server/src/modules/buyers/buyers.schemas.ts`
- Create: `server/src/modules/buyers/buyers.service.ts`
- Create: `server/src/modules/buyers/buyers.controller.ts`
- Test: `server/src/modules/buyers/buyers.test.ts`

- [ ] **Step 1: Write the schema**

```ts
import { z } from "zod";

export const createBuyerSchema = z.object({
  name: z.string().min(1),
  company: z.string().optional().nullable(),
  email: z.string().email(),
  phone: z.string().optional().nullable(),
});

export type CreateBuyerInput = z.infer<typeof createBuyerSchema>;
```

- [ ] **Step 2: Write the failing service test**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { ConflictError } from "@/common/errors/AppError";
import { TestWorld } from "@/test/fixtures";
import { buyersService } from "./buyers.service";

describe("BuyersService", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("creates a buyer with a generated temp password", async () => {
    const staff = await world.user({ role: "FOUNDER" });
    const result = await buyersService.create(
      { id: staff.id, role: "FOUNDER", teamId: null, mustChangePassword: false, sessionId: "s" },
      { name: "Acme Buyer", email: `acme-${Date.now()}@test.local`, company: "Acme Inc", phone: null }
    );
    world.trackBuyer(result.buyer.id);

    expect(result.tempPassword).toBeTruthy();
    expect((result.buyer as any).passwordHash).toBeUndefined();
    expect(result.buyer.createdById).toBe(staff.id);
  });

  it("rejects a duplicate email", async () => {
    const staff = await world.user({ role: "FOUNDER" });
    const email = `dup-${Date.now()}@test.local`;
    const authUser = { id: staff.id, role: "FOUNDER" as const, teamId: null, mustChangePassword: false, sessionId: "s" };

    const first = await buyersService.create(authUser, { name: "First", email, company: null, phone: null });
    world.trackBuyer(first.buyer.id);

    await expect(
      buyersService.create(authUser, { name: "Second", email, company: null, phone: null })
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
```

- [ ] **Step 3: Add a `trackBuyer` helper to fixtures**

In `server/src/test/fixtures.ts`, add next to `trackLead`:

```ts
  trackBuyer(id: string) {
    this.buyerIds.push(id);
  }
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npx vitest run buyers.test`
Expected: FAIL with "Cannot find module './buyers.service'"

- [ ] **Step 5: Write the service**

```ts
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
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run buyers.test`
Expected: PASS, 2 tests

- [ ] **Step 7: Write the controller**

```ts
import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { requireAuth, requirePasswordChanged, requireRole } from "@/common/middleware/auth";
import { ValidationError } from "@/common/errors/AppError";
import { buyersService } from "./buyers.service";
import { createBuyerSchema } from "./buyers.schemas";

export const buyersRouter = Router();

buyersRouter.use(requireAuth, requirePasswordChanged, requireRole("FOUNDER", "MANAGER"));

buyersRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    res.json(await buyersService.list());
  })
);

buyersRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const parsed = createBuyerSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await buyersService.create(req.user!, parsed.data));
  })
);
```

- [ ] **Step 8: Commit**

```bash
git add server/src/modules/buyers server/src/test/fixtures.ts
git commit -m "feat: let Founder/Manager create marketplace buyer accounts"
```

---

## Phase 5 — Curation (Release a Lost Lead to the Marketplace)

### Task 6: `releaseLead`

**Files:**
- Create: `server/src/modules/marketplace/curation.service.ts`
- Test: `server/src/modules/marketplace/curation.test.ts`
- Modify: `server/src/test/fixtures.ts`

- [ ] **Step 1: Add a `marketplaceLead()` fixture helper**

In `server/src/test/fixtures.ts`, add `marketplaceLeadIds: string[] = [];` to the class fields, add this method:

```ts
  async marketplaceLead(opts: {
    approvedById: string;
    resaleStatus?: "LISTED" | "PENDING" | "SOLD";
    buyerId?: string | null;
    overridePrice?: number | null;
    listedAt?: Date;
  }) {
    const suffix = randomUUID().slice(0, 8);
    const marketplaceLead = await prisma.marketplaceLead.create({
      data: {
        originalLeadId: `test-original-${suffix}`,
        companyName: `Test Marketplace Co ${suffix}`,
        approvedById: opts.approvedById,
        resaleStatus: opts.resaleStatus ?? "LISTED",
        buyerId: opts.buyerId ?? null,
        overridePrice: opts.overridePrice ?? null,
        ...(opts.listedAt ? { listedAt: opts.listedAt } : {}),
      },
    });
    this.marketplaceLeadIds.push(marketplaceLead.id);
    return marketplaceLead;
  }
```

Add cleanup (before the `buyerIds` cleanup block, since `marketplace_leads.buyer_id` references `buyers`):

```ts
    if (this.marketplaceLeadIds.length) {
      await prisma.marketplaceLead.deleteMany({ where: { id: { in: this.marketplaceLeadIds } } });
    }
```

- [ ] **Step 2: Write the failing test**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { prisma } from "@/common/prisma";
import { ForbiddenError, ValidationError } from "@/common/errors/AppError";
import { TestWorld } from "@/test/fixtures";
import { releaseLead } from "./curation.service";

describe("releaseLead", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("copies a Lost lead into MarketplaceLead and marks the original as released", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const lead = await world.lead({ status: "LOST" });
    await prisma.lead.update({ where: { id: lead.id }, data: { companyName: "Widgets Co", city: "Noida" } });

    const authUser = { id: founder.id, role: "FOUNDER" as const, teamId: null, mustChangePassword: false, sessionId: "s" };
    const result = await releaseLead(authUser, lead.id);
    world.trackMarketplaceLead(result.id);

    expect(result.companyName).toBe("Widgets Co");
    expect(result.city).toBe("Noida");
    expect(result.resaleStatus).toBe("LISTED");
    expect(result.approvedById).toBe(founder.id);

    const updatedLead = await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } });
    expect(updatedLead.releasedToMarketplaceAt).not.toBeNull();
  });

  it("stores an override price when given one", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const lead = await world.lead({ status: "LOST" });
    const authUser = { id: founder.id, role: "FOUNDER" as const, teamId: null, mustChangePassword: false, sessionId: "s" };

    const result = await releaseLead(authUser, lead.id, 25);
    world.trackMarketplaceLead(result.id);

    expect(Number(result.overridePrice)).toBe(25);
  });

  it("rejects a lead that isn't Lost", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const lead = await world.lead({ status: "NEW" });
    const authUser = { id: founder.id, role: "FOUNDER" as const, teamId: null, mustChangePassword: false, sessionId: "s" };

    await expect(releaseLead(authUser, lead.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects a lead that's already been released", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const lead = await world.lead({ status: "LOST" });
    const authUser = { id: founder.id, role: "FOUNDER" as const, teamId: null, mustChangePassword: false, sessionId: "s" };

    const first = await releaseLead(authUser, lead.id);
    world.trackMarketplaceLead(first.id);

    await expect(releaseLead(authUser, lead.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an Executive", async () => {
    const exec = await world.user({ role: "EXECUTIVE" });
    const lead = await world.lead({ status: "LOST" });
    const authUser = { id: exec.id, role: "EXECUTIVE" as const, teamId: null, mustChangePassword: false, sessionId: "s" };

    await expect(releaseLead(authUser, lead.id)).rejects.toBeInstanceOf(ForbiddenError);
  });
});
```

- [ ] **Step 3: Add `trackMarketplaceLead` to fixtures**

```ts
  trackMarketplaceLead(id: string) {
    this.marketplaceLeadIds.push(id);
  }
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd server && npx vitest run curation.test`
Expected: FAIL with "Cannot find module './curation.service'"

- [ ] **Step 5: Write the implementation**

```ts
import { ActivityAction, Role } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { ForbiddenError, NotFoundError, ValidationError } from "@/common/errors/AppError";
import { logActivity } from "@/modules/activities/activities.service";
import { AuthUser } from "@/common/middleware/auth";

export async function releaseLead(user: AuthUser, leadId: string, overridePrice?: number) {
  if (user.role !== Role.FOUNDER && user.role !== Role.MANAGER) {
    throw new ForbiddenError("Only Founder or Manager can release a lead to the marketplace");
  }

  const lead = await prisma.lead.findUnique({ where: { id: leadId }, include: { service: true } });
  if (!lead) throw new NotFoundError("Lead");
  if (lead.status !== "LOST") {
    throw new ValidationError("Only Lost leads can be released to the marketplace");
  }
  if (lead.releasedToMarketplaceAt) {
    throw new ValidationError("This lead has already been released to the marketplace");
  }

  const [marketplaceLead] = await prisma.$transaction([
    prisma.marketplaceLead.create({
      data: {
        originalLeadId: lead.id,
        companyName: lead.companyName,
        contactPerson: lead.contactPerson,
        phone: lead.phone,
        email: lead.email,
        industry: lead.industry,
        city: lead.city,
        state: lead.state,
        service: lead.service?.name ?? null,
        lostReason: lead.lostReason,
        expectedDealValue: lead.expectedDealValue,
        approvedById: user.id,
        overridePrice: overridePrice ?? null,
      },
    }),
    prisma.lead.update({ where: { id: lead.id }, data: { releasedToMarketplaceAt: new Date() } }),
  ]);

  await logActivity({
    leadId: lead.id,
    userId: user.id,
    action: ActivityAction.RELEASED_TO_MARKETPLACE,
    notes: overridePrice ? `Listed at override price ₹${overridePrice}/lead` : undefined,
  });

  return marketplaceLead;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd server && npx vitest run curation.test`
Expected: PASS, 5 tests

- [ ] **Step 7: Commit**

```bash
git add server/src/modules/marketplace/curation.service.ts server/src/modules/marketplace/curation.test.ts server/src/test/fixtures.ts
git commit -m "feat: let Founder/Manager release Lost leads to the marketplace"
```

### Task 7: Wire the release action into the leads API

**Files:**
- Modify: `server/src/modules/leads/leads.controller.ts`

- [ ] **Step 1: Add the route**

In `server/src/modules/leads/leads.controller.ts`, add this import at the top alongside the existing ones (after the `commentsService` import, around line 16):

```ts
import { releaseLead } from "@/modules/marketplace/curation.service";
```

Add this route after the existing `/:id/pin` route (after line 223, before the closing of the file):

```ts

leadsRouter.post(
  "/:id/release-to-marketplace",
  requireRole("FOUNDER", "MANAGER"),
  asyncHandler(async (req, res) => {
    const { overridePrice } = req.body as { overridePrice?: number };
    res.status(201).json(await releaseLead(req.user!, req.params.id, overridePrice));
  })
);
```

- [ ] **Step 2: Verify the server still builds**

Run: `cd server && npx tsc --noEmit -p tsconfig.test.json`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add server/src/modules/leads/leads.controller.ts
git commit -m "feat: expose release-to-marketplace as a lead action"
```

---

## Phase 6 — Marketplace Catalog, Checkout, Webhook

### Task 8: Add the `razorpay` dependency and client singleton

**Files:**
- Modify: `server/package.json`
- Create: `server/src/common/razorpay.ts`

- [ ] **Step 1: Install the dependency**

Run: `cd server && npm install razorpay`
Expected: `package.json` and `package-lock.json` updated with `razorpay` under `dependencies`.

- [ ] **Step 2: Write the client singleton**

```ts
import Razorpay from "razorpay";
import { env } from "@/common/env";

export const razorpay = new Razorpay({
  key_id: env.razorpayKeyId,
  key_secret: env.razorpayKeySecret,
});
```

- [ ] **Step 3: Commit**

```bash
git add server/package.json server/package-lock.json server/src/common/razorpay.ts
git commit -m "chore: add razorpay dependency and client singleton"
```

### Task 9: Marketplace filter/checkout schemas

**Files:**
- Create: `server/src/modules/marketplace/marketplace.schemas.ts`

- [ ] **Step 1: Write the schemas**

```ts
import { z } from "zod";

// Note: price is deliberately not a filter dimension here — it's computed live per
// checkout from the total quantity purchased (see marketplace.pricing), not a fixed
// per-lead attribute buyers can range-filter on. See plan header for details.
export const marketplaceFilterSchema = z.object({
  service: z.string().optional(),
  industry: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  lostReason: z.string().optional(),
  keyword: z.string().optional(),
  dealValueMin: z.coerce.number().optional(),
  dealValueMax: z.coerce.number().optional(),
  dateListedFrom: z.coerce.date().optional(),
  dateListedTo: z.coerce.date().optional(),
});

export const marketplaceSearchQuerySchema = marketplaceFilterSchema.extend({
  quantity: z.coerce.number().int().min(1).default(1),
});

export const checkoutSchema = marketplaceFilterSchema.extend({
  quantity: z.number().int().min(1),
});

export type MarketplaceFilter = z.infer<typeof marketplaceFilterSchema>;
export type MarketplaceSearchQuery = z.infer<typeof marketplaceSearchQuerySchema>;
export type CheckoutInput = z.infer<typeof checkoutSchema>;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/modules/marketplace/marketplace.schemas.ts
git commit -m "feat: add marketplace filter and checkout schemas"
```

### Task 10: Catalog search (live count + price estimate)

**Files:**
- Create: `server/src/modules/marketplace/marketplace.service.ts`
- Test: `server/src/modules/marketplace/marketplace.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { afterAll, describe, expect, it } from "vitest";
import { TestWorld } from "@/test/fixtures";
import { marketplaceService } from "./marketplace.service";

describe("MarketplaceService.search", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("counts only LISTED leads matching the filters and estimates the tier price", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const tag = `search-${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const ml = await prisma.marketplaceLead.create({
        data: { originalLeadId: `orig-search-${i}`, companyName: `Search Co ${i}`, approvedById: founder.id, industry: tag },
      });
      world.trackMarketplaceLead(ml.id);
    }
    const result = await marketplaceService.search({ quantity: 3, industry: tag } as any);

    expect(result.availableCount).toBe(5);
    expect(result.deliverableQuantity).toBe(3);
    expect(result.pricePerLead).toBe(10);
    expect(result.estimatedTotal).toBe(30);
  });

  it("caps deliverable quantity at what's actually available", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const ml = await world.marketplaceLead({ approvedById: founder.id, resaleStatus: "LISTED" });
    world.trackMarketplaceLead(ml.id);

    const result = await marketplaceService.search({ quantity: 999999, city: `no-such-city-${Date.now()}` } as any);
    expect(result.availableCount).toBe(0);
    expect(result.deliverableQuantity).toBe(0);
    expect(result.pricePerLead).toBe(0);
  });
});
```

Add `import { prisma } from "@/common/prisma";` to the top of `marketplace.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run marketplace.test -t search`
Expected: FAIL with "Cannot find module './marketplace.service'"

- [ ] **Step 3: Write the search portion of the service**

```ts
import { MarketplaceLeadStatus, Prisma } from "@prisma/client";
import { prisma } from "@/common/prisma";
import { ValidationError } from "@/common/errors/AppError";
import { razorpay } from "@/common/razorpay";
import { env } from "@/common/env";
import { leadsToCsv } from "@/modules/leads/leadsImport.service";
import { priceForQuantity } from "./marketplace.pricing";
import { CheckoutInput, MarketplaceFilter, MarketplaceSearchQuery } from "./marketplace.schemas";

const ABANDONED_CHECKOUT_MINUTES = 30;
const EXCLUSIVITY_DAYS = 60;

function filterWhere(filter: MarketplaceFilter): Prisma.MarketplaceLeadWhereInput {
  return {
    ...(filter.service ? { service: filter.service } : {}),
    ...(filter.industry ? { industry: filter.industry } : {}),
    ...(filter.city ? { city: filter.city } : {}),
    ...(filter.state ? { state: filter.state } : {}),
    ...(filter.lostReason ? { lostReason: filter.lostReason } : {}),
    ...(filter.dealValueMin != null || filter.dealValueMax != null
      ? {
          expectedDealValue: {
            ...(filter.dealValueMin != null ? { gte: filter.dealValueMin } : {}),
            ...(filter.dealValueMax != null ? { lte: filter.dealValueMax } : {}),
          },
        }
      : {}),
    ...(filter.dateListedFrom || filter.dateListedTo
      ? {
          listedAt: {
            ...(filter.dateListedFrom ? { gte: filter.dateListedFrom } : {}),
            ...(filter.dateListedTo ? { lte: new Date(filter.dateListedTo.getTime() + 86_400_000 - 1) } : {}),
          },
        }
      : {}),
    ...(filter.keyword ? { companyName: { contains: filter.keyword, mode: "insensitive" } } : {}),
  };
}

export class MarketplaceService {
  async search(query: MarketplaceSearchQuery) {
    const where: Prisma.MarketplaceLeadWhereInput = {
      resaleStatus: MarketplaceLeadStatus.LISTED,
      ...filterWhere(query),
    };

    const availableCount = await prisma.marketplaceLead.count({ where });
    const deliverable = Math.min(query.quantity, availableCount);
    const pricePerLead = deliverable > 0 ? priceForQuantity(deliverable) : 0;

    return {
      availableCount,
      requestedQuantity: query.quantity,
      deliverableQuantity: deliverable,
      pricePerLead,
      estimatedTotal: pricePerLead * deliverable,
    };
  }
}

export const marketplaceService = new MarketplaceService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run marketplace.test -t search`
Expected: PASS, 2 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/marketplace/marketplace.service.ts server/src/modules/marketplace/marketplace.test.ts
git commit -m "feat: add marketplace catalog search with live count and price estimate"
```

### Task 11: Abandoned-checkout sweep

**Files:**
- Modify: `server/src/modules/marketplace/marketplace.service.ts`
- Modify: `server/src/modules/marketplace/marketplace.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `marketplace.test.ts`:

```ts
describe("MarketplaceService.releaseAbandonedCheckouts", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("reverts PENDING leads whose checkout started too long ago back to LISTED", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const stale = await prisma.marketplaceLead.create({
      data: {
        originalLeadId: "orig-1",
        companyName: "Stale Co",
        approvedById: founder.id,
        resaleStatus: "PENDING",
        buyerId: buyer.id,
        checkoutStartedAt: new Date(Date.now() - 45 * 60 * 1000),
      },
    });
    world.trackMarketplaceLead(stale.id);

    const fresh = await prisma.marketplaceLead.create({
      data: {
        originalLeadId: "orig-2",
        companyName: "Fresh Co",
        approvedById: founder.id,
        resaleStatus: "PENDING",
        buyerId: buyer.id,
        checkoutStartedAt: new Date(),
      },
    });
    world.trackMarketplaceLead(fresh.id);

    await marketplaceService.releaseAbandonedCheckouts();

    const staleAfter = await prisma.marketplaceLead.findUniqueOrThrow({ where: { id: stale.id } });
    expect(staleAfter.resaleStatus).toBe("LISTED");
    expect(staleAfter.buyerId).toBeNull();

    const freshAfter = await prisma.marketplaceLead.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(freshAfter.resaleStatus).toBe("PENDING");
  });
});
```

(`prisma` is already imported at the top of `marketplace.test.ts` from Task 10 — no new import needed.)

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run marketplace.test -t releaseAbandonedCheckouts`
Expected: FAIL with "marketplaceService.releaseAbandonedCheckouts is not a function"

- [ ] **Step 3: Add the method to the service**

In `marketplace.service.ts`, add this method inside the `MarketplaceService` class, and call it at the top of `search`:

```ts
  /** Reverts checkouts nobody completed payment on — otherwise those leads would stay
   *  PENDING (invisible to every other buyer) forever. Piggybacked on the search endpoint
   *  since there's no cron infra on the free tier, same "sweep on a frequently-hit route"
   *  pattern the alerts poll already uses for abandoned staff sessions. */
  async releaseAbandonedCheckouts() {
    const cutoff = new Date(Date.now() - ABANDONED_CHECKOUT_MINUTES * 60 * 1000);
    const result = await prisma.marketplaceLead.updateMany({
      where: { resaleStatus: MarketplaceLeadStatus.PENDING, checkoutStartedAt: { lt: cutoff } },
      data: {
        resaleStatus: MarketplaceLeadStatus.LISTED,
        buyerId: null,
        pricePaid: null,
        checkoutStartedAt: null,
        gatewayOrderId: null,
      },
    });
    return { releasedCount: result.count };
  }
```

Update `search` to call it first:

```ts
  async search(query: MarketplaceSearchQuery) {
    await this.releaseAbandonedCheckouts();

    const where: Prisma.MarketplaceLeadWhereInput = {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run marketplace.test`
Expected: PASS, all tests including the new one

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/marketplace/marketplace.service.ts server/src/modules/marketplace/marketplace.test.ts
git commit -m "feat: sweep abandoned marketplace checkouts back to LISTED"
```

### Task 12: Checkout — claim leads and create a Razorpay order

**Files:**
- Modify: `server/src/modules/marketplace/marketplace.service.ts`
- Modify: `server/src/modules/marketplace/marketplace.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `marketplace.test.ts`:

```ts
describe("MarketplaceService.createCheckout", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("claims LISTED leads as PENDING and returns a Razorpay order", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const service = await world.service();
    for (let i = 0; i < 3; i++) {
      const ml = await prisma.marketplaceLead.create({
        data: { originalLeadId: `orig-checkout-${i}`, companyName: `Checkout Co ${i}`, approvedById: founder.id, service: service.name },
      });
      world.trackMarketplaceLead(ml.id);
    }

    const result = await marketplaceService.createCheckout(buyer.id, { quantity: 3, service: service.name } as any);

    expect(result.leadCount).toBe(3);
    expect(result.amount).toBe(3 * 10 * 100); // 3 leads * ₹10 * 100 paise
    expect(result.razorpayOrderId).toBeTruthy();

    const claimed = await prisma.marketplaceLead.findMany({ where: { service: service.name, resaleStatus: "PENDING" } });
    expect(claimed).toHaveLength(3);
    expect(claimed.every((l) => l.buyerId === buyer.id)).toBe(true);
  });

  it("delivers a partial quantity when fewer leads are available, and only charges for those", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const uniqueTag = `partial-${Date.now()}`;
    const ml = await prisma.marketplaceLead.create({
      data: { originalLeadId: "orig-partial", companyName: "Partial Co", approvedById: founder.id, industry: uniqueTag },
    });
    world.trackMarketplaceLead(ml.id);

    const result = await marketplaceService.createCheckout(buyer.id, { quantity: 5, industry: uniqueTag } as any);

    expect(result.leadCount).toBe(1);
    expect(result.amount).toBe(10 * 100);
  });

  it("rejects checkout when nothing matches the filters", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });

    await expect(
      marketplaceService.createCheckout(buyer.id, { quantity: 1, industry: `no-such-industry-${Date.now()}` } as any)
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it("uses a lead's override price instead of the tier price when set", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const uniqueTag = `override-${Date.now()}`;
    const ml = await prisma.marketplaceLead.create({
      data: { originalLeadId: "orig-override", companyName: "Override Co", approvedById: founder.id, city: uniqueTag, overridePrice: 45 },
    });
    world.trackMarketplaceLead(ml.id);

    const result = await marketplaceService.createCheckout(buyer.id, { quantity: 1, city: uniqueTag } as any);

    expect(result.amount).toBe(45 * 100);
  });
});
```

Add a new import line to the top of `marketplace.test.ts`: `import { ValidationError } from "@/common/errors/AppError";`

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run marketplace.test -t createCheckout`
Expected: FAIL with "marketplaceService.createCheckout is not a function"

- [ ] **Step 3: Add `createCheckout` to the service**

Add this method to the `MarketplaceService` class:

```ts
  async createCheckout(buyerId: string, input: CheckoutInput) {
    await this.releaseAbandonedCheckouts();

    const where: Prisma.MarketplaceLeadWhereInput = {
      resaleStatus: MarketplaceLeadStatus.LISTED,
      ...filterWhere(input),
    };

    const claimed = await prisma.$transaction(async (tx) => {
      const candidates = await tx.marketplaceLead.findMany({
        where,
        orderBy: { listedAt: "asc" },
        take: input.quantity,
        select: { id: true },
      });
      if (candidates.length === 0) return [];

      const candidateIds = candidates.map((c) => c.id);
      // The WHERE resaleStatus: LISTED re-check here is what makes this race-safe: if a
      // concurrent checkout already flipped one of these rows to PENDING, Postgres's
      // row-level locking means this UPDATE simply won't affect that row, rather than
      // both checkouts claiming the same lead.
      await tx.marketplaceLead.updateMany({
        where: { id: { in: candidateIds }, resaleStatus: MarketplaceLeadStatus.LISTED },
        data: { resaleStatus: MarketplaceLeadStatus.PENDING, buyerId, checkoutStartedAt: new Date() },
      });

      return tx.marketplaceLead.findMany({
        where: { id: { in: candidateIds }, resaleStatus: MarketplaceLeadStatus.PENDING, buyerId },
      });
    });

    if (claimed.length === 0) {
      throw new ValidationError("No leads currently available matching your filters");
    }

    const pricePerLead = priceForQuantity(claimed.length);
    const pricedLeads = claimed.map((lead) => ({
      id: lead.id,
      pricePaid: lead.overridePrice ? Number(lead.overridePrice) : pricePerLead,
    }));
    const totalAmount = pricedLeads.reduce((sum, l) => sum + l.pricePaid, 0);

    await Promise.all(
      pricedLeads.map((lead) =>
        prisma.marketplaceLead.update({ where: { id: lead.id }, data: { pricePaid: lead.pricePaid } })
      )
    );

    const order = await razorpay.orders.create({
      amount: Math.round(totalAmount * 100), // Razorpay expects paise
      currency: "INR",
      receipt: `mkt_${buyerId}_${Date.now()}`,
    });

    await prisma.marketplaceLead.updateMany({
      where: { id: { in: pricedLeads.map((l) => l.id) } },
      data: { gatewayOrderId: order.id },
    });

    return {
      razorpayOrderId: order.id,
      razorpayKeyId: env.razorpayKeyId,
      amount: typeof order.amount === "string" ? parseInt(order.amount, 10) : order.amount,
      currency: "INR",
      leadCount: pricedLeads.length,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run marketplace.test -t createCheckout`
Expected: PASS, 4 tests. (Requires real Razorpay test-mode keys in `server/.env` — see Task 3 Step 3's note. With placeholder keys, `razorpay.orders.create` will reject; sign up for a free Razorpay test account and swap in the real `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` before running this task.)

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/marketplace/marketplace.service.ts server/src/modules/marketplace/marketplace.test.ts
git commit -m "feat: add marketplace checkout with atomic lead claiming and Razorpay order creation"
```

### Task 13: Payment webhook

**Files:**
- Modify: `server/src/modules/marketplace/marketplace.service.ts`
- Modify: `server/src/modules/marketplace/marketplace.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `marketplace.test.ts`:

```ts
import crypto from "crypto";

describe("MarketplaceService.handleWebhook", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  function signedPayload(body: object) {
    const raw = Buffer.from(JSON.stringify(body));
    const signature = crypto.createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!).update(raw).digest("hex");
    return { raw, signature };
  }

  it("marks PENDING leads for the order as SOLD on payment.captured", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const orderId = `order_test_${Date.now()}`;
    const ml = await prisma.marketplaceLead.create({
      data: {
        originalLeadId: "orig-webhook",
        companyName: "Webhook Co",
        approvedById: founder.id,
        resaleStatus: "PENDING",
        buyerId: buyer.id,
        gatewayOrderId: orderId,
        pricePaid: 10,
      },
    });
    world.trackMarketplaceLead(ml.id);

    const { raw, signature } = signedPayload({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_test_1", order_id: orderId } } },
    });

    const result = await marketplaceService.handleWebhook(raw, signature);
    expect(result.processed).toBe(true);

    const after = await prisma.marketplaceLead.findUniqueOrThrow({ where: { id: ml.id } });
    expect(after.resaleStatus).toBe("SOLD");
    expect(after.gatewayPaymentId).toBe("pay_test_1");
    expect(after.exclusiveUntil).not.toBeNull();
    const daysUntilExpiry = (after.exclusiveUntil!.getTime() - after.purchasedAt!.getTime()) / 86_400_000;
    expect(Math.round(daysUntilExpiry)).toBe(60);
  });

  it("is idempotent for a retried webhook on an already-confirmed order", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const orderId = `order_test_dup_${Date.now()}`;
    const ml = await prisma.marketplaceLead.create({
      data: {
        originalLeadId: "orig-webhook-dup",
        companyName: "Webhook Dup Co",
        approvedById: founder.id,
        resaleStatus: "SOLD",
        buyerId: buyer.id,
        gatewayOrderId: orderId,
        gatewayPaymentId: "pay_original",
        purchasedAt: new Date(),
        exclusiveUntil: new Date(Date.now() + 60 * 86_400_000),
      },
    });
    world.trackMarketplaceLead(ml.id);

    const { raw, signature } = signedPayload({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_retry", order_id: orderId } } },
    });

    const result = await marketplaceService.handleWebhook(raw, signature);
    expect(result.alreadyProcessed).toBe(true);

    const after = await prisma.marketplaceLead.findUniqueOrThrow({ where: { id: ml.id } });
    expect(after.gatewayPaymentId).toBe("pay_original"); // untouched
  });

  it("rejects a bad signature", async () => {
    const { raw } = signedPayload({ event: "payment.captured", payload: { payment: { entity: { id: "x", order_id: "y" } } } });
    await expect(marketplaceService.handleWebhook(raw, "not-the-real-signature")).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
```

Add `UnauthorizedError` to the existing error import in `marketplace.test.ts`.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run marketplace.test -t handleWebhook`
Expected: FAIL with "marketplaceService.handleWebhook is not a function"

- [ ] **Step 3: Add `handleWebhook` to the service**

Add `crypto` and `UnauthorizedError` to the imports at the top of `marketplace.service.ts`:

```ts
import crypto from "crypto";
import { UnauthorizedError, ValidationError } from "@/common/errors/AppError";
```

(replacing the existing `import { ValidationError } from "@/common/errors/AppError";` line)

Add this method to the class:

```ts
  async handleWebhook(rawBody: Buffer, signature: string | undefined) {
    const expected = crypto.createHmac("sha256", env.razorpayWebhookSecret).update(rawBody).digest("hex");
    if (!signature || expected !== signature) {
      throw new UnauthorizedError("Invalid webhook signature");
    }

    const payload = JSON.parse(rawBody.toString("utf-8"));
    if (payload.event !== "payment.captured") {
      return { processed: false };
    }

    const orderId: string = payload.payload.payment.entity.order_id;
    const paymentId: string = payload.payload.payment.entity.id;

    const alreadyProcessed = await prisma.marketplaceLead.findFirst({
      where: { gatewayOrderId: orderId, resaleStatus: MarketplaceLeadStatus.SOLD },
    });
    if (alreadyProcessed) {
      return { processed: true, alreadyProcessed: true };
    }

    const now = new Date();
    const exclusiveUntil = new Date(now.getTime() + EXCLUSIVITY_DAYS * 24 * 60 * 60 * 1000);

    const result = await prisma.marketplaceLead.updateMany({
      where: { gatewayOrderId: orderId, resaleStatus: MarketplaceLeadStatus.PENDING },
      data: {
        resaleStatus: MarketplaceLeadStatus.SOLD,
        purchasedAt: now,
        exclusiveUntil,
        gatewayPaymentId: paymentId,
        checkoutStartedAt: null,
      },
    });

    return { processed: true, confirmedCount: result.count };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run marketplace.test -t handleWebhook`
Expected: PASS, 3 tests

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/marketplace/marketplace.service.ts server/src/modules/marketplace/marketplace.test.ts
git commit -m "feat: confirm marketplace purchases via a verified, idempotent Razorpay webhook"
```

### Task 14: Buyer dashboard — purchased leads and CSV export

**Files:**
- Modify: `server/src/modules/marketplace/marketplace.service.ts`
- Modify: `server/src/modules/marketplace/marketplace.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `marketplace.test.ts`:

```ts
describe("MarketplaceService.myPurchases / exportCsv", () => {
  const world = new TestWorld();
  afterAll(() => world.cleanup());

  it("returns only this buyer's SOLD leads", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyerA = await world.buyer({ createdById: founder.id });
    const buyerB = await world.buyer({ createdById: founder.id });

    const mine = await prisma.marketplaceLead.create({
      data: { originalLeadId: "orig-mine", companyName: "Mine Co", approvedById: founder.id, resaleStatus: "SOLD", buyerId: buyerA.id, purchasedAt: new Date() },
    });
    world.trackMarketplaceLead(mine.id);
    const notMine = await prisma.marketplaceLead.create({
      data: { originalLeadId: "orig-notmine", companyName: "Not Mine Co", approvedById: founder.id, resaleStatus: "SOLD", buyerId: buyerB.id, purchasedAt: new Date() },
    });
    world.trackMarketplaceLead(notMine.id);
    const pendingOfMine = await prisma.marketplaceLead.create({
      data: { originalLeadId: "orig-pending", companyName: "Pending Co", approvedById: founder.id, resaleStatus: "PENDING", buyerId: buyerA.id },
    });
    world.trackMarketplaceLead(pendingOfMine.id);

    const result = await marketplaceService.myPurchases(buyerA.id);

    expect(result.map((l) => l.id)).toContain(mine.id);
    expect(result.map((l) => l.id)).not.toContain(notMine.id);
    expect(result.map((l) => l.id)).not.toContain(pendingOfMine.id);
  });

  it("exports purchased leads as CSV", async () => {
    const founder = await world.user({ role: "FOUNDER" });
    const buyer = await world.buyer({ createdById: founder.id });
    const ml = await prisma.marketplaceLead.create({
      data: { originalLeadId: "orig-csv", companyName: "CSV Co", phone: "+911234567890", approvedById: founder.id, resaleStatus: "SOLD", buyerId: buyer.id, purchasedAt: new Date() },
    });
    world.trackMarketplaceLead(ml.id);

    const csv = await marketplaceService.exportCsv(buyer.id);
    expect(csv).toContain("CSV Co");
    expect(csv).toContain("+911234567890");

    const auditRow = await prisma.auditLog.findFirst({
      where: { entityType: "MarketplaceExport", entityId: buyer.id },
      orderBy: { timestamp: "desc" },
    });
    expect(auditRow).not.toBeNull();
    expect(auditRow!.action).toBe("EXPORT");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd server && npx vitest run marketplace.test -t "myPurchases / exportCsv"`
Expected: FAIL with "marketplaceService.myPurchases is not a function"

- [ ] **Step 3: Add the methods**

Add to the `MarketplaceService` class:

```ts
  async myPurchases(buyerId: string) {
    return prisma.marketplaceLead.findMany({
      where: { buyerId, resaleStatus: MarketplaceLeadStatus.SOLD },
      orderBy: { purchasedAt: "desc" },
    });
  }

  async exportCsv(buyerId: string) {
    const leads = await this.myPurchases(buyerId);

    // Buyers aren't Users, so this can't carry an actorId the way staff actions do —
    // entityType/entityId (Buyer's own id) is enough to answer "who exported, when" on
    // the same AuditLog table rather than adding a parallel buyer-specific log.
    await prisma.auditLog.create({
      data: { actorId: null, action: "EXPORT", entityType: "MarketplaceExport", entityId: buyerId },
    });

    return leadsToCsv(
      leads.map((l) => ({
        companyName: l.companyName,
        contactPerson: l.contactPerson,
        phone: l.phone,
        email: l.email,
        industry: l.industry,
        city: l.city,
        state: l.state,
        service: l.service,
        pricePaid: l.pricePaid?.toString(),
        purchasedAt: l.purchasedAt,
        exclusiveUntil: l.exclusiveUntil,
      }))
    );
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd server && npx vitest run marketplace.test`
Expected: PASS, all tests in the file

- [ ] **Step 5: Commit**

```bash
git add server/src/modules/marketplace/marketplace.service.ts server/src/modules/marketplace/marketplace.test.ts
git commit -m "feat: add buyer purchase dashboard list and CSV export"
```

### Task 15: Marketplace controller and app wiring

**Files:**
- Create: `server/src/modules/marketplace/marketplace.controller.ts`
- Modify: `server/src/app.ts`

- [ ] **Step 1: Write the controller**

```ts
import { Router } from "express";
import { asyncHandler } from "@/common/middleware/asyncHandler";
import { ValidationError } from "@/common/errors/AppError";
import { requireBuyerAuth } from "@/common/middleware/buyerAuth";
import { marketplaceService } from "./marketplace.service";
import { checkoutSchema, marketplaceSearchQuerySchema } from "./marketplace.schemas";

export const marketplaceRouter = Router();

marketplaceRouter.get(
  "/leads/search",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    const parsed = marketplaceSearchQuerySchema.safeParse(req.query);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.json(await marketplaceService.search(parsed.data));
  })
);

marketplaceRouter.post(
  "/checkout",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    const parsed = checkoutSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError(parsed.error.flatten());
    res.status(201).json(await marketplaceService.createCheckout(req.buyer!.buyerId, parsed.data));
  })
);

marketplaceRouter.get(
  "/my-leads",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    res.json(await marketplaceService.myPurchases(req.buyer!.buyerId));
  })
);

marketplaceRouter.get(
  "/my-leads/export",
  requireBuyerAuth,
  asyncHandler(async (req, res) => {
    const csv = await marketplaceService.exportCsv(req.buyer!.buyerId);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=my-leads.csv");
    res.send(csv);
  })
);

// Razorpay calls this directly — authenticated via HMAC signature verification inside
// handleWebhook, not requireBuyerAuth (there's no buyer JWT on a server-to-server call).
marketplaceRouter.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const rawBody = (req as unknown as { rawBody: Buffer }).rawBody;
    const result = await marketplaceService.handleWebhook(rawBody, signature);
    res.json(result);
  })
);
```

- [ ] **Step 2: Wire CORS multi-origin, raw-body capture, and mount the new routers**

Replace the full contents of `server/src/app.ts`:

```ts
import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { env } from "@/common/env";
import { errorHandler } from "@/common/middleware/errorHandler";
import { createLookupRouter } from "@/common/lookupModule";
import { authRouter } from "@/modules/auth/auth.controller";
import { usersRouter } from "@/modules/users/users.controller";
import { leadsRouter } from "@/modules/leads/leads.controller";
import { assignmentRulesRouter } from "@/modules/assignmentRules/assignmentRules.controller";
import { analyticsRouter } from "@/modules/analytics/analytics.controller";
import { resourcesRouter } from "@/modules/resources/resources.controller";
import { leadRequestsRouter } from "@/modules/leadRequests/leadRequests.controller";
import { attendanceRouter } from "@/modules/attendance/attendance.controller";
import { buyerAuthRouter } from "@/modules/buyerAuth/buyerAuth.controller";
import { buyersRouter } from "@/modules/buyers/buyers.controller";
import { marketplaceRouter } from "@/modules/marketplace/marketplace.controller";

export function createApp() {
  const app = express();

  app.use(helmet());
  app.use(cors({ origin: env.corsOrigins, credentials: true }));
  app.use(
    express.json({
      limit: "5mb",
      // Captures the raw request body alongside the parsed one, so the Razorpay webhook
      // handler can verify its HMAC signature against the exact bytes Razorpay signed —
      // signature verification breaks if it runs against a re-serialized JSON object
      // instead of the original wire bytes.
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody?: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      // Per-IP, not global — was fine for a handful of test users, but an office where
      // several reps share one public IP could realistically stack heartbeats (60s) +
      // alert polling (60s) + normal CRUD across multiple people against the same budget.
      // Raised for headroom now that the team's scaling to ~100 people.
      max: 2000,
      standardHeaders: true,
      legacyHeaders: false,
    })
  );

  app.get("/health", (_req, res) => res.json({ status: "ok" }));

  app.use("/api/v1/auth", authRouter);
  app.use("/api/v1/users", usersRouter);
  app.use("/api/v1/leads", leadsRouter);
  app.use("/api/v1/teams", createLookupRouter("team"));
  app.use("/api/v1/services", createLookupRouter("service"));
  app.use("/api/v1/lead-sources", createLookupRouter("leadSource"));
  app.use("/api/v1/assignment-rules", assignmentRulesRouter);
  app.use("/api/v1/analytics", analyticsRouter);
  app.use("/api/v1/resources", resourcesRouter);
  app.use("/api/v1/lead-requests", leadRequestsRouter);
  app.use("/api/v1/attendance", attendanceRouter);
  app.use("/api/v1/buyer-auth", buyerAuthRouter);
  app.use("/api/v1/buyers", buyersRouter);
  app.use("/api/v1/marketplace", marketplaceRouter);

  app.use(errorHandler);

  return app;
}
```

- [ ] **Step 3: Run the full backend test suite**

Run: `cd server && npm test`
Expected: PASS, all tests (existing + new)

- [ ] **Step 4: Commit**

```bash
git add server/src/modules/marketplace/marketplace.controller.ts server/src/app.ts
git commit -m "feat: wire buyer auth, buyer admin, and marketplace routers into the app"
```

---

## Phase 7 — Marketplace Frontend App

### Task 16: Scaffold `marketplace-client/`

**Files:**
- Create: `marketplace-client/package.json`
- Create: `marketplace-client/vite.config.ts`
- Create: `marketplace-client/tsconfig.json`
- Create: `marketplace-client/tsconfig.app.json`
- Create: `marketplace-client/tsconfig.node.json`
- Create: `marketplace-client/tailwind.config.js`
- Create: `marketplace-client/postcss.config.js`
- Create: `marketplace-client/index.html`
- Create: `marketplace-client/.env.example`
- Create: `marketplace-client/src/index.css`
- Create: `marketplace-client/src/main.tsx`

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "marketplace-client",
  "private": true,
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "lint": "oxlint",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^19.2.7",
    "react-dom": "^19.2.7",
    "react-router-dom": "^6.26.2",
    "@tanstack/react-query": "^5.56.2",
    "axios": "^1.7.7",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.2"
  },
  "devDependencies": {
    "@types/node": "^24.13.2",
    "@types/react": "^19.2.17",
    "@types/react-dom": "^19.2.3",
    "@vitejs/plugin-react": "^4.3.1",
    "oxlint": "^1.71.0",
    "typescript": "~5.6.2",
    "vite": "^5.4.6",
    "tailwindcss": "^3.4.11",
    "postcss": "^8.4.47",
    "autoprefixer": "^10.4.20"
  }
}
```

- [ ] **Step 2: Write `vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 5174,
  },
});
```

- [ ] **Step 3: Write the TypeScript configs**

`marketplace-client/tsconfig.json`:

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`marketplace-client/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "es2023",
    "lib": ["ES2023", "DOM"],
    "module": "esnext",
    "types": ["vite/client"],
    "allowArbitraryExtensions": true,
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": false,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "paths": {
      "@/*": ["./src/*"]
    },
    "strict": true,
    "noUnusedLocals": false,
    "noUnusedParameters": false,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

`marketplace-client/tsconfig.node.json`:

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: Write the Tailwind/PostCSS config and `index.html`**

`marketplace-client/tailwind.config.js`:

```js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: "hsl(var(--card))",
        border: "hsl(var(--border))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
      },
      borderRadius: {
        lg: "0.75rem",
        md: "0.5rem",
        sm: "0.375rem",
      },
    },
  },
  plugins: [],
};
```

`marketplace-client/postcss.config.js`:

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

`marketplace-client/index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Naraway Lead Marketplace</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`marketplace-client/.env.example`:

```
VITE_API_URL=http://localhost:4000/api/v1
VITE_RAZORPAY_KEY_ID=rzp_test_placeholder
```

- [ ] **Step 5: Write `src/index.css` and `src/main.tsx`**

`marketplace-client/src/index.css`:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 210 24% 98%;
    --foreground: 222 28% 14%;
    --card: 0 0% 100%;
    --border: 214 20% 90%;
    --muted: 210 23% 95%;
    --muted-foreground: 218 12% 42%;
    --accent: 174 64% 34%;
    --accent-foreground: 0 0% 100%;
    --primary: 174 64% 34%;
    --primary-foreground: 0 0% 100%;
    --destructive: 0 65% 50%;
    --destructive-foreground: 0 0% 100%;
  }

  * {
    @apply border-border;
  }

  body {
    @apply bg-background text-foreground antialiased;
    font-family: system-ui, "Segoe UI", Roboto, sans-serif;
  }
}
```

`marketplace-client/src/main.tsx`:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App.tsx";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

- [ ] **Step 6: Install dependencies**

Run: `cd marketplace-client && npm install`
Expected: `node_modules/` created, no errors

- [ ] **Step 7: Commit**

```bash
git add marketplace-client/package.json marketplace-client/package-lock.json marketplace-client/vite.config.ts marketplace-client/tsconfig*.json marketplace-client/tailwind.config.js marketplace-client/postcss.config.js marketplace-client/index.html marketplace-client/.env.example marketplace-client/src/index.css marketplace-client/src/main.tsx
git commit -m "chore: scaffold marketplace-client Vite/React/Tailwind app"
```

### Task 17: API client, types, buyer auth

**Files:**
- Create: `marketplace-client/src/api/client.ts`
- Create: `marketplace-client/src/api/types.ts`
- Create: `marketplace-client/src/api/buyerAuth.ts`
- Create: `marketplace-client/src/lib/auth.tsx`
- Create: `marketplace-client/src/components/ProtectedRoute.tsx`

- [ ] **Step 1: Write the API client**

```ts
import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? "http://localhost:4000/api/v1",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("buyer_token");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem("buyer_token");
      if (!window.location.pathname.startsWith("/login")) {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);
```

- [ ] **Step 2: Write types**

```ts
export interface Buyer {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
}

export interface MarketplaceFilters {
  service?: string;
  industry?: string;
  city?: string;
  state?: string;
  lostReason?: string;
  keyword?: string;
  dealValueMin?: number;
  dealValueMax?: number;
  dateListedFrom?: string;
  dateListedTo?: string;
}

export interface SearchResult {
  availableCount: number;
  requestedQuantity: number;
  deliverableQuantity: number;
  pricePerLead: number;
  estimatedTotal: number;
}

export interface CheckoutResult {
  razorpayOrderId: string;
  razorpayKeyId: string;
  amount: number;
  currency: string;
  leadCount: number;
}

export interface PurchasedLead {
  id: string;
  companyName: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  industry?: string | null;
  city?: string | null;
  state?: string | null;
  service?: string | null;
  pricePaid?: string | null;
  purchasedAt: string;
  exclusiveUntil: string;
}
```

- [ ] **Step 3: Write buyer auth API and provider**

`marketplace-client/src/api/buyerAuth.ts`:

```ts
import { api } from "./client";
import { Buyer } from "./types";

export async function login(email: string, password: string) {
  const { data } = await api.post<{ token: string; buyer: Buyer }>("/buyer-auth/login", { email, password });
  return data;
}

export async function fetchMe() {
  const { data } = await api.get<Buyer>("/buyer-auth/me");
  return data;
}
```

`marketplace-client/src/lib/auth.tsx`:

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { fetchMe, login as loginRequest } from "@/api/buyerAuth";
import { Buyer } from "@/api/types";

interface AuthContextValue {
  buyer: Buyer | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [buyer, setBuyer] = useState<Buyer | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("buyer_token");
    if (!token) {
      setLoading(false);
      return;
    }
    fetchMe()
      .then(setBuyer)
      .catch(() => localStorage.removeItem("buyer_token"))
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const result = await loginRequest(email, password);
    localStorage.setItem("buyer_token", result.token);
    setBuyer(result.buyer);
  }

  function logout() {
    localStorage.removeItem("buyer_token");
    setBuyer(null);
  }

  return <AuthContext.Provider value={{ buyer, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
```

`marketplace-client/src/components/ProtectedRoute.tsx`:

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function ProtectedRoute() {
  const { buyer, loading } = useAuth();
  if (loading) return null;
  if (!buyer) return <Navigate to="/login" replace />;
  return <Outlet />;
}
```

- [ ] **Step 4: Commit**

```bash
git add marketplace-client/src/api marketplace-client/src/lib marketplace-client/src/components
git commit -m "feat: add marketplace-client API layer and buyer auth"
```

### Task 18: Marketplace API (search/checkout/purchases)

**Files:**
- Create: `marketplace-client/src/api/marketplace.ts`

- [ ] **Step 1: Write the API functions**

```ts
import { api } from "./client";
import { CheckoutResult, MarketplaceFilters, PurchasedLead, SearchResult } from "./types";

export async function searchLeads(filters: MarketplaceFilters, quantity: number) {
  const { data } = await api.get<SearchResult>("/marketplace/leads/search", { params: { ...filters, quantity } });
  return data;
}

export async function checkout(filters: MarketplaceFilters, quantity: number) {
  const { data } = await api.post<CheckoutResult>("/marketplace/checkout", { ...filters, quantity });
  return data;
}

export async function myPurchases() {
  const { data } = await api.get<PurchasedLead[]>("/marketplace/my-leads");
  return data;
}

export async function exportPurchasesCsv() {
  const response = await api.get("/marketplace/my-leads/export", { responseType: "blob" });
  const url = URL.createObjectURL(response.data);
  const link = document.createElement("a");
  link.href = url;
  link.download = "my-leads.csv";
  link.click();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Commit**

```bash
git add marketplace-client/src/api/marketplace.ts
git commit -m "feat: add marketplace-client search/checkout/purchases API"
```

### Task 19: Login page

**Files:**
- Create: `marketplace-client/src/pages/Login.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { buyer, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (buyer) return <Navigate to="/catalog" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/catalog");
    } catch {
      setError("Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Naraway Lead Marketplace</h1>
        <p className="mb-5 text-sm text-muted-foreground">Sign in with the account Naraway created for you.</p>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add marketplace-client/src/pages/Login.tsx
git commit -m "feat: add marketplace buyer login page"
```

### Task 20: Catalog page (filters, live count/price, checkout)

**Files:**
- Create: `marketplace-client/src/pages/Catalog.tsx`

- [ ] **Step 1: Add the Razorpay checkout script to `index.html`**

In `marketplace-client/index.html`, add this line inside `<head>`, after the `<title>` tag:

```html
    <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
```

- [ ] **Step 2: Write the page**

```tsx
import { FormEvent, useState } from "react";
import { checkout, searchLeads } from "@/api/marketplace";
import { MarketplaceFilters, SearchResult } from "@/api/types";

declare global {
  interface Window {
    Razorpay: new (options: Record<string, unknown>) => { open: () => void };
  }
}

const emptyFilters: MarketplaceFilters = {};

export function CatalogPage() {
  const [filters, setFilters] = useState<MarketplaceFilters>(emptyFilters);
  const [quantity, setQuantity] = useState(1);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [purchaseComplete, setPurchaseComplete] = useState(false);

  async function runSearch(e?: FormEvent) {
    e?.preventDefault();
    setLoading(true);
    setCheckoutError("");
    try {
      const data = await searchLeads(filters, quantity);
      setResult(data);
    } finally {
      setLoading(false);
    }
  }

  function updateFilter<K extends keyof MarketplaceFilters>(key: K, value: string) {
    setFilters((prev) => ({ ...prev, [key]: value || undefined }));
  }

  async function startCheckout() {
    setCheckoutError("");
    try {
      const order = await checkout(filters, quantity);
      const razorpay = new window.Razorpay({
        key: order.razorpayKeyId,
        order_id: order.razorpayOrderId,
        amount: order.amount,
        currency: order.currency,
        name: "Naraway Lead Marketplace",
        description: `${order.leadCount} lead${order.leadCount === 1 ? "" : "s"}`,
        handler: () => {
          setPurchaseComplete(true);
          setResult(null);
        },
      });
      razorpay.open();
    } catch {
      setCheckoutError("Couldn't start checkout — please try again.");
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold">Browse Leads</h1>

      {purchaseComplete && (
        <div className="mb-4 rounded-md border border-primary/30 bg-primary/10 p-3 text-sm text-primary">
          Purchase complete — check your dashboard for the leads.
        </div>
      )}

      <form onSubmit={runSearch} className="mb-6 grid grid-cols-1 gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Service</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("service", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Industry</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("industry", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">City</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("city", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">State</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("state", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Lost Reason</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("lostReason", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Keyword</label>
          <input className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("keyword", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal Value Min</label>
          <input type="number" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dealValueMin", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Deal Value Max</label>
          <input type="number" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dealValueMax", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Listed From</label>
          <input type="date" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dateListedFrom", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Listed To</label>
          <input type="date" className="w-full rounded-md border border-border px-3 py-1.5 text-sm" onChange={(e) => updateFilter("dateListedTo", e.target.value)} />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">How many leads?</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value, 10) || 1))}
            className="w-full rounded-md border border-border px-3 py-1.5 text-sm"
          />
        </div>
        <div className="flex items-end">
          <button type="submit" disabled={loading} className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {loading ? "Checking..." : "Check availability"}
          </button>
        </div>
      </form>

      {result && (
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm">
            <strong>{result.availableCount}</strong> leads match your filters.
          </p>
          {result.deliverableQuantity > 0 ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                You'll get <strong>{result.deliverableQuantity}</strong> lead{result.deliverableQuantity === 1 ? "" : "s"} for{" "}
                <strong>₹{result.estimatedTotal}</strong>.
              </p>
              {checkoutError && <p className="mt-2 text-sm text-destructive">{checkoutError}</p>}
              <button onClick={startCheckout} className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
                Buy now
              </button>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">No leads currently available matching these filters.</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add marketplace-client/index.html marketplace-client/src/pages/Catalog.tsx
git commit -m "feat: add marketplace catalog page with live count, price, and Razorpay checkout"
```

### Task 21: Dashboard page

**Files:**
- Create: `marketplace-client/src/pages/Dashboard.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { useEffect, useState } from "react";
import { exportPurchasesCsv, myPurchases } from "@/api/marketplace";
import { PurchasedLead } from "@/api/types";

export function DashboardPage() {
  const [leads, setLeads] = useState<PurchasedLead[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    myPurchases()
      .then(setLeads)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">My Leads</h1>
        {leads.length > 0 && (
          <button onClick={() => exportPurchasesCsv()} className="rounded-md border border-border px-3 py-1.5 text-sm font-medium">
            Download CSV
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading...</p>
      ) : leads.length === 0 ? (
        <p className="text-sm text-muted-foreground">You haven't purchased any leads yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Company</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Phone</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">Exclusive Until</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((lead) => (
                <tr key={lead.id} className="border-t border-border">
                  <td className="px-3 py-2">{lead.companyName}</td>
                  <td className="px-3 py-2">{lead.contactPerson ?? "-"}</td>
                  <td className="px-3 py-2">{lead.phone ?? "-"}</td>
                  <td className="px-3 py-2">{lead.email ?? "-"}</td>
                  <td className="px-3 py-2">{new Date(lead.exclusiveUntil).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add marketplace-client/src/pages/Dashboard.tsx
git commit -m "feat: add marketplace buyer dashboard with CSV export"
```

### Task 22: App routing and manual verification

**Files:**
- Create: `marketplace-client/src/App.tsx`

- [ ] **Step 1: Write the app shell**

```tsx
import { BrowserRouter, Navigate, Route, Routes, Link } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider, useAuth } from "@/lib/auth";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { LoginPage } from "@/pages/Login";
import { CatalogPage } from "@/pages/Catalog";
import { DashboardPage } from "@/pages/Dashboard";

const queryClient = new QueryClient();

function TopNav() {
  const { buyer, logout } = useAuth();
  if (!buyer) return null;
  return (
    <nav className="flex items-center justify-between border-b border-border bg-card px-4 py-3 sm:px-6">
      <div className="flex gap-4 text-sm font-medium">
        <Link to="/catalog">Browse</Link>
        <Link to="/dashboard">My Leads</Link>
      </div>
      <button onClick={logout} className="text-sm text-muted-foreground">
        Sign out
      </button>
    </nav>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <TopNav />
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Navigate to="/catalog" replace />} />
              <Route path="/catalog" element={<CatalogPage />} />
              <Route path="/dashboard" element={<DashboardPage />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
```

- [ ] **Step 2: Verify it builds**

Run: `cd marketplace-client && npx tsc -b`
Expected: no errors

- [ ] **Step 3: Manual verification — run the dev server**

Run: `cd marketplace-client && npm run dev` (leave running; also start `cd server && npm run dev` in another terminal)

In a browser, visit `http://localhost:5174`:
- Confirm it redirects to `/login`.
- Use a buyer account created via `POST /api/v1/buyers` (Task 5/Task 24) to log in.
- Confirm `/catalog` loads, filters submit, and the live count/price appears.
- Confirm `/dashboard` loads (empty state until a purchase exists).

Expected: all four checks pass. Stop the dev servers when done (Ctrl+C).

- [ ] **Step 4: Commit**

```bash
git add marketplace-client/src/App.tsx
git commit -m "feat: wire marketplace-client routing"
```

---

## Phase 8 — Sales OS Integration

### Task 23: Buyer admin API on the Sales OS client

**Files:**
- Create: `client/src/api/buyers.ts`
- Modify: `client/src/api/leads.ts`

- [ ] **Step 1: Write the buyers API**

```ts
import { api } from "./client";

export interface Buyer {
  id: string;
  name: string;
  company?: string | null;
  email: string;
  phone?: string | null;
  isActive: boolean;
  createdAt: string;
}

export async function listBuyers() {
  const { data } = await api.get<Buyer[]>("/buyers");
  return data;
}

export async function createBuyer(input: { name: string; company?: string; email: string; phone?: string }) {
  const { data } = await api.post<{ buyer: Buyer; tempPassword: string }>("/buyers", input);
  return data;
}
```

- [ ] **Step 2: Add `releaseLeadToMarketplace` to the leads API**

In `client/src/api/leads.ts`, add this function after `setLeadPinned` (after line 87):

```ts

/** Founder/Manager only — copies a Lost lead into the marketplace for buyers to purchase. */
export async function releaseLeadToMarketplace(id: string, overridePrice?: number) {
  const { data } = await api.post(`/leads/${id}/release-to-marketplace`, { overridePrice });
  return data;
}
```

- [ ] **Step 3: Commit**

```bash
git add client/src/api/buyers.ts client/src/api/leads.ts
git commit -m "feat: add Sales OS API bindings for buyer admin and lead release"
```

### Task 24: "List on Marketplace" action on Lead Detail

**Files:**
- Modify: `client/src/pages/LeadDetail.tsx`

- [ ] **Step 1: Add the import and mutation**

In `client/src/pages/LeadDetail.tsx`, update the import line at the top (line 4) to add `releaseLeadToMarketplace`:

```ts
import { addLeadComment, assignLead, deleteLead, getLead, getLeadActivities, getLeadComments, logCall, releaseLeadToMarketplace, routeLeadToService, setLeadPinned, updateLead, CALL_OUTCOMES, CallOutcome } from "@/api/leads";
```

Add `useState` import for the modal state — `useState` is already imported (line 1), so no change needed there.

Add this state and mutation inside `LeadDetailPage`, near the other mutations (after the `routeMutation` definition, search for where `routeLeadToService` is used as `mutationFn` around line 70 and add after that block):

```ts
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [overridePrice, setOverridePrice] = useState("");
  const releaseMutation = useMutation({
    mutationFn: () => releaseLeadToMarketplace(id!, overridePrice ? Number(overridePrice) : undefined),
    onSuccess: () => {
      showToast("Lead released to the marketplace", "success");
      setShowReleaseModal(false);
      qc.invalidateQueries({ queryKey: ["lead", id] });
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), "error"),
  });
```

- [ ] **Step 2: Add the button and modal to the render output**

Replace this block (lines 173-175):

```tsx
      {(lead.status === "WON" || lead.status === "LOST") && (
        <CrossSellCard lead={lead} services={services} onOffer={(serviceId) => routeMutation.mutate(serviceId)} isPending={routeMutation.isPending} />
      )}
```

with:

```tsx
      {(lead.status === "WON" || lead.status === "LOST") && (
        <CrossSellCard lead={lead} services={services} onOffer={(serviceId) => routeMutation.mutate(serviceId)} isPending={routeMutation.isPending} />
      )}

      {lead.status === "LOST" && canManage && (
        <Card className="p-4 sm:p-5">
          {lead.releasedToMarketplaceAt ? (
            <p className="text-sm text-muted-foreground">
              Released to the marketplace on {new Date(lead.releasedToMarketplaceAt).toLocaleDateString()}.
            </p>
          ) : (
            <>
              <h2 className="mb-1 text-sm font-semibold">Lead Resale Marketplace</h2>
              <p className="mb-3 text-sm text-muted-foreground">
                Release this Lost lead for external buyers to purchase.
              </p>
              <Button variant="secondary" onClick={() => setShowReleaseModal(true)}>
                List on Marketplace
              </Button>
            </>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={showReleaseModal}
        title="List on Marketplace"
        description="This copies the lead's details to the buyer-facing marketplace. It'll be priced automatically by the standard volume rate card unless you set an override below."
        confirmLabel={releaseMutation.isPending ? "Listing..." : "List Lead"}
        onConfirm={() => releaseMutation.mutate()}
        onCancel={() => setShowReleaseModal(false)}
      >
        <div className="mt-3">
          <Label>Override price per lead (optional, ₹)</Label>
          <Input type="number" min="0" value={overridePrice} onChange={(e) => setOverridePrice(e.target.value)} placeholder="Leave blank to use standard pricing" />
        </div>
      </ConfirmDialog>
```

Note: `Lead.releasedToMarketplaceAt` needs to be added to the `Lead` type — see Step 3.

- [ ] **Step 3: Add the field to the client-side `Lead` type**

In `client/src/api/types.ts`, add this field to the `Lead` interface (after `ownerPinnedAt`, around line 75):

```ts
  releasedToMarketplaceAt?: string | null;
```

- [ ] **Step 4: Verify it builds**

Run: `cd client && npx tsc -b`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/LeadDetail.tsx client/src/api/types.ts
git commit -m "feat: add List on Marketplace action to Lead Detail"
```

### Task 25: Buyers admin page in the Sales OS

**Files:**
- Create: `client/src/pages/Buyers.tsx`
- Modify: `client/src/App.tsx`
- Modify: `client/src/components/Layout.tsx`

- [ ] **Step 1: Write the page**

```tsx
import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBuyer, listBuyers } from "@/api/buyers";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/errors";

export function BuyersPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { data: buyers, isLoading } = useQuery({ queryKey: ["buyers"], queryFn: listBuyers });
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createBuyer({ name, company: company || undefined, email, phone: phone || undefined }),
    onSuccess: (result) => {
      showToast("Buyer account created", "success");
      setLastTempPassword(result.tempPassword);
      setName("");
      setCompany("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["buyers"] });
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold">Marketplace Buyers</h1>

      <Card className="mb-6 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">Create Buyer Account</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Buyer"}
            </Button>
          </div>
        </form>
        {lastTempPassword && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm">
            Temporary password (share this with the buyer, it won't be shown again): <strong>{lastTempPassword}</strong>
          </p>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">All Buyers</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Name</th>
                  <th className="py-1.5 pr-3">Company</th>
                  <th className="py-1.5 pr-3">Email</th>
                  <th className="py-1.5 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(buyers ?? []).map((buyer) => (
                  <tr key={buyer.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{buyer.name}</td>
                    <td className="py-1.5 pr-3">{buyer.company ?? "-"}</td>
                    <td className="py-1.5 pr-3">{buyer.email}</td>
                    <td className="py-1.5 pr-3">{buyer.isActive ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Add the route**

In `client/src/App.tsx`, add the import (after `SettingsPage`, line 15):

```tsx
import { BuyersPage } from "@/pages/Buyers";
```

Add the route inside the `FOUNDER`/`MANAGER`-only block that already wraps `/users` (lines 44-47), as a sibling route within the same `ProtectedRoute`:

```tsx
                <Route element={<ProtectedRoute roles={["FOUNDER", "MANAGER"]} />}>
                  <Route path="/users" element={<UsersPage />} />
                  <Route path="/users/:id" element={<MemberProfilePage />} />
                  <Route path="/buyers" element={<BuyersPage />} />
                </Route>
```

- [ ] **Step 3: Add a nav link**

Read `client/src/components/Layout.tsx` to find the `links` array (role-filtered nav items) and add an entry for Buyers alongside the existing Founder/Manager-only links (e.g. Users, Dashboard), pointing at `/buyers`, `roles: ["FOUNDER", "MANAGER"]`, matching the existing entries' shape exactly.

- [ ] **Step 4: Verify it builds**

Run: `cd client && npx tsc -b`
Expected: no errors

- [ ] **Step 5: Commit**

```bash
git add client/src/pages/Buyers.tsx client/src/App.tsx client/src/components/Layout.tsx
git commit -m "feat: add Buyers admin page to the Sales OS"
```

---

## Phase 9 — Deployment

### Task 26: Render setup and environment checklist

**Files:** None (manual dashboard configuration — this repo has no `render.yaml`, so the existing two services were set up by hand in the Render dashboard, and this new one follows the same pattern).

- [ ] **Step 1: Create the new Render static site**

In the Render dashboard: New → Static Site → connect the same GitHub repo. Set:
- **Root Directory:** `marketplace-client`
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `marketplace-client/dist`
- **Environment Variables:** `VITE_API_URL` = the existing backend service's public URL + `/api/v1` (e.g. `https://naraway-sales-os-server.onrender.com/api/v1`)

- [ ] **Step 2: Update the backend service's environment variables**

On the existing `server` Render service, add/update:
- `CORS_ORIGIN` — change to a comma-separated list including both frontend URLs, e.g. `https://naraway-sales-os.onrender.com,https://naraway-lead-marketplace.onrender.com`
- `BUYER_JWT_SECRET` — a long random string, different from `JWT_SECRET`
- `BUYER_JWT_EXPIRES_IN` — `8h`
- `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` — from the Razorpay dashboard (live keys once ready to accept real payments; test keys until then)
- `RAZORPAY_WEBHOOK_SECRET` — set when configuring the webhook in Step 3, then paste back here

- [ ] **Step 3: Configure the Razorpay webhook**

In the Razorpay dashboard (Settings → Webhooks): add a webhook pointing at `https://<your-backend-service>.onrender.com/api/v1/marketplace/webhook`, subscribed to the `payment.captured` event. Razorpay generates a webhook secret at this point — copy it into the backend's `RAZORPAY_WEBHOOK_SECRET` env var (Step 2).

- [ ] **Step 4: Redeploy and smoke-test**

Trigger a manual deploy of the `server` service (to pick up the new env vars) and the new marketplace static site. Then:
- Visit the new marketplace URL, confirm it loads and redirects to `/login`.
- From the Sales OS, create a test buyer account (Buyers page) and confirm login works on the marketplace site.
- Release a test Lost lead to the marketplace and confirm it appears in a catalog search.

Expected: all three checks pass.
