# Architecture

## Overview

Team Kazakhstan Chess Analytics v2 is structured as a Next.js 15 App Router application with server-first data loading, typed API responses, and Drizzle ORM for PostgreSQL persistence.

## Directory layout

```text
src/app          App Router pages and route handlers
src/components   Shared UI components, layout, and tables
src/lib          Cross-cutting utilities, demo data, env parsing, Chess.com client
src/server       Database schema, connection, and query functions
src/types        Shared TypeScript domain and API types
docs             Project documentation
```

## Data flow

1. Pages call server query helpers from `src/server/queries.ts`.
2. Query helpers read from Drizzle when `DATABASE_URL` is configured.
3. If the database is missing or empty, helpers return demo fallback data with `source: "demo"`.
4. API route handlers reuse the same query helpers to keep page and API behavior aligned.

## Database model

The Stage 1 schema includes:

- `players`: Chess.com identities and aggregate contribution totals.
- `matches`: Team match metadata, status, scores, and Chess.com references.
- `leagues`: Competition/season containers.
- `games`: Individual games connected to matches and players.
- `match_participations`: Join table for players in matches.
- `player_contributions`: Periodic contribution snapshots.
- `sync_jobs`: Admin-visible synchronization lifecycle records.

## Chess.com client

`src/lib/chesscom/client.ts` provides typed wrappers for the public Chess.com API:

- `getClubMatches(clubSlug)`
- `getPlayerProfile(username)`
- `getPlayerStats(username)`
- `getPlayerArchives(username)`
- `getPlayerMonthlyGames(username, year, month)`

All functions use `fetch`, set `User-Agent` from `CHESSCOM_USER_AGENT`, return a discriminated result type, and validate MVP-critical response shapes with Zod.

## Admin MVP

The `/admin` page displays last sync status, action buttons, sync-job history, and a warning that write endpoints use `ADMIN_SECRET` during MVP. `POST /api/admin/sync/matches` checks the shared secret when configured and creates a queued sync-job shell.
