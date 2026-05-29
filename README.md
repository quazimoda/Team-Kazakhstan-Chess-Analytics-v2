# Team Kazakhstan Chess Analytics v2

Stage 1 foundation for a Chess.com analytics platform focused on Team Kazakhstan club matches, leagues, player activity, and contribution scoring.

## Repository assessment

This repository was empty when Stage 1 started: there were no source files, no package manifest, and no existing framework conventions to preserve. It is safe to continue with a fresh Next.js 15 App Router structure.

## Stack

- Next.js 15 with App Router
- TypeScript
- Tailwind CSS v4
- Drizzle ORM with PostgreSQL dialect
- Zod validation
- Chess.com public API client using `fetch`

## Getting started

```bash
npm install
cp .env.example .env
npm run dev
```

Open <http://localhost:3000>.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string used by Drizzle |
| `ADMIN_SECRET` | MVP shared secret for admin API writes |
| `CHESSCOM_USER_AGENT` | Required User-Agent value for Chess.com API requests |
| `NEXT_PUBLIC_APP_URL` | Public app URL used by links and deployments |

Without `DATABASE_URL`, API routes and pages use demo fallback data so the UI remains runnable.

## Scripts

```bash
npm run dev
npm run build
npm run lint
npm run typecheck
npm run db:generate
npm run db:migrate
npm run db:studio
```

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

## Stage 2 candidates

- Persistent seed data and migrations committed from `drizzle-kit generate`
- Real Chess.com match synchronization service
- Game ingestion and PGN parsing
- Contribution scoring formulas
- Admin authentication beyond `ADMIN_SECRET`
- Background jobs / queue for sync and recalculation
