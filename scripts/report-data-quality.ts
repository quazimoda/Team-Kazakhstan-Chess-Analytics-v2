import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import postgres, { type Sql } from "postgres";
import { buildNormalizedDuplicateGameKeyRows, formatCsv, summarizeSuspiciousRows, type GameKeySourceRow } from "../src/lib/import/dataQualityReport";
import { normalizedGameKeys } from "../src/lib/import/oldSqliteOfficial";

const outputDir = "old-db-import-output";
const reportPath = `${outputDir}/data_quality_report.json`;
const byLeagueCsvPath = `${outputDir}/data_quality_by_league.csv`;
const topPlayersCsvPath = `${outputDir}/data_quality_top_players.csv`;
const suspiciousRowsCsvPath = `${outputDir}/data_quality_suspicious_rows.csv`;
const targetLeagueIds = [1, 2, 3, 4, 5, 6, 7, 8];

type QuerySql = Sql | postgres.TransactionSql;
type GlobalSummaryRow = {
  total_games: number;
  old_sqlite_games: number;
  total_players: number;
  total_matches: number;
  official_matches: number;
  total_match_participations: number;
  total_player_contributions: number;
  earliest_game_end_time: Date | null;
  latest_game_end_time: Date | null;
};
type LeagueQualityRow = {
  league_id: number;
  league_slug: string;
  league_name: string;
  official_matches: number;
  games: number;
  old_sqlite_games: number;
  players: number;
  participations: number;
  contribution_rows: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  win_rate: string;
};
type TopPlayerRow = {
  league_id: number;
  league_slug: string;
  league_name: string;
  rank: number;
  username: string;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  win_rate: string;
  contribution_score: string;
  last_played_at: Date | null;
};
type SuspiciousRow = {
  check_type: string;
  row_id: string;
  normalized_key: string | null;
  occurrence_count: number;
  league_id: number | null;
  match_id: number | null;
  player_id: number | null;
  chesscom_game_uuid: string | null;
  detail: string;
};
type DataQualityReport = {
  generated_at: string;
  target_league_ids: number[];
  global: GlobalSummaryRow;
  by_league: LeagueQualityRow[];
  top_players: TopPlayerRow[];
  suspicious_counts: Record<string, number>;
  suspicious_rows: SuspiciousRow[];
};

function requiredEnv(name: "DATABASE_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function oldSqlitePredicate(sql: QuerySql) {
  return sql`(
    raw_game->>'source' = 'old_sqlite'
    or (jsonb_typeof(raw_game) = 'string' and raw_game #>> '{}' like '%old_sqlite%')
  )`;
}

function writeCsv<T extends Record<string, unknown>>(path: string, rows: T[], columns: (keyof T)[]) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, formatCsv(rows, columns), "utf8");
}

async function buildGlobalSummary(sql: QuerySql) {
  const rows = await sql<GlobalSummaryRow[]>`
    select
      (select count(*)::int from games) as total_games,
      (select count(*)::int from games where ${oldSqlitePredicate(sql)}) as old_sqlite_games,
      (select count(*)::int from players) as total_players,
      (select count(*)::int from matches) as total_matches,
      (select count(*)::int from matches where is_official = 1) as official_matches,
      (select count(*)::int from match_participations) as total_match_participations,
      (select count(*)::int from player_contributions) as total_player_contributions,
      (select min(end_time) from games) as earliest_game_end_time,
      (select max(end_time) from games) as latest_game_end_time
  `;
  return rows[0] ?? {
    total_games: 0,
    old_sqlite_games: 0,
    total_players: 0,
    total_matches: 0,
    official_matches: 0,
    total_match_participations: 0,
    total_player_contributions: 0,
    earliest_game_end_time: null,
    latest_game_end_time: null,
  };
}

async function buildLeagueRows(sql: QuerySql) {
  return sql<LeagueQualityRow[]>`
    with match_totals as (
      select
        league_id,
        count(*) filter (where is_official = 1)::int as official_matches
      from matches
      where league_id = any(${targetLeagueIds})
      group by league_id
    ), game_totals as (
      select
        m.league_id,
        count(g.id)::int as games,
        count(g.id) filter (where ${oldSqlitePredicate(sql)})::int as old_sqlite_games
      from games g
      inner join matches m on m.id = g.match_id
      where m.league_id = any(${targetLeagueIds})
      group by m.league_id
    ), participation_totals as (
      select
        m.league_id,
        count(*)::int as participations,
        count(distinct mp.player_id)::int as players
      from match_participations mp
      inner join matches m on m.id = mp.match_id
      where m.is_official = 1
        and m.league_id = any(${targetLeagueIds})
      group by m.league_id
    ), contribution_totals as (
      select
        league_id,
        count(*)::int as contribution_rows,
        coalesce(sum(games_played), 0)::int as games_played,
        coalesce(sum(wins), 0)::int as wins,
        coalesce(sum(draws), 0)::int as draws,
        coalesce(sum(losses), 0)::int as losses
      from player_contributions
      where period = 'all'
        and league_id = any(${targetLeagueIds})
      group by league_id
    )
    select
      l.id::int as league_id,
      l.slug as league_slug,
      l.name as league_name,
      coalesce(mt.official_matches, 0)::int as official_matches,
      coalesce(gt.games, 0)::int as games,
      coalesce(gt.old_sqlite_games, 0)::int as old_sqlite_games,
      coalesce(pt.players, 0)::int as players,
      coalesce(pt.participations, 0)::int as participations,
      coalesce(ct.contribution_rows, 0)::int as contribution_rows,
      coalesce(ct.games_played, 0)::int as games_played,
      coalesce(ct.wins, 0)::int as wins,
      coalesce(ct.draws, 0)::int as draws,
      coalesce(ct.losses, 0)::int as losses,
      case when coalesce(ct.games_played, 0) = 0 then '0.00' else to_char(round((ct.wins::numeric / ct.games_played) * 100, 2), 'FM999999990.00') end as win_rate
    from leagues l
    left join match_totals mt on mt.league_id = l.id
    left join game_totals gt on gt.league_id = l.id
    left join participation_totals pt on pt.league_id = l.id
    left join contribution_totals ct on ct.league_id = l.id
    where l.id = any(${targetLeagueIds})
    order by l.id
  `;
}

async function buildTopPlayerRows(sql: QuerySql) {
  return sql<TopPlayerRow[]>`
    select
      ranked.league_id::int as league_id,
      ranked.league_slug,
      ranked.league_name,
      ranked.rank::int as rank,
      ranked.username,
      ranked.games_played::int as games_played,
      ranked.wins::int as wins,
      ranked.draws::int as draws,
      ranked.losses::int as losses,
      ranked.win_rate,
      ranked.contribution_score,
      ranked.last_played_at
    from (
      select
        pc.league_id,
        l.slug as league_slug,
        l.name as league_name,
        row_number() over (partition by pc.league_id order by pc.contribution_score desc, pc.games_played desc, lower(p.username)) as rank,
        p.username,
        pc.games_played,
        pc.wins,
        pc.draws,
        pc.losses,
        to_char(pc.win_rate, 'FM999999990.00') as win_rate,
        to_char(pc.contribution_score, 'FM999999990.00') as contribution_score,
        pc.last_played_at
      from player_contributions pc
      inner join players p on p.id = pc.player_id
      inner join leagues l on l.id = pc.league_id
      where pc.period = 'all'
        and pc.league_id = any(${targetLeagueIds})
    ) ranked
    where ranked.rank <= 20
    order by ranked.league_id, ranked.rank
  `;
}

async function buildSuspiciousRows(sql: QuerySql) {
  return sql<SuspiciousRow[]>`
    select * from (
      select
        'old_sqlite_non_official_match' as check_type,
        g.id::text as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        m.league_id::int as league_id,
        g.match_id::int as match_id,
        null::int as player_id,
        g.chesscom_game_uuid,
        concat('match_is_official=', coalesce(m.is_official::text, 'missing_match')) as detail
      from games g
      left join matches m on m.id = g.match_id
      where ${oldSqlitePredicate(sql)}
        and (m.id is null or m.is_official <> 1)

      union all

      select
        'old_sqlite_null_league' as check_type,
        g.id::text as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        m.league_id::int as league_id,
        g.match_id::int as match_id,
        null::int as player_id,
        g.chesscom_game_uuid,
        'old_sqlite game is attached to a match with null league_id' as detail
      from games g
      left join matches m on m.id = g.match_id
      where ${oldSqlitePredicate(sql)}
        and m.league_id is null

      union all

      select
        'game_null_match_id' as check_type,
        g.id::text as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        null::int as league_id,
        g.match_id::int as match_id,
        null::int as player_id,
        g.chesscom_game_uuid,
        'game has null match_id' as detail
      from games g
      where g.match_id is null

      union all

      select
        'match_participation_missing_player' as check_type,
        concat(mp.match_id, ':', mp.player_id) as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        m.league_id::int as league_id,
        mp.match_id::int as match_id,
        mp.player_id::int as player_id,
        null::text as chesscom_game_uuid,
        'match_participations.player_id has no matching players row' as detail
      from match_participations mp
      left join players p on p.id = mp.player_id
      left join matches m on m.id = mp.match_id
      where p.id is null

      union all

      select
        'player_contribution_zero_games_all' as check_type,
        pc.id::text as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        pc.league_id::int as league_id,
        null::int as match_id,
        pc.player_id::int as player_id,
        null::text as chesscom_game_uuid,
        'player_contributions games_played = 0 and period = all' as detail
      from player_contributions pc
      where pc.period = 'all'
        and pc.games_played = 0

      union all

      select
        'player_contribution_target_league_non_all_period' as check_type,
        pc.id::text as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        pc.league_id::int as league_id,
        null::int as match_id,
        pc.player_id::int as player_id,
        null::text as chesscom_game_uuid,
        concat('period=', pc.period) as detail
      from player_contributions pc
      where pc.league_id = any(${targetLeagueIds})
        and pc.period <> 'all'

      union all

      select
        'duplicate_chesscom_game_uuid' as check_type,
        duplicate_values.chesscom_game_uuid as row_id,
        null::text as normalized_key,
        duplicate_values.occurrence_count::int as occurrence_count,
        null::int as league_id,
        null::int as match_id,
        null::int as player_id,
        duplicate_values.chesscom_game_uuid,
        'duplicate chesscom_game_uuid value' as detail
      from (
        select chesscom_game_uuid, count(*)::int as occurrence_count
        from games
        group by chesscom_game_uuid
        having count(*) > 1
      ) duplicate_values

      union all

      select
        'old_sqlite_raw_game_not_object' as check_type,
        g.id::text as row_id,
        null::text as normalized_key,
        1::int as occurrence_count,
        m.league_id::int as league_id,
        g.match_id::int as match_id,
        null::int as player_id,
        g.chesscom_game_uuid,
        concat('raw_game_type=', coalesce(jsonb_typeof(g.raw_game), 'null')) as detail
      from games g
      left join matches m on m.id = g.match_id
      where ${oldSqlitePredicate(sql)}
        and jsonb_typeof(g.raw_game) <> 'object'
    ) suspicious
    order by check_type, row_id
  `;
}

async function buildNormalizedDuplicateRows(sql: QuerySql) {
  const rows = await sql<GameKeySourceRow[]>`
    select
      id::int as game_id,
      chesscom_game_uuid,
      raw_game->>'url' as raw_url,
      raw_game->>'game_url' as raw_game_url,
      raw_game->>'link' as raw_link
    from games
    where chesscom_game_uuid is not null
      or raw_game ?| array['url', 'game_url', 'link']
    order by id
  `;

  return buildNormalizedDuplicateGameKeyRows(rows, normalizedGameKeys);
}

async function buildReport(sql: QuerySql): Promise<DataQualityReport> {
  const global = await buildGlobalSummary(sql);
  const byLeague = await buildLeagueRows(sql);
  const topPlayers = await buildTopPlayerRows(sql);
  const suspiciousRows = [...await buildSuspiciousRows(sql), ...await buildNormalizedDuplicateRows(sql)]
    .sort((left, right) => left.check_type.localeCompare(right.check_type) || left.row_id.localeCompare(right.row_id));

  return {
    generated_at: new Date().toISOString(),
    target_league_ids: targetLeagueIds,
    global,
    by_league: byLeague,
    top_players: topPlayers,
    suspicious_counts: summarizeSuspiciousRows(suspiciousRows),
    suspicious_rows: suspiciousRows,
  };
}

async function main() {
  const databaseUrl = requiredEnv("DATABASE_URL");
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  let report: DataQualityReport;

  try {
    report = await sql.begin("read only", async (tx) => buildReport(tx));
  } finally {
    await sql.end({ timeout: 5 });
  }

  mkdirSync(outputDir, { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  writeCsv(byLeagueCsvPath, report.by_league, ["league_id", "league_slug", "league_name", "official_matches", "games", "old_sqlite_games", "players", "participations", "contribution_rows", "games_played", "wins", "draws", "losses", "win_rate"]);
  writeCsv(topPlayersCsvPath, report.top_players, ["league_id", "league_slug", "league_name", "rank", "username", "games_played", "wins", "draws", "losses", "win_rate", "contribution_score", "last_played_at"]);
  writeCsv(suspiciousRowsCsvPath, report.suspicious_rows, ["check_type", "row_id", "normalized_key", "occurrence_count", "league_id", "match_id", "player_id", "chesscom_game_uuid", "detail"]);

  console.log("Post-import data quality summary:");
  console.log(JSON.stringify({ global: report.global, suspicious_counts: report.suspicious_counts }, null, 2));
  console.log(`Wrote ${reportPath}`);
  console.log(`Wrote ${byLeagueCsvPath}`);
  console.log(`Wrote ${topPlayersCsvPath}`);
  console.log(`Wrote ${suspiciousRowsCsvPath}`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`report:data-quality failed: ${message}`);
  process.exitCode = 1;
});
