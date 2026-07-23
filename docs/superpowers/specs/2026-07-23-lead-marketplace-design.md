# Lead Resale Marketplace — Design

Date: 2026-07-23
Status: Approved for planning

## 1. Purpose

Naraway's Sales OS discards leads that are marked Lost — not a fit, budget, timing, went with a
competitor, etc. This project turns a curated subset of those discarded leads into a second
revenue stream: a separate, buyer-facing marketplace where external buyers pay to unlock leads
Naraway has already decided not to pursue itself.

This is explicitly **not** a rebuild of the Sales OS's lead-management UI. It's a small, isolated
storefront: browse by filter, see a live count and price, buy, download. The internal Sales OS
gains one new capability (Founder/Manager can release a Lost lead to the marketplace); everything
else is new and additive.

## 2. Research basis

Before finalizing this design, we looked at how comparable platforms operate and priced this
accordingly:

- **HomeAdvisor/Angi's shared-lead model** (the same lead sold to 3–5 competing buyers
  simultaneously) is widely criticized — a $100 shared lead costs ~$1,700+ per closed deal vs.
  ~$280 for a $70 exclusive lead, because buyers race each other to respond first rather than
  compete on quality. **This design deliberately avoids that failure mode**: every lead sold here
  is exclusive to exactly one buyer.
- **Subscription-plus-per-lead stacking** (charging a base subscription *and* per-lead fees) is a
  recurring buyer complaint. This design is **per-lead only**, no subscription.
- **Thumbtack's "review before you commit" pattern** — buyers see enough detail to self-select
  before paying — is reflected in the filter-and-teaser browsing flow below.
- Because what's being sold here is Naraway's own *rejected* leads (not fresh, qualified leads
  like the platforms above), pricing is deliberately set far below typical exclusive-lead market
  rates ($15–$500/lead) — this is closer to bulk contact-data resale than premium lead generation.

## 3. Roles & Access

- **Buyers** are a completely separate identity from Sales OS staff. There is no shared login, no
  shared session, and no shared UI. A buyer account can never see or reach anything in the
  internal Sales OS, and no buyer-facing code path can query internal Sales OS data (see §5).
- **Buyer accounts are created only by Founder/Manager** from inside the Sales OS, after vetting a
  buyer offline. There is no public self-service signup on the marketplace.
- **Single-session enforcement**: each `Buyer` record tracks one active session token. Logging in
  from a new device immediately invalidates whatever session was active before it — so a shared
  password doesn't grant simultaneous shared access, it just repeatedly logs the other person out.
- **Releasing a lead to the marketplace** is Founder/Manager only, from the existing Lead Detail
  page in the Sales OS (new action: "List on Marketplace"). Executives have no visibility into or
  control over marketplace listing.

## 4. Tech Stack

Reuses the existing stack and hosting model:

- Backend: same Node/Express/TypeScript service, same Prisma client, same Supabase Postgres
  database — new tables, new routers, no new infrastructure.
- New routes under `/api/v1/marketplace/*` (buyer-facing catalog/purchase/dashboard) and
  `/api/v1/buyer-auth/*` (buyer login), mounted on the same Express app as the existing `/api/v1/*`
  routes.
- Frontend: a new, separate React + TypeScript + TailwindCSS app (own Vite project), deployed as
  its own Render static site with its own URL. It never imports or shares code with the internal
  `client/` app beyond copy-pasted low-level primitives if convenient (e.g. a button component) —
  no shared build, no shared deploy.
- Payments: **Razorpay** (hosted checkout — UPI + cards, India-appropriate). Card/UPI details are
  entered on Razorpay's hosted page, never on Naraway's servers.

## 5. Data Model

Two new tables, deliberately isolated from the internal `Lead`/`User` tables:

**`Buyer`**
- `id`, `name`, `company`, `email` (unique), `phone`, `passwordHash`
- `currentSessionToken` — the single active session; a new login overwrites this and the old
  token stops authenticating
- `createdById` (FK to internal `User` — which Founder/Manager created this account)
- `isActive`, `createdAt`

**`MarketplaceLead`**
- `id`, `originalLeadId` (FK to the internal `Lead` — for Naraway's own audit trail only; no
  buyer-facing code reads this field or joins against `Lead` through it)
- Copied teaser/detail fields: `companyName`, `contactPerson`, `phone`, `email`, `industry`,
  `city`, `state`, `service` (name, not FK — copied as a string so this table never joins against
  internal lookup tables either), `lostReason`, `expectedDealValue`
- `resaleStatus`: `LISTED` | `SOLD`
- `approvedById` (FK to internal `User`), `listedAt`
- `buyerId` (FK to `Buyer`, null until sold), `pricePaid`, `purchasedAt`, `exclusiveUntil`
  (`purchasedAt` + 60 days — display/audit field only, not used to gate re-listing since expired
  leads are never re-listed; see §7)
- `gatewayOrderId`, `gatewayPaymentId`, `paymentStatus` (`PENDING` | `PAID` | `FAILED`) — a bulk
  purchase of many leads in one checkout stamps the same `gatewayOrderId` across every row it
  covers; no separate order/purchase table is needed since each lead is sold at most once in its
  lifetime (see §7)

**Isolation rule (enforced by code structure, not just convention):** the marketplace/buyer-auth
router modules only import and query `Buyer` and `MarketplaceLead`. They never import the `Lead`
or `User` Prisma models. This makes it structurally impossible — not just policy — for a bug in
buyer-facing code to expose internal Sales OS data.

## 6. Curation Flow (Sales OS side)

1. A lead reaches status `LOST` in the normal Sales OS flow (unchanged).
2. On the Lead Detail page, Founder/Manager sees a new "List on Marketplace" action (Lost leads
   only).
3. Approving it: copies the resale-safe fields into a new `MarketplaceLead` row
   (`resaleStatus = LISTED`), stamps `approvedById`/`listedAt`. The original `Lead` gets a new
   `releasedToMarketplaceAt` timestamp field (nullable), so Sales OS staff can see at a glance that
   a Lost lead has already been sent to the marketplace — same pattern as the existing
   `ownerPinnedAt` field.
4. Founder/Manager can override the computed price at this step (see §8) — otherwise it's left
   unset and computed automatically based on the volume tier at the time a buyer purchases it.

## 7. Buyer Flow

**Browse & filter.** Buyer sets any combination of: service, industry, city/state, lost reason,
expected deal value (min–max), date lost (range), date listed (range), price (min–max), and a
free-text keyword search on company name. As filters change, the UI shows a live match count and
a live computed price for whatever quantity the buyer types in (capped at the match count — a
buyer can never request more than what's actually available).

**Checkout.** Buyer confirms a quantity, pays via Razorpay hosted checkout. On confirmed payment
(webhook, signature-verified, idempotent — see §9), the system atomically selects that many
`LISTED` rows still matching the buyer's filters, and updates each to `SOLD` with `buyerId`,
`pricePaid`, `purchasedAt`, `exclusiveUntil`, and the shared `gatewayOrderId`/`gatewayPaymentId`.

If the match count shrinks between browsing and checkout (a rare race — another buyer bought some
of the same pool in between), the buyer is charged only for what's actually delivered, priced at
whatever tier that final quantity falls into — never for more than they received.

**Dashboard.** Purchased leads land permanently in the buyer's own dashboard (not a one-time
download link). From there, the buyer can view full contact details (only ever visible after
purchase) and export the full list as CSV (opens directly in Excel — reuses the existing
`leadsToCsv` pattern from the internal Sales OS's own export, no new export format to build).

## 8. Pricing

A standard volume rate card, applied automatically and silently — **never published to buyers as
a visible table.** The buyer only ever sees the resulting price for their own selected quantity,
not the underlying schedule:

| Leads in this purchase | Price per lead |
|---|---|
| 1 – 99 | ₹10 |
| 100 – 999 | ₹5 |
| 1,000 – 4,999 | ₹3 |
| 5,000 – 9,999 | ₹2 |
| 10,000+ | ₹1 |

The rate card is the default for every lead. Founder/Manager can override the price for an
individual lead at approval time (§6) — useful since Lost leads vary in quality (a lead lost on
budget/timing is worth more than one lost because the company shut down), and a flat rate card
can't capture that on its own.

## 9. Exclusivity & Expiry

- Every purchased lead is exclusive to the buyer who bought it — this applies at every price tier,
  including bulk purchases. No other buyer can ever purchase or see a `SOLD` lead.
- Exclusivity lasts 2 months from purchase (`exclusiveUntil`).
- After 2 months, the lead simply **expires**. It is not re-listed, not resold, not recycled to a
  different buyer — the marketplace's supply is one-shot per lead, matching the exclusivity
  promise buyers are paying for.

## 10. Security

- **Data isolation** — §5's structural isolation (buyer-facing code never queries `Lead`/`User`).
- **Single-session buyer auth** — §3.
- **Buyer accounts are Founder/Manager-created only** — no open registration surface to abuse.
- **Payments** — Razorpay hosted checkout; Naraway's servers never receive or store card/UPI
  details. Webhooks are signature-verified and processed idempotently (a retried webhook must not
  double-sell or double-charge).
- **Rate limiting** on the marketplace search/filter endpoint, to prevent a buyer (or a script)
  from scraping the full teaser dataset via repeated paginated queries without paying.
- **Audit logging** — every approval, every purchase, every CSV export is logged (actor, target,
  timestamp), reusing the existing `AuditLog` pattern from the internal Sales OS.

## 11. Explicitly Out of Scope (v1)

- Lead recycling/resale after expiry (§9 — one-shot only).
- Self-service buyer signup (§3 — Founder/Manager creates accounts only).
- Automated refund/dispute handling — handled manually (support conversation) if it comes up; not
  a built feature in v1.
- Native `.xlsx` export with formatting — CSV only, which already opens in Excel.
- A published/visible rate card — pricing is always computed live per request, never displayed as
  a static schedule.
