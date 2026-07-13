-- ============================================================================
-- Naraway Sales OS — Supabase schema (single maintained file)
--
-- HOW TO USE:
--   Paste this entire file into the Supabase SQL Editor and run it.
--   It is safe to re-run any time the schema changes: every statement is
--   idempotent (CREATE ... IF NOT EXISTS / DO blocks that check first), so it
--   only creates what's missing. When we add a new table/column/enum value,
--   we update THIS file (append new idempotent statements) and you re-run the
--   whole file again — no separate migration files to track.
--
--   This mirrors server/prisma/schema.prisma. If you use `prisma migrate`
--   locally instead, you don't need this file — it exists for teams who just
--   want to copy/paste SQL into Supabase directly.
-- ============================================================================

-- ---------- Enums ----------
do $$ begin
  create type "Role" as enum ('FOUNDER', 'MANAGER', 'EXECUTIVE');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "LeadStatus" as enum (
    'NEW', 'CONTACTED', 'QUALIFIED', 'MEETING_SCHEDULED', 'PROPOSAL_SENT',
    'NEGOTIATION', 'WON', 'LOST', 'ON_HOLD'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type "Priority" as enum ('LOW', 'MEDIUM', 'HIGH');
exception when duplicate_object then null; end $$;

do $$ begin
  create type "ActivityAction" as enum (
    'CREATED', 'ASSIGNED', 'REASSIGNED', 'STATUS_CHANGED', 'FIELD_UPDATED', 'IMPORTED'
  );
exception when duplicate_object then null; end $$;

-- ---------- teams ----------
create table if not exists teams (
  id                text primary key default gen_random_uuid()::text,
  name              text not null unique,
  last_assigned_idx integer not null default 0,
  created_at        timestamptz not null default now()
);

-- ---------- services ----------
create table if not exists services (
  id         text primary key default gen_random_uuid()::text,
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- lead_sources ----------
create table if not exists lead_sources (
  id         text primary key default gen_random_uuid()::text,
  name       text not null unique,
  created_at timestamptz not null default now()
);

-- ---------- users ----------
create table if not exists users (
  id                   text primary key default gen_random_uuid()::text,
  employee_id          text not null unique,
  name                 text not null,
  email                text not null unique,
  password_hash        text not null,
  role                 "Role" not null,
  must_change_password boolean not null default true,
  is_active            boolean not null default true,
  team_id              text references teams(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists users_team_id_idx on users(team_id);

-- ---------- leads ----------
create table if not exists leads (
  id                    text primary key default gen_random_uuid()::text,
  company_name          text not null,
  contact_person        text not null,
  phone                 text not null,
  email                 text,
  website               text,
  industry              text,
  city                  text,
  state                 text,
  country               text,
  notes                 text,
  service_id            text references services(id),
  source_id             text references lead_sources(id),
  owner_id              text references users(id),
  priority              "Priority" not null default 'MEDIUM',
  status                "LeadStatus" not null default 'NEW',
  expected_deal_value   numeric(14, 2),
  probability           integer,
  expected_closing_date timestamptz,
  lost_reason           text,
  last_contact_at       timestamptz,
  next_follow_up        timestamptz,
  created_by_id         text not null references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists leads_owner_id_idx on leads(owner_id);
create index if not exists leads_status_idx on leads(status);
create index if not exists leads_service_id_idx on leads(service_id);
create index if not exists leads_phone_idx on leads(phone);
create index if not exists leads_email_idx on leads(email);
create index if not exists leads_state_idx on leads(state);
create index if not exists leads_city_idx on leads(city);

-- ---------- lead_activities ----------
create table if not exists lead_activities (
  id        text primary key default gen_random_uuid()::text,
  lead_id   text not null references leads(id) on delete cascade,
  user_id   text references users(id),
  action    "ActivityAction" not null,
  notes     text,
  timestamp timestamptz not null default now()
);
create index if not exists lead_activities_lead_id_idx on lead_activities(lead_id);

-- ---------- lead_comments ----------
create table if not exists lead_comments (
  id         text primary key default gen_random_uuid()::text,
  lead_id    text not null references leads(id) on delete cascade,
  user_id    text not null references users(id),
  body       text not null,
  created_at timestamptz not null default now()
);
create index if not exists lead_comments_lead_id_idx on lead_comments(lead_id);

-- ---------- assignment_rules ----------
create table if not exists assignment_rules (
  id         text primary key default gen_random_uuid()::text,
  service_id text not null unique references services(id),
  team_id    text not null references teams(id)
);

-- ---------- audit_logs ----------
create table if not exists audit_logs (
  id          text primary key default gen_random_uuid()::text,
  actor_id    text references users(id),
  action      text not null,
  entity_type text not null,
  entity_id   text not null,
  timestamp   timestamptz not null default now()
);

-- ============================================================================
-- FUTURE CHANGES: append new idempotent statements below this line, e.g.:
--   alter table leads add column if not exists lead_score integer;
--   create table if not exists notifications (...);
-- Then re-run this entire file in the Supabase SQL Editor.
-- ============================================================================
