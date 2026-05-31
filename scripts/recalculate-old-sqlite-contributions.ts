import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import postgres from "postgres";
import {
  createRecalculateOldSqliteSummary,
  isOldSqliteRecalculationEnabled,
  parseTargetLeagueIds,
  type RecalculateOldSqliteSummary,
} from "../src/lib/import/recalculateOldSqliteContributions";

const outputDir = "old-db-import-output";
const summaryPath = `${outputDir}/recalculate_contributions_summary.json`;
const byLeagueCsvPath = `${outputDir}/recalculated_contributions_by_league.csv`;
const rollbackDryRun = Symbol("rollbackDryRun");

type LeagueRow = { id: number };
type CountRow = { count: number };
type TouchedCountsRow = { touched_player_count: number; touched_match_count: number; touched_participation_count: number };
type LeagueSummaryRow = {
  league_id: number;
  league_slug: string;
  league_name: string;
  contribution_rows: number;
  players: number;
  matches: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
};

function requiredEnv(name: "DATABASE_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function csvEscape(value: unknown) {
  if (value == null) return "";
  const text = String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function writeCsv<T extends Record<string, unknown>>(path: string, rows: T[], columns: (keyof T)[]) {
  mkdirSync(dirname(path), { recursive: true });
  const lines = [`${columns.join(",")}`];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  writeFileSync(path, `${lines.join("\n")}\n`, "utf8");
}

async function validateTargetLeagues(tx: postgres.TransactionSql, targetLeagueIds: number[]) {
  if (targetLeagueIds.length === 0) throw new Error("target_league_ids must not be empty.");
  const rows = await tx<LeagueRow[]>`
    select id
    from leagues
    where id = any(${targetLeagueIds})
    order by id
  `;
  const existingIds = new Set(rows.map((row) => Number(row.id)));
  const missingIds = targetLeagueIds.filter((leagueId) => !existingIds.has(leagueId));
  if (missingIds.length > 0) throw new Error(`Target league id(s) do not exist: ${missingIds.join(", ")}.`);
}

async function countExistingTargetContributions(tx: postgres.TransactionSql, targetLeagueIds: number[]) {
  const rows = await tx<CountRow[]>`
    select count(*)::int as count
    from player_contributions
    where period = 'all'
      and league_id = any(${targetLeagueIds})
  `;
  return rows[0]?.count ?? 0;
}

async function countRowsToInsert(tx: postgres.TransactionSql, targetLeagueIds: number[]) {
  const rows = await tx<CountRow[]>`
    select count(*)::int as count
    from (
      select mp.player_id, m.league_id
      from match_participations mp
      inner join matches m on m.id = mp.match_id
      where m.is_official = 1
        and m.league_id = any(${targetLeagueIds})
      group by mp.player_id, m.league_id
    ) aggregate_rows
  `;
  return rows[0]?.count ?? 0;
}

async function countTouchedRows(tx: postgres.TransactionSql, targetLeagueIds: number[]) {
  const rows = await tx<TouchedCountsRow[]>`
    select
      count(distinct mp.player_id)::int as touched_player_count,
      count(distinct mp.match_id)::int as touched_match_count,
      count(*)::int as touched_participation_count
    from match_participations mp
    inner join matches m on m.id = mp.match_id
    where m.is_official = 1
      and m.league_id = any(${targetLeagueIds})
  `;
  return rows[0] ?? { touched_player_count: 0, touched_match_count: 0, touched_participation_count: 0 };
}

async function buildLeagueCsvRows(tx: postgres.TransactionSql, targetLeagueIds: number[]) {
  return tx<LeagueSummaryRow[]>`
    with participation_totals as (
      select
        m.league_id,
        count(distinct mp.player_id)::int as contribution_rows,
        count(distinct mp.player_id)::int as players,
        count(distinct mp.match_id)::int as matches,
        coalesce(sum(mp.games_played), 0)::int as games_played,
        coalesce(sum(mp.wins), 0)::int as wins,
        coalesce(sum(mp.draws), 0)::int as draws,
        coalesce(sum(mp.losses), 0)::int as losses
      from match_participations mp
      inner join matches m on m.id = mp.match_id
      where m.is_official = 1
        and m.league_id = any(${targetLeagueIds})
      group by m.league_id
    )
    select
      l.id::int as league_id,
      l.slug as league_slug,
      l.name as league_name,
      coalesce(pt.contribution_rows, 0)::int as contribution_rows,
      coalesce(pt.players, 0)::int as players,
      coalesce(pt.matches, 0)::int as matches,
      coalesce(pt.games_played, 0)::int as games_played,
      coalesce(pt.wins, 0)::int as wins,
      coalesce(pt.draws, 0)::int as draws,
      coalesce(pt.losses, 0)::int as losses
    from leagues l
    left join participation_totals pt on pt.league_id = l.id
    where l.id = any(${targetLeagueIds})
    order by l.id
  `;
}

async function rebuildContributions(tx: postgres.TransactionSql, targetLeagueIds: number[]) {
  await tx`
    delete from player_contributions
    where period = 'all'
      and league_id = any(${targetLeagueIds})
  `;
  const rows = await tx<CountRow[]>`
    with aggregates as (
      select
        mp.player_id,
        m.league_id,
        count(distinct mp.match_id)::int as matches_played,
        coalesce(sum(mp.games_played), 0)::int as games_played,
        coalesce(sum(mp.wins), 0)::int as wins,
        coalesce(sum(mp.draws), 0)::int as draws,
        coalesce(sum(mp.losses), 0)::int as losses,
        coalesce(sum(mp.timeout_losses), 0)::int as timeout_losses,
        coalesce(sum(mp.upset_wins), 0)::int as upset_wins,
        round(
          sum((mp.avg_opponent_rating * mp.games_played)::numeric) filter (where mp.avg_opponent_rating is not null)
          / nullif(sum(mp.games_played) filter (where mp.avg_opponent_rating is not null), 0)
        )::int as avg_opponent_rating,
        max(coalesce(mp.last_played_at, m.ends_at, m.starts_at)) as last_played_at
      from match_participations mp
      inner join matches m on m.id = mp.match_id
      where m.is_official = 1
        and m.league_id = any(${targetLeagueIds})
      group by mp.player_id, m.league_id
    ), scored as (
      select
        *,
        (wins + draws * 0.5)::numeric(8,2) as points,
        case when games_played = 0 then 0 else round((wins::numeric / games_played) * 100, 2) end as win_rate,
        round((wins * 3 + draws * 2 + losses * 1 - timeout_losses * 2 + upset_wins * 1.5), 2) as contribution_score
      from aggregates
    ), inserted as (
      insert into player_contributions (
        player_id, league_id, period, matches_played, games_played, wins, draws, losses,
        timeout_losses, upset_wins, points, score, win_rate, avg_opponent_rating, last_played_at, contribution_score, calculated_at
      )
      select player_id, league_id, 'all', matches_played, games_played, wins, draws, losses,
        timeout_losses, upset_wins, points, points, win_rate, avg_opponent_rating, last_played_at, contribution_score, now()
      from scored
      returning 1
    )
    select count(*)::int as count from inserted
  `;
  return rows[0]?.count ?? 0;
}

async function runRecalculation(tx: postgres.TransactionSql, targetLeagueIds: number[], dryRun: boolean) {
  await validateTargetLeagues(tx, targetLeagueIds);
  const existingContributionRowsBefore = await countExistingTargetContributions(tx, targetLeagueIds);
  const rowsToInsert = await countRowsToInsert(tx, targetLeagueIds);
  const touchedRows = await countTouchedRows(tx, targetLeagueIds);
  const insertedRows = dryRun ? 0 : await rebuildContributions(tx, targetLeagueIds);
  const summary = createRecalculateOldSqliteSummary({
    dryRun,
    target_league_ids: targetLeagueIds,
    existing_contribution_rows_before: existingContributionRowsBefore,
    rows_to_delete: existingContributionRowsBefore,
    rows_to_insert: rowsToInsert,
    inserted_rows: insertedRows,
    touched_player_count: touchedRows.touched_player_count,
    touched_match_count: touchedRows.touched_match_count,
    touched_participation_count: touchedRows.touched_participation_count,
  });
  const byLeagueRows = await buildLeagueCsvRows(tx, targetLeagueIds);
  writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
  writeCsv(byLeagueCsvPath, byLeagueRows, ["league_id", "league_slug", "league_name", "contribution_rows", "players", "matches", "games_played", "wins", "draws", "losses"]);
  return summary;
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const dryRun = !isOldSqliteRecalculationEnabled(process.env.RECALCULATE_OLD_SQLITE_CONTRIBUTIONS);
  const targetLeagueIds = parseTargetLeagueIds(undefined);
  mkdirSync(outputDir, { recursive: true });

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  let summary: RecalculateOldSqliteSummary | null = null;

  try {
    if (dryRun) {
      try {
        await sql.begin("read only", async (tx) => {
          summary = await runRecalculation(tx, targetLeagueIds, true);
          throw rollbackDryRun;
        });
      } catch (error) {
        if (error !== rollbackDryRun) throw error;
      }
    } else {
      await sql.begin(async (tx) => {
        summary = await runRecalculation(tx, targetLeagueIds, false);
      });
    }
  } finally {
    await sql.end({ timeout: 5 });
  }

  console.log("Old SQLite contribution recalculation summary:");
  console.log(JSON.stringify(summary, null, 2));
  console.log(`Wrote ${summaryPath}`);
  console.log(`Wrote ${byLeagueCsvPath}`);
  if (dryRun) console.log('Dry-run only. Set RECALCULATE_OLD_SQLITE_CONTRIBUTIONS=true to delete and rebuild player_contributions period="all" rows for league ids 1..8.');
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`recalculate:old-sqlite-contributions failed: ${message}`);
  process.exitCode = 1;
});
