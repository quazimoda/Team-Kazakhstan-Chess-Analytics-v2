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

## Stage 3 player contribution leaderboard

The Stage 3 leaderboard is built from `match_participations` aggregated into `player_contributions` for `period = all`. Each contribution row is scoped to a player and league, so `/api/leaderboards` and `/leaderboard` can filter by league while keeping the same ranking fields.

### Points vs contribution score

`points` are standard chess scoring points: each win is worth `1`, each draw is worth `0.5`, and losses add `0`. This number answers “how many board points did the player score?” and is intentionally familiar to team captains and players.

`contribution_score` is a product metric for contribution ranking. The MVP formula rewards every decisive result while still accounting for difficult or harmful outcomes:

```text
wins * 3 + draws * 2 + losses * 1 - timeout_losses * 2 + upset_wins * 1.5
```

This means a player can be recognized for activity and useful participation beyond raw chess points, while timeout losses are penalized because they damage team match outcomes.

### Official matches only

Contribution recalculation only reads matches where `matches.is_official = 1`. Official-only scoring prevents casual friendlies, test imports, unknown competitions, and incomplete classification data from changing the team leaderboard. It keeps the public ranking aligned with Team Kazakhstan’s competitive league performance and makes league-filtered standings comparable across players.
