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
  is_organic boolean not null default true,
  created_at timestamptz not null default now()
);
alter table lead_sources add column if not exists is_organic boolean not null default true;

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
create index if not exists users_team_id_role_is_active_idx on users(team_id, role, is_active);

-- ---------- leads ----------
create table if not exists leads (
  id                    text primary key default gen_random_uuid()::text,
  company_name          text not null,
  contact_person        text,
  phone                 text,
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
  created_by_id         text references users(id),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists leads_owner_id_status_updated_at_idx on leads(owner_id, status, updated_at);
create index if not exists leads_status_updated_at_idx on leads(status, updated_at);
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
create index if not exists lead_activities_user_id_timestamp_idx on lead_activities(user_id, timestamp);

-- ---------- lead_comments ----------
create table if not exists lead_comments (
  id         text primary key default gen_random_uuid()::text,
  lead_id    text not null references leads(id) on delete cascade,
  user_id    text references users(id),
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

-- 2026-07-13: support bulk company-data imports where contact person/phone are often
-- unknown at import time (filled in later once the sales team makes contact).
alter table leads alter column contact_person drop not null;
alter table leads alter column phone drop not null;

-- 2026-07-14: allow a user account to be fully deleted (not just deactivated) without
-- orphaning leads/comments they created — their name shows as "Deleted user" instead.
alter table leads alter column created_by_id drop not null;
alter table lead_comments alter column user_id drop not null;

-- 2026-07-14: smart remote-work tracking — login/logout sessions, response-time metric,
-- "profiles opened" views, and call logging with outcomes.
alter table users add column if not exists last_login_at timestamptz;
alter table leads add column if not exists first_contacted_at timestamptz;

do $$ begin
  create type "CallOutcome" as enum ('CONNECTED', 'NO_ANSWER', 'VOICEMAIL', 'CALL_BACK_LATER', 'WRONG_NUMBER');
exception when duplicate_object then null; end $$;

alter type "ActivityAction" add value if not exists 'CALLED';

create table if not exists user_sessions (
  id text primary key default gen_random_uuid()::text,
  user_id text not null references users(id) on delete cascade,
  login_at timestamptz not null default now(),
  logout_at timestamptz
);
create index if not exists user_sessions_user_id_idx on user_sessions(user_id);

create table if not exists lead_views (
  id text primary key default gen_random_uuid()::text,
  lead_id text not null references leads(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  view_date date not null,
  viewed_at timestamptz not null default now(),
  unique (lead_id, user_id, view_date)
);
create index if not exists lead_views_user_id_idx on lead_views(user_id);

-- 2026-07-14: index cleanup — composite indexes replace overlapping single-column ones
-- (Postgres can use a leftmost prefix of a composite index, so one covers what three did).
-- The table definitions above already reflect the final state for a fresh install; these
-- drops are only needed if you're re-running this file against a database created before
-- this date.
drop index if exists users_team_id_idx;
drop index if exists leads_owner_id_idx;
drop index if exists leads_status_idx;
create index if not exists lead_activities_user_id_timestamp_idx on lead_activities(user_id, timestamp);
