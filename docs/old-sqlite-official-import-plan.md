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

## Safe importer

The importer added after the audit uses the same eligibility rules as the dry-run audit and defaults to read-only dry-run mode.

### Importer dry-run command

```bash
OLD_SQLITE_PATH="$PWD/local-data/chess_export.db" \
DATABASE_URL="postgres://..." \
npm run import:old-sqlite-official
```

Dry-run is the default. If `IMPORT_OLD_SQLITE` is unset, empty, or any value other than exactly `true`, the importer opens PostgreSQL with a read-only transaction, scans the old SQLite database, writes review logs under `old-db-import-output/`, and rolls back without inserting games, players, participations, or contributions.

### Real import command

> **Warning:** writes are enabled only when `IMPORT_OLD_SQLITE=true` is present exactly. Contribution recalculation is a separate opt-in step and runs in the same transaction only when `RECALCULATE_AFTER_IMPORT=true` is present exactly. Do not run the write mode directly against production until the dry-run CSVs have been reviewed and a current database backup exists.

```bash
OLD_SQLITE_PATH="$PWD/local-data/chess_export.db" \
DATABASE_URL="postgres://..." \
IMPORT_OLD_SQLITE=true \
RECALCULATE_AFTER_IMPORT=true \
npm run import:old-sqlite-official
```

Recommended rollout:

1. create a fresh backup or restore point for the target PostgreSQL database;
2. run the importer against a disposable/staging Neon branch first;
3. review `old-db-import-output/import_summary.json` and the CSVs;
4. run the verification SQL below on staging;
5. repeat against production only after the staging counts match expectations.

The importer intentionally does not seed, classify, or reclassify matches. Old games whose Chess.com match id is absent from current `matches.chesscom_match_id` remain skipped as unmatched, and games linked to current non-official/no-league matches are skipped.

When `RECALCULATE_AFTER_IMPORT=true` is set during a real import, the importer recalculates only `player_contributions` rows with `period = 'all'` whose `league_id` is one of the official league ids touched by imported games. It deletes and rebuilds only those affected contribution rows from current `match_participations`; it does not delete contribution rows for unrelated leagues or null-league matches. If `RECALCULATE_AFTER_IMPORT` is omitted, the importer writes games/participations and prints the affected league ids so recalculation can be run separately through the existing admin recalculation workflow.

### Post-import verification SQL

```sql
-- Imported old SQLite games by league.
select l.slug, count(*) as imported_games
from games g
join matches m on m.id = g.match_id
join leagues l on l.id = m.league_id
where g.raw_game->>'source' = 'old_sqlite'
group by l.slug
order by imported_games desc;

-- Confirm imported games are only attached to official league matches.
select count(*) as bad_imported_games
from games g
join matches m on m.id = g.match_id
where g.raw_game->>'source' = 'old_sqlite'
  and (m.is_official <> 1 or m.league_id is null);

-- Confirm only chess/chess960 variants were imported.
select g.raw_game->>'old_rules' as old_rules, count(*)
from games g
where g.raw_game->>'source' = 'old_sqlite'
group by old_rules
order by old_rules;

-- Check for duplicate source identifiers after import.
select chesscom_game_uuid, count(*)
from games
where raw_game->>'source' = 'old_sqlite'
group by chesscom_game_uuid
having count(*) > 1;

-- Participation and contribution sanity checks.
select count(*) as old_sqlite_participation_rows
from match_participations mp
where exists (
  select 1
  from games g
  where g.match_id = mp.match_id
    and g.raw_game->>'source' = 'old_sqlite'
);

select count(*) as contribution_rows
from player_contributions
where period = 'all';
```
