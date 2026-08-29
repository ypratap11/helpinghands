# Helping Hands

A contribution tracker for a small charity group in India: who gave what, who
it went to, and a running balance — with an eye toward 80G tax receipts once
the group registers as a trust/society.

See `docs/superpowers/specs/2026-08-28-helping-hands-design.md` for the full
design.

## Local setup

Prerequisites: Node.js, Docker Desktop (must be running — Postgres runs in a
container), and a Google Cloud OAuth client.

1. **Start Postgres.**

   ```bash
   docker compose up -d db
   ```

   This starts a Postgres container on port 5433 with a `helping_hands`
   database already created. Create the test database used by the test
   suite as well:

   ```bash
   docker compose exec db psql -U helping -c "CREATE DATABASE helping_hands_test;"
   ```

2. **Configure environment variables.**

   ```bash
   cp .env.example .env
   ```

   Fill in:
   - `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` — from a Google Cloud OAuth
     client (OAuth consent screen + Web application credentials). Add
     `http://localhost:3000/api/auth/callback/google` as an authorized
     redirect URI.
   - `ADMIN_EMAILS` — a comma-separated list of Google account emails that
     should sign in as admins.
   - `AUTH_SECRET` — generate one with:

     ```bash
     npx auth secret
     ```

   `DATABASE_URL` and the other defaults in `.env.example` already match the
   `docker-compose.yml` setup and don't need to change for local dev.

3. **Set up the database.**

   ```bash
   npm install
   npm run db:migrate
   npm run db:generate
   npm run db:seed
   ```

4. **Set up the test database.** Create `.env.test` alongside `.env`, pointed
   at `helping_hands_test` instead of `helping_hands` (see the commented-out
   line in `.env.example`), then run:

   ```bash
   npm run db:test:migrate
   ```

   The test suite refuses to run unless `.env.test` resolves to a database
   whose name contains `helping_hands_test` — every test run truncates all
   tables.

5. **Run it.**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000). Sign in with a
   Google account listed in `ADMIN_EMAILS` to reach `/admin`.

6. **Run the tests.**

   ```bash
   npm test
   ```

## Other scripts

- `npm run build` / `npm start` — production build and start
- `npm run lint` — ESLint
- `npx tsc --noEmit` — type-check
- `npm run db:reset` — drop and recreate the dev database from migrations
  (destructive, dev database only)
