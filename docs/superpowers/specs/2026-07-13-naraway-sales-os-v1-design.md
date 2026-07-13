# Naraway Sales OS — V1 Design

Date: 2026-07-13
Status: Approved for planning

## 1. Purpose

Replace spreadsheets with a lightweight, modular Sales OS for Naraway. V1 delivers the core
day-to-day workflow only: manage sales associate accounts, bulk-load leads, view/manage leads in
a Zoho-style UI, assign leads to associates, and let the team comment on leads. Dashboards,
reports, notifications, and AI features are explicitly deferred to later phases (see PRD sections
11-13, 17-18, 25 — out of scope here).

## 2. Roles (V1)

- **Founder/Admin** — full access: create/manage users, all leads, assignment rules, settings.
- **Sales Manager** — view all leads, reassign leads, cannot manage users/settings.
- **Sales Executive** — sees and edits only leads where they are the owner; can add comments and
  update status/notes on their own leads.

Role checks are enforced server-side (API-level filtering), not just hidden in the UI.

## 3. Tech Stack

- Frontend: React + TypeScript + TailwindCSS + shadcn/ui, in `client/`
- Backend: Node.js + Express + TypeScript, in `server/`
- Database: PostgreSQL hosted on **Supabase** (free tier)
- ORM: Prisma
- Auth: JWT, custom (not Supabase Auth) — passwords hashed with bcrypt
- Hosting: **Render** — two services, `server` (Node web service) and `client` (static site)
- API style: REST, versioned at `/api/v1/...`

No Docker/local Postgres required — Prisma points directly at the Supabase connection string via
`DATABASE_URL` env var (never committed; `.env.example` documents the shape).

## 4. Data Model (Prisma)

- **User** — id, employeeId (unique, auto-generated e.g. `NRW-SE-001` / `NRW-SM-002` / `NRW-FD-001`
  based on role prefix + sequential counter), name, email (unique), passwordHash,
  role (`FOUNDER` | `MANAGER` | `EXECUTIVE`), teamId (nullable for Founder), mustChangePassword
  (bool, default true), isActive (bool), createdAt, updatedAt.
- **Team** — id, name (e.g. "AI Sales Team", "Legal Sales Team"). Executives/Managers belong to a team.
- **Service** — id, name (e.g. "AI Development", "Company Registration"). Used on leads and in
  assignment rules.
- **Lead** — id, companyName, contactPerson, phone, email, website, industry, serviceId (FK),
  sourceId (FK to LeadSource), ownerId (FK to User, nullable until assigned), priority
  (`LOW`|`MEDIUM`|`HIGH`), status (enum: New, Contacted, Qualified, Meeting Scheduled, Proposal
  Sent, Negotiation, Won, Lost, On Hold), notes (kept for a short free-text summary field —
  detailed notes live in LeadComment), createdAt, lastContactAt, nextFollowUp, expectedDealValue,
  probability, expectedClosingDate, lostReason, createdBy (FK to User).
- **LeadSource** — id, name (e.g. "Website", "Referral", "Cold Call") — simple lookup, admin-managed.
- **LeadActivity** — id, leadId, userId, action (enum: Created, Assigned, Reassigned,
  StatusChanged, FieldUpdated), notes, timestamp. Auto-logged by a single central hook on every
  lead mutation — append-only, never edited.
- **LeadComment** — id, leadId, userId, body, createdAt. Append-only (no edit/delete), matching
  the PRD's "cannot edit history" rule.
- **AssignmentRule** — id, serviceId (FK, unique), teamId (FK). Defines which team a service
  routes to for auto-assignment.
- **AuditLog** — id, actorId, action, entityType, entityId, timestamp. Minimal, for admin actions
  (user creation, role changes, rule changes).

Duplicate detection for CSV import matches on `phone` OR `email` against existing leads.

## 5. Key Flows

### 5.1 User creation (Admin only)
Admin fills a form (name, email, role, team). Backend generates the next sequential `employeeId`
for that role prefix and a random temporary password, returned once in the response for the admin
to share manually (no email sending in V1). The new user's `mustChangePassword` is `true`; their
first successful login is redirected to a forced password-change screen before any other route is
accessible.

### 5.2 CSV Bulk Import (Admin only)
1. Upload any CSV.
2. UI presents detected column headers with dropdowns to map each to a Lead field (required
   fields must be mapped to proceed).
3. Backend validates and returns a preview: per-row pass/fail, with reasons (missing required
   field, bad email/phone format, duplicate of existing lead by phone/email).
4. Admin confirms; only valid, non-duplicate rows are inserted. A downloadable report of
   skipped rows (with reasons) is offered.
5. Each imported lead runs through the assignment flow below (5.3) unless left unassigned by
   choice.

### 5.3 Assignment (manual + rule-based + round-robin)
- **Manual**: admin/manager picks an owner for one lead, or multi-selects rows in the lead table
  and bulk-assigns to one owner.
- **Service-based auto-routing**: if the lead's `serviceId` matches an `AssignmentRule`, the lead
  is routed to that rule's `teamId`.
- **Round-robin within team**: when routed to a team (via rule, or CSV import default), the
  specific owner is chosen round-robin among that team's active Executives (last-assigned
  tracked per team to rotate fairly).
- Admin/Manager can reassign any lead at any time; every assignment/reassignment writes a
  `LeadActivity` entry.
- Implementation is a single `AssignmentService` behind one interface with swappable strategies
  (manual / rule-based / round-robin), so future strategies (e.g. AI-recommended) are additive.

### 5.4 Lead list & detail UI
- **List view**: paginated, server-side sortable/filterable table (by status, owner, service,
  source, priority, date range), global search (company/contact/phone/email/lead ID/owner),
  styled like traditional CRM tables (Zoho-like): dense rows, status badges with color, inline
  quick actions. CSV export of the current filtered view.
- **Detail view**: all Lead fields editable inline or via edit form, activity timeline (read-only,
  chronological), comments section (add new comment; existing comments cannot be edited/deleted),
  role-based field visibility/edit rights.

### 5.5 RBAC enforcement
Every leads-related API endpoint filters at the query level: Executives get `WHERE ownerId = self`
injected server-side regardless of client-supplied filters; Managers/Founder get unrestricted
access. This is enforced in the service layer, not just the controller, so it can't be bypassed by
a new route forgetting to check.

## 6. API Structure (V1 subset)

```
/api/v1/auth          login, change-password, me
/api/v1/users         CRUD (admin only), list by team/role
/api/v1/teams         CRUD (admin only)
/api/v1/services      CRUD (admin only)
/api/v1/lead-sources  CRUD (admin only)
/api/v1/leads         CRUD, list (filter/sort/paginate/search), assign, bulk-assign, import (CSV), export (CSV)
/api/v1/leads/:id/activities   list (read-only)
/api/v1/leads/:id/comments     list, create
/api/v1/assignment-rules       CRUD (admin only)
```

## 7. Architecture for Long-Term Modularity

- **Backend layering**: `route → controller → service → repository (Prisma)` per domain folder
  (`leads/`, `users/`, `assignment/`, `activities/`, `comments/`, `teams/`, `services/`). Controllers
  never call Prisma directly. This matches the PRD's AI-readiness ask: future modules
  (`LeadScoringService`, `ProposalService`, etc.) are new services implementing the same
  patterns, added without touching existing controllers/routes.
- **Assignment strategy pattern**: `AssignmentService.assign(lead, strategy)` — strategies are
  small, independently testable classes/functions. Adding "AI-recommended assignment" later means
  adding one new strategy, not modifying existing ones.
- **Central activity-logging hook**: all lead mutations flow through one function that writes
  `LeadActivity`. Future consumers (notifications, AI summaries) subscribe here instead of being
  wired into every route individually.
- **Frontend feature folders**: `features/leads`, `features/users`, `features/assignment`, etc.,
  each self-contained (components, hooks, api client). Shared primitives (table, modal, badge,
  form controls) live in `components/ui` (shadcn-based). Phase 2 features (dashboards, reports)
  become new feature folders reusing the same primitives — no rework of existing ones.
- **Prisma migrations, additive-only**: V1 tables are not altered destructively by later phases;
  new tables/columns are added via migration.
- **API versioning** at `/api/v1/...` isolates V1 clients from later breaking changes.

## 8. Out of Scope for V1

Per PRD section 28, plus (from this design's scoping): dashboards/charts/analytics, reports
module, notifications (in-app/email/WhatsApp), calling, proposal/invoice generation, payment
gateway, calendar sync, mobile apps, AI feature implementation (architecture only, per §7), voice
recording, third-party CRM integrations, email-based account invites (V1 uses admin-shown temp
passwords instead).

## 9. Non-Functional Notes (V1-relevant subset)

- TypeScript throughout, both client and server.
- Input validation on all API endpoints (e.g. zod).
- Password hashing via bcrypt; JWT for session; rate limiting and Helmet on the API.
- Server-side pagination and filtering for the leads table (must handle large lead volumes without
  loading everything client-side).
- Seed script with a demo admin user plus a couple of demo teams/services for local development.
- Prisma migrations checked into the repo.
