# Naraway Sales OS — API

## Setup

1. `npm install`
2. Copy `.env.example` to `.env` and fill in:
   - `DATABASE_URL` — your Supabase Postgres connection string
   - `JWT_SECRET` — any long random string
3. `npm run prisma:migrate` — creates tables in your Supabase database
4. `npm run seed` — creates a demo Founder account (`founder@naraway.com` / `ChangeMe123!`) and a demo Executive
5. `npm run dev` — starts the API on `http://localhost:4000`

## Scripts

- `npm run dev` — dev server with hot reload
- `npm run build` / `npm start` — production build + run
- `npm run prisma:migrate` — create/apply a migration locally
- `npm run prisma:deploy` — apply migrations in production (Render build step)
- `npm run seed` — run the seed script

## Structure

```
src/
  common/          shared middleware, errors, prisma client, env config
  modules/
    auth/          login, change-password, /me
    users/         admin user management, employeeId generation
    leads/         lead CRUD, list/filter/search, CSV import/export
    assignment/    manual/rule-based/round-robin assignment strategies
    assignmentRules/  service -> team routing rules (admin)
    activities/    central lead-activity logging
    comments/      lead comments
  app.ts           express app + route wiring
  index.ts         entrypoint
prisma/
  schema.prisma
  seed.ts
```

Each module follows `controller -> service -> prisma`. Controllers never call Prisma directly.
