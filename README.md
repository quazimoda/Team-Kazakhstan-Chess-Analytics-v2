# Team Kazakhstan Chess Analytics v2

Chess.com analytics platform for Team Kazakhstan club matches, league tracking, player activity, and contribution scoring. The current app covers the Stage 1–3 MVP surface: dashboard pages, Chess.com match synchronization, official league filtering, player contribution recalculation, and leaderboard views.

## Stack

- Next.js 15 App Router
- React 19 and TypeScript
- Tailwind CSS v4
- Drizzle ORM with PostgreSQL / Neon
- Zod validation
- Chess.com public API client using `fetch`

## Local setup

1. Install Node.js 20 or newer.
2. Install dependencies from the lockfile:

   ```bash
   npm ci
   ```

3. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

   If `.env.example` is not present in your checkout, create `.env.local` with the variables listed below.

4. Start the development server:

   ```bash
   npm run dev
   ```

5. Open <http://localhost:3000>.

Without `DATABASE_URL`, read-only pages and APIs use demo fallback data so the UI stays runnable. Admin write actions still require a PostgreSQL database for real persistence.

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Required for production and migrations | PostgreSQL or Neon connection string used by Drizzle. |
| `ADMIN_SECRET` | Required for admin writes | Shared MVP secret sent in the `x-admin-secret` header for admin API calls. Use at least 12 characters. |
| `CHESSCOM_USER_AGENT` | Recommended for sync | User-Agent sent to Chess.com API requests. Use a value that identifies the deployed app/contact. |
| `NEXT_PUBLIC_APP_URL` | Optional | Public app URL used by links and deployments. |

## Scripts

```bash
npm run dev
npm run typecheck
npm run lint
npm run test
npm run build
npm run db:generate
npm run db:migrate
npm run db:studio
```

The CI workflow runs `npm ci`, `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build` on pushes and pull requests to `main`.

## Database migrations

Drizzle migrations live in `drizzle/`. The initial migration creates the Stage 1–3 schema and seeds the base league rows used by match classification.

### Fresh Neon/PostgreSQL database

1. Create a Neon project or another PostgreSQL database.
2. Set `DATABASE_URL` to the database connection string.
3. Apply migrations:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/db?sslmode=require" npm run db:migrate
   ```

4. Start the app with the same `DATABASE_URL`.

### Updating the schema

1. Edit `src/server/db/schema.ts`.
2. Generate a migration:

   ```bash
   npm run db:generate
   ```

3. Review and commit the generated SQL and `drizzle/meta` changes.
4. Run `npm run db:migrate` against a disposable database before deploying.

## Admin sync and recalculation

The MVP admin page is available at `/admin`. API writes are protected by `ADMIN_SECRET` through the `x-admin-secret` header.

### Sync Chess.com matches

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/admin/sync/matches" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

This endpoint fetches Team Kazakhstan Chess.com club matches, classifies them into configured leagues, upserts matches, and records a sync job.

### Recalculate player contributions

```bash
curl -X POST "$NEXT_PUBLIC_APP_URL/api/admin/recalculate" \
  -H "x-admin-secret: $ADMIN_SECRET"
```

This endpoint aggregates official match participation rows and rewrites player contribution rows for the `all` period. The `/admin` page exposes both **Sync Matches** and **Recalculate** buttons that prompt for `ADMIN_SECRET` and call the real endpoints.

## Vercel deployment

1. Import the repository into Vercel.
2. Use the default Next.js framework settings.
3. Configure environment variables in Vercel:
   - `DATABASE_URL`
   - `ADMIN_SECRET`
   - `CHESSCOM_USER_AGENT`
   - `NEXT_PUBLIC_APP_URL`
4. Apply database migrations before or during release:

   ```bash
   DATABASE_URL="postgresql://USER:PASSWORD@HOST/db?sslmode=require" npm run db:migrate
   ```

5. Deploy. Vercel will run the Next.js build from `npm run build`.

## Implemented routes

- `/`
- `/leaderboard`
- `/players`
- `/matches`
- `/leagues`
- `/admin`

## API routes

- `GET /api/team/summary`
- `GET /api/players`
- `GET /api/matches`
- `GET /api/leagues`
- `GET /api/leaderboards`
- `POST /api/admin/sync/matches`
- `POST /api/admin/recalculate`

## Remaining production hardening

- Replace MVP shared-secret admin access with authenticated role-based access before broad production use.
- Add scheduled/background job orchestration for sync and recalculation if sync volume grows beyond Vercel request limits.
