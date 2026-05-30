# Old SQLite official club-match import plan

This document describes the dry-run audit for linking games from the first Team Kazakhstan Chess Analytics SQLite export to the current Neon-backed application. The current implementation is intentionally read-only: it reports safe import candidates and writes CSV audit artifacts, but it does not insert, update, or delete production rows.

## Local setup

1. Put the legacy SQLite database on the local machine only, preferably under `local-data/`:

   ```bash
   mkdir -p local-data
   cp /path/to/chess_export.db local-data/chess_export.db
   ```

2. Confirm the database is ignored by Git before running any audit or import work:

   ```bash
   git check-ignore -v local-data/chess_export.db
   ```

3. Export the two required environment variables:

   ```bash
   export OLD_SQLITE_PATH="$PWD/local-data/chess_export.db"
   export DATABASE_URL="postgres://..."
   ```

4. Ensure the local environment has Python 3 and the `sqlite3` Python standard-library module available. The TypeScript audit script streams rows from SQLite through a read-only Python connection so the 1.59 GB database does not need to be loaded into memory.

## Why `chess_export.db` must not be committed

The legacy `chess_export.db` file is approximately 1.59 GB. It must stay out of the repository because:

- it is far larger than a normal source-control artifact and would make cloning and CI unnecessarily slow;
- it may contain full PGNs, player metadata, URLs, and historical source payloads that should be handled as local data rather than source code;
- the audit can be reproduced from a local path through `OLD_SQLITE_PATH`, so the binary database is not needed in Git;
- `.gitignore` excludes `local-data/`, `*.db`, `*.sqlite`, `*.sqlite3`, and `old-db-audit-output/` for this workflow.

## How to run the dry-run

Run:

```bash
npm run audit:old-sqlite-official
```

The script requires:

- `OLD_SQLITE_PATH`: absolute or relative path to the local legacy SQLite database;
- `DATABASE_URL`: the current Neon/PostgreSQL database URL.

The script fails early if `OLD_SQLITE_PATH` is missing or points to a nonexistent file. It opens SQLite with `mode=ro` and starts the Neon session with `BEGIN READ ONLY` before selecting current matches and games.

The dry-run extracts these PGN tags from old `games.pgn` values:

- `Match` club-match URL and numeric Chess.com match id from either `/club/matches/{id}` or `/club/matches/live/{id}`;
- `Event`;
- `White`;
- `Black`;
- `Result`;
- `WhiteElo`;
- `BlackElo`;
- `Link`;
- optional `EndDate` and `EndTime`.

A game is counted as a final import candidate only when all of these checks pass:

1. the extracted Chess.com club-match id exists in current `matches.chesscom_match_id`;
2. the current match has `matches.is_official = 1`;
3. the current match has a non-null `matches.league_id`;
4. the legacy `rules` value is `chess` or `chess960`;
5. the legacy `game_url` or PGN `Link` does not already exist in current `games.chesscom_game_uuid`, `raw_game->>'url'`, `raw_game->>'game_url'`, `raw_game->>'link'`, or an equivalent normalized numeric game-id form extracted from any of those URLs.

The script writes CSV files under `old-db-audit-output/`:

- `matched_official_games_sample.csv` — sample of games linked to official league matches;
- `matched_by_league.csv` — candidate and duplicate counts by league slug;
- `unmatched_old_match_ids.csv` — old Chess.com match ids absent from current matches;
- `non_official_matched_games_sample.csv` — sample of old games linked to current matches that are not official import targets;
- `duplicate_games.csv` — old games that appear to already exist in current games;
- `top_unmatched_events.csv` — most common old PGN event names for unmatched match ids.

## Safe import strategy

The next step after reviewing the dry-run output should be a separate importer with the same eligibility rules. A safe importer should:

1. keep SQLite read-only and run Neon writes inside a transaction;
2. import only rows that the dry-run classifies as final candidates;
3. upsert or create players by normalized username, preserving existing player rows;
4. insert games with `chesscom_game_uuid` set to the best stable old source id, preferably the old game URL or PGN `Link`;
5. attach each imported game to the current official `matches.id` resolved from `chesscom_match_id`;
6. preserve the original PGN and source fields in `pgn`/`raw_game` for traceability;
7. recompute match participations and player contribution aggregates after import;
8. run first against a disposable or staging Neon branch, compare counts, then repeat against production only after manual CSV review.

## Risks

- Some legacy events are non-target competitions or friendly/team-specific matches even though they use Chess.com club-match PGN tags.
- Current Neon may not yet contain every historical official match id, so official old games can appear in the unmatched CSV until missing matches are seeded/classified.
- Chess.com game URLs are not always represented identically across old SQLite exports, match-detail sync, and player-archive sync; duplicate detection therefore checks `games.chesscom_game_uuid`, `raw_game` URL fields, and normalized URL/id equivalents, but still needs manual review.
- PGN metadata may be incomplete or inconsistent for older daily/team matches.
- `rules` values outside `chess` and `chess960` are intentionally excluded from final candidates to avoid accidentally importing variants.
- Importing games without recalculating participations/contributions would leave analytics inconsistent.
