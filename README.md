# Naraway Sales OS

A lightweight, modular Sales OS: manage sales associate accounts, bulk-import leads, assign them
(manually or automatically via service→team rules + round robin), and track activity/comments per
lead — built to replace spreadsheets for Naraway's sales team.

## Structure

- `server/` — Node/Express/TypeScript API, Prisma ORM, PostgreSQL (Supabase)
- `client/` — React/TypeScript/Tailwind app

See `server/README.md` and `docs/superpowers/specs/2026-07-13-naraway-sales-os-v1-design.md` for
details.

## Local setup

1. Create a free [Supabase](https://supabase.com) project, grab its Postgres connection string.
2. `cd server && npm install && cp .env.example .env` — fill in `DATABASE_URL` and `JWT_SECRET`.
   - Either run `npm run prisma:migrate`, **or** paste `server/prisma/supabase.sql` into the
     Supabase SQL Editor and run it (idempotent — safe to re-run whenever the schema changes).
3. `npm run seed` — creates a demo Founder login (`founder@naraway.com` / `ChangeMe123!`).
4. `npm run dev` — API on `http://localhost:4000`.
5. `cd ../client && npm install && cp .env.example .env && npm run dev` — app on `http://localhost:5173`.

## Deployment (Render)

- Deploy `server/` as a Render **Web Service** (build: `npm install && npm run build`, start:
  `npm start`, add `npm run prisma:deploy` as a pre-deploy/build step). Set env vars from
  `server/.env.example` using your Supabase connection string.
- Deploy `client/` as a Render **Static Site** (build: `npm install && npm run build`, publish
  dir: `dist`). Set `VITE_API_URL` to the deployed server's URL.
