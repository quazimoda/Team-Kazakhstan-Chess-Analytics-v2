import { createWriteStream, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import postgres, { type Sql } from "postgres";
import {
  bestSourceId,
  choosePythonCommand,
  evaluateCandidateEligibility,
  executeImportPlan,
  extractPgnTags,
  isImportEnabled,
  shouldRecalculateContributions,
  normalizedGameKeys,
  parseEndTime,
  parseRating,
  resultForColor,
  scoreForResult,
  type CurrentMatchForImport,
  type OldSqliteGameRow,
  type PgnTags,
} from "../src/lib/import/oldSqliteOfficial";

type SqliteMessage = { type: "meta"; total_old_games: number } | ({ type: "row" } & OldSqliteGameRow);

type ImportCandidate = {
  row: OldSqliteGameRow;
  tags: PgnTags;
  match: CurrentMatchForImport;
  sourceId: string;
};

type PlayerRow = { id: number; username: string; is_team_member: number };

type ParticipationAggregate = {
  matchId: number;
  playerId: number;
  boardNumber: number | null;
  score: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  avgOpponentRatingTotal: number;
  avgOpponentRatingGames: number;
  lastPlayedAt: Date | null;
};

const outputDir = "old-db-import-output";

function requiredEnv(name: "OLD_SQLITE_PATH" | "DATABASE_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function csvEscape(value: unknown) {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

function writeCsv<T extends Record<string, unknown>>(path: string, rows: T[], columns: (keyof T)[]) {
  mkdirSync(dirname(path), { recursive: true });
  const stream = createWriteStream(path, { encoding: "utf8" });
  stream.write(`${columns.join(",")}\n`);
  for (const row of rows) stream.write(`${columns.map((column) => csvEscape(row[column])).join(",")}\n`);
  stream.end();
}

function commandExists(command: "python3" | "python") {
  const result = spawnSync(command, ["--version"], { stdio: "ignore" });
  return !result.error && result.status === 0;
}

async function* oldSqliteRows(sqlitePath: string): AsyncGenerator<SqliteMessage> {
  const pythonCommand = choosePythonCommand(commandExists);
  const python = spawn(pythonCommand, ["-", sqlitePath], { stdio: ["pipe", "pipe", "inherit"] });
  python.stdin.end(String.raw`
import json
import sqlite3
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except AttributeError:
    pass

path = sys.argv[1]
uri = "file:" + path + "?mode=ro"
connection = sqlite3.connect(uri, uri=True)
connection.row_factory = sqlite3.Row
try:
    total = connection.execute("select count(*) as count from games").fetchone()["count"]
    print(json.dumps({"type": "meta", "total_old_games": total}), flush=True)
    query = """
      select game_url, date, time_class, time_control, rules, player, opponent, result, pgn, is_tournament, tournament_url
      from games
      where pgn is not null
        and pgn like '%[Match "https://www.chess.com/club/matches/%'
    """
    for row in connection.execute(query):
        payload = dict(row)
        payload["type"] = "row"
        print(json.dumps(payload, ensure_ascii=False), flush=True)
finally:
    connection.close()
`);

  let buffer = "";
  python.stdout.setEncoding("utf8");
  for await (const chunk of python.stdout) {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as SqliteMessage;
      newline = buffer.indexOf("\n");
    }
  }
  const trailing = buffer.trim();
  if (trailing) yield JSON.parse(trailing) as SqliteMessage;

  const [code] = (await once(python, "close")) as [number];
  if (code !== 0) throw new Error(`SQLite reader exited with code ${code}.`);
}

async function loadCurrentState(sql: Sql) {
  const matchRows = await sql<{
    id: number;
    chesscom_match_id: number;
    is_official: number;
    league_id: number | null;
    league_slug: string | null;
  }[]>`
    select m.id, m.chesscom_match_id, m.is_official, m.league_id, l.slug as league_slug
    from matches m
    left join leagues l on l.id = m.league_id
    where m.chesscom_match_id is not null
  `;
  const gameRows = await sql<{
    chesscom_game_uuid: string | null;
    raw_url: string | null;
    raw_game_url: string | null;
    raw_link: string | null;
  }[]>`
    select
      chesscom_game_uuid,
      raw_game->>'url' as raw_url,
      raw_game->>'game_url' as raw_game_url,
      raw_game->>'link' as raw_link
    from games
    where chesscom_game_uuid is not null
      or raw_game ?| array['url', 'game_url', 'link']
  `;
  const matchesByChesscomId = new Map<number, CurrentMatchForImport>();
  for (const row of matchRows) {
    matchesByChesscomId.set(Number(row.chesscom_match_id), {
      id: row.id,
      chesscomMatchId: Number(row.chesscom_match_id),
      isOfficial: row.is_official === 1,
      leagueId: row.league_id,
      leagueSlug: row.league_slug,
    });
  }
  const existingGameKeys = new Set<string>();
  for (const row of gameRows) {
    for (const key of normalizedGameKeys(row.chesscom_game_uuid, row.raw_url, row.raw_game_url, row.raw_link)) existingGameKeys.add(key);
  }
  return { matchesByChesscomId, existingGameKeys };
}

async function columnExists(sql: Sql, tableName: string, columnName: string) {
  const rows = await sql<{ exists: boolean }[]>`
    select exists (
      select 1
      from information_schema.columns
      where table_schema = current_schema()
        and table_name = ${tableName}
        and column_name = ${columnName}
    ) as exists
  `;
  return rows[0]?.exists === true;
}

async function upsertPlayer(sql: Sql, username: string, rating: number | null, rawProfile: unknown) {
  const normalized = username.trim();
  const [existing] = await sql<PlayerRow[]>`
    select id, username, is_team_member
    from players
    where lower(username) = lower(${normalized})
    limit 1
  `;
  if (existing) return existing;

  const [inserted] = await sql<PlayerRow[]>`
    insert into players (username, chesscom_url, current_rating, raw_profile, first_seen_source, last_seen_at, created_at, updated_at)
    values (${normalized}, ${`https://www.chess.com/member/${encodeURIComponent(normalized)}`}, ${rating}, ${sql.json(rawProfile as any)}, 'old_sqlite', now(), now(), now())
    returning id, username, is_team_member
  `;
  return inserted;
}

function addParticipation(aggregates: Map<string, ParticipationAggregate>, candidate: ImportCandidate, player: PlayerRow, color: "white" | "black") {
  if (player.is_team_member !== 1) return false;
  const result = resultForColor(candidate.tags.result, color);
  const key = `${candidate.match.id}:${player.id}`;
  const existing = aggregates.get(key) ?? {
    matchId: candidate.match.id,
    playerId: player.id,
    boardNumber: null,
    score: 0,
    gamesPlayed: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    avgOpponentRatingTotal: 0,
    avgOpponentRatingGames: 0,
    lastPlayedAt: null,
  };
  existing.gamesPlayed += 1;
  existing.score += scoreForResult(result);
  if (result === "win") existing.wins += 1;
  if (result === "draw") existing.draws += 1;
  if (result === "loss") existing.losses += 1;
  const opponentRating = color === "white" ? parseRating(candidate.tags.blackElo) : parseRating(candidate.tags.whiteElo);
  if (opponentRating != null) {
    existing.avgOpponentRatingTotal += opponentRating;
    existing.avgOpponentRatingGames += 1;
  }
  const endTime = parseEndTime(candidate.tags);
  if (endTime && (!existing.lastPlayedAt || endTime > existing.lastPlayedAt)) existing.lastPlayedAt = endTime;
  aggregates.set(key, existing);
  return true;
}

async function importCandidate(sql: Sql, candidate: ImportCandidate, options: { supportsWhiteRating: boolean; supportsBlackRating: boolean; supportsResult: boolean }) {
  const white = candidate.tags.white ? await upsertPlayer(sql, candidate.tags.white, parseRating(candidate.tags.whiteElo), { username: candidate.tags.white, source: "old_sqlite", color: "white" }) : null;
  const black = candidate.tags.black ? await upsertPlayer(sql, candidate.tags.black, parseRating(candidate.tags.blackElo), { username: candidate.tags.black, source: "old_sqlite", color: "black" }) : null;
  const rawGame = {
    source: "old_sqlite",
    url: candidate.sourceId,
    game_url: candidate.row.game_url,
    link: candidate.tags.link,
    old_game_url: candidate.row.game_url,
    old_date: candidate.row.date,
    old_time_class: candidate.row.time_class,
    old_time_control: candidate.row.time_control,
    old_rules: candidate.row.rules,
    old_player: candidate.row.player,
    old_opponent: candidate.row.opponent,
    old_result: candidate.row.result,
    is_tournament: candidate.row.is_tournament ?? null,
    tournament_url: candidate.row.tournament_url ?? null,
    pgn_tags: candidate.tags,
  };
  const endTime = parseEndTime(candidate.tags);
  const columns = ["chesscom_game_uuid", "match_id", "white_player_id", "black_player_id", "time_class", "rated", "pgn", "end_time", "raw_game"];
  const values: unknown[] = [candidate.sourceId, candidate.match.id, white?.id ?? null, black?.id ?? null, candidate.row.time_class, 1, candidate.row.pgn, endTime, JSON.stringify(rawGame)];
  if (options.supportsResult) {
    columns.push("result");
    values.push(candidate.tags.result === "1/2-1/2" ? "draw" : candidate.tags.result === "1-0" ? "win" : candidate.tags.result === "0-1" ? "loss" : "unknown");
  }
  if (options.supportsWhiteRating) {
    columns.push("white_rating");
    values.push(parseRating(candidate.tags.whiteElo));
  }
  if (options.supportsBlackRating) {
    columns.push("black_rating");
    values.push(parseRating(candidate.tags.blackElo));
  }
  const placeholders = columns.map((column, index) => (column === "raw_game" ? `$${index + 1}::jsonb` : `$${index + 1}`));
  await sql.unsafe(`insert into games (${columns.map((column) => `"${column}"`).join(", ")}) values (${placeholders.join(", ")})`, values as any[]);
  return { white, black };
}

async function upsertParticipations(sql: Sql, aggregates: Map<string, ParticipationAggregate>) {
  for (const participation of aggregates.values()) {
    const avgOpponentRating = participation.avgOpponentRatingGames ? Math.round(participation.avgOpponentRatingTotal / participation.avgOpponentRatingGames) : null;
    await sql`
      insert into match_participations (
        match_id, player_id, board_number, score, games_played, wins, draws, losses,
        timeout_losses, upset_wins, avg_opponent_rating, last_played_at, created_at
      )
      values (
        ${participation.matchId}, ${participation.playerId}, ${participation.boardNumber}, ${participation.score.toFixed(2)}, ${participation.gamesPlayed},
        ${participation.wins}, ${participation.draws}, ${participation.losses}, 0, 0, ${avgOpponentRating}, ${participation.lastPlayedAt}, now()
      )
      on conflict (match_id, player_id) do update set
        score = match_participations.score + excluded.score,
        games_played = match_participations.games_played + excluded.games_played,
        wins = match_participations.wins + excluded.wins,
        draws = match_participations.draws + excluded.draws,
        losses = match_participations.losses + excluded.losses,
        avg_opponent_rating = case
          when match_participations.avg_opponent_rating is null then excluded.avg_opponent_rating
          when excluded.avg_opponent_rating is null then match_participations.avg_opponent_rating
          else round(((match_participations.avg_opponent_rating * match_participations.games_played) + (excluded.avg_opponent_rating * excluded.games_played)) / nullif(match_participations.games_played + excluded.games_played, 0))::int
        end,
        last_played_at = greatest(match_participations.last_played_at, excluded.last_played_at),
        board_number = coalesce(match_participations.board_number, excluded.board_number)
    `;
  }
}

async function recalculateContributions(sql: Sql, leagueIds: number[]) {
  if (leagueIds.length === 0) return 0;
  await sql`delete from player_contributions where period = 'all' and league_id = any(${leagueIds})`;
  const inserted = await sql<{ count: number }[]>`
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
        round(sum(mp.avg_opponent_rating * mp.games_played) / nullif(sum(mp.games_played), 0))::int as avg_opponent_rating,
        max(coalesce(mp.last_played_at, m.ends_at, m.starts_at)) as last_played_at
      from match_participations mp
      inner join matches m on m.id = mp.match_id
      where m.is_official = 1
        and m.league_id = any(${leagueIds})
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
  return inserted[0]?.count ?? 0;
}

function candidateLog(candidate: ImportCandidate, status: string) {
  return {
    status,
    source_id: candidate.sourceId,
    old_game_url: candidate.row.game_url,
    pgn_link: candidate.tags.link,
    chesscom_match_id: candidate.tags.chesscomMatchId,
    match_id: candidate.match.id,
    league_slug: candidate.match.leagueSlug ?? "",
    white: candidate.tags.white,
    black: candidate.tags.black,
    result: candidate.tags.result,
    rules: candidate.row.rules,
  };
}

async function main() {
  const sqlitePath = resolve(requiredEnv("OLD_SQLITE_PATH"));
  if (!existsSync(sqlitePath)) throw new Error(`OLD_SQLITE_PATH does not exist: ${sqlitePath}`);
  const databaseUrl = requiredEnv("DATABASE_URL");
  const dryRun = !isImportEnabled(process.env.IMPORT_OLD_SQLITE);
  const recalculateAfterImport = shouldRecalculateContributions(dryRun, process.env.RECALCULATE_AFTER_IMPORT);
  mkdirSync(outputDir, { recursive: true });

  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  const importedLogs: Record<string, unknown>[] = [];
  const skippedDuplicates: Record<string, unknown>[] = [];
  const skippedUnmatched: Record<string, unknown>[] = [];
  const skippedNonOfficial: Record<string, unknown>[] = [];

  const summary = {
    mode: dryRun ? "dry-run" : "import",
    scanned_old_games: 0,
    old_games_with_match_tag: 0,
    matched_official_games: 0,
    imported_games: 0,
    skipped_duplicates: 0,
    skipped_unmatched: 0,
    skipped_non_official: 0,
    skipped_invalid_rules: 0,
    skipped_missing_source_id: 0,
    players_upserted: 0,
    participations_upserted: 0,
    contributions_recalculated: 0 as number | null,
    recalculation_required: false,
    recalculate_after_import: recalculateAfterImport,
    recalculated_league_ids: [] as number[],
  };

  try {
    if (dryRun) await sql`begin read only`;
    else await sql`begin`;

    const { matchesByChesscomId, existingGameKeys } = await loadCurrentState(sql);
    const candidates: ImportCandidate[] = [];

    for await (const message of oldSqliteRows(sqlitePath)) {
      if (message.type === "meta") {
        summary.scanned_old_games = message.total_old_games;
        continue;
      }
      const tags = extractPgnTags(message.pgn);
      if (tags) summary.old_games_with_match_tag += 1;
      const evaluation = evaluateCandidateEligibility(message, matchesByChesscomId, existingGameKeys);
      if (evaluation.match?.isOfficial && evaluation.match.leagueId != null) summary.matched_official_games += 1;

      if (evaluation.reason === "candidate" && evaluation.tags && evaluation.match) {
        const sourceId = bestSourceId(message, evaluation.tags);
        if (!sourceId) {
          summary.skipped_missing_source_id += 1;
          continue;
        }
        const candidate = { row: message, tags: evaluation.tags, match: evaluation.match, sourceId };
        candidates.push(candidate);
        for (const key of normalizedGameKeys(sourceId, message.game_url, evaluation.tags.link)) existingGameKeys.add(key);
      } else if (evaluation.reason === "duplicate") {
        summary.skipped_duplicates += 1;
        skippedDuplicates.push({ old_game_url: message.game_url, pgn_link: evaluation.tags?.link, duplicate_keys: evaluation.duplicateKeys.join(" | "), chesscom_match_id: evaluation.tags?.chesscomMatchId, match_id: evaluation.match?.id ?? null });
      } else if (evaluation.reason === "unmatched") {
        summary.skipped_unmatched += 1;
        skippedUnmatched.push({ old_game_url: message.game_url, pgn_link: evaluation.tags?.link, chesscom_match_id: evaluation.tags?.chesscomMatchId, event: evaluation.tags?.event });
      } else if (evaluation.reason === "non_official") {
        summary.skipped_non_official += 1;
        skippedNonOfficial.push({ old_game_url: message.game_url, pgn_link: evaluation.tags?.link, chesscom_match_id: evaluation.tags?.chesscomMatchId, match_id: evaluation.match?.id ?? null, is_official: evaluation.match?.isOfficial ?? null, league_id: evaluation.match?.leagueId ?? null });
      } else if (evaluation.reason === "invalid_rules") {
        summary.skipped_invalid_rules += 1;
      }
    }

    console.log("Old SQLite official import preflight summary:");
    console.log(JSON.stringify({ ...summary, candidate_games: candidates.length }, null, 2));

    const supportsWhiteRating = await columnExists(sql, "games", "white_rating");
    const supportsBlackRating = await columnExists(sql, "games", "black_rating");
    const supportsResult = await columnExists(sql, "games", "result");
    const playerIds = new Set<number>();
    const importedLeagueIds = new Set<number>();
    const participationAggregates = new Map<string, ParticipationAggregate>();

    await executeImportPlan({
      dryRun,
      candidates,
      writeCandidate: async (candidate) => {
        const players = await importCandidate(sql, candidate, { supportsWhiteRating, supportsBlackRating, supportsResult });
        if (players.white) {
          playerIds.add(players.white.id);
          if (addParticipation(participationAggregates, candidate, players.white, "white")) {
            // Participation is counted after aggregate upsert to avoid per-game double-counting.
          }
        }
        if (players.black) {
          playerIds.add(players.black.id);
          addParticipation(participationAggregates, candidate, players.black, "black");
        }
        if (candidate.match.leagueId != null) importedLeagueIds.add(candidate.match.leagueId);
        summary.imported_games += 1;
        importedLogs.push(candidateLog(candidate, "imported"));
      },
    });

    if (!dryRun) {
      await upsertParticipations(sql, participationAggregates);
      summary.players_upserted = playerIds.size;
      summary.participations_upserted = participationAggregates.size;
      summary.recalculated_league_ids = [...importedLeagueIds].sort((a, b) => a - b);
      if (recalculateAfterImport) {
        summary.contributions_recalculated = await recalculateContributions(sql, summary.recalculated_league_ids);
        summary.recalculation_required = false;
      } else {
        summary.contributions_recalculated = null;
        summary.recalculation_required = summary.imported_games > 0;
      }
    } else {
      summary.imported_games = 0;
      summary.players_upserted = 0;
      summary.participations_upserted = 0;
      summary.contributions_recalculated = null;
      summary.recalculation_required = false;
      for (const candidate of candidates) importedLogs.push(candidateLog(candidate, "dry_run_candidate"));
    }

    if (dryRun) await sql`rollback`;
    else await sql`commit`;
  } catch (error) {
    try {
      await sql`rollback`;
    } catch {
      // Preserve the original error.
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }

  writeCsv(`${outputDir}/imported_games.csv`, importedLogs, ["status", "source_id", "old_game_url", "pgn_link", "chesscom_match_id", "match_id", "league_slug", "white", "black", "result", "rules"]);
  writeCsv(`${outputDir}/skipped_duplicates.csv`, skippedDuplicates, ["old_game_url", "pgn_link", "duplicate_keys", "chesscom_match_id", "match_id"]);
  writeCsv(`${outputDir}/skipped_unmatched.csv`, skippedUnmatched, ["old_game_url", "pgn_link", "chesscom_match_id", "event"]);
  writeCsv(`${outputDir}/skipped_non_official.csv`, skippedNonOfficial, ["old_game_url", "pgn_link", "chesscom_match_id", "match_id", "is_official", "league_id"]);
  writeFileSync(`${outputDir}/import_summary.json`, `${JSON.stringify(summary, null, 2)}\n`);

  console.log("Old SQLite official import final summary:");
  console.log(JSON.stringify(summary, null, 2));
  if (dryRun) console.log('Dry-run only. Set IMPORT_OLD_SQLITE=true to write imported games and participations. Set RECALCULATE_AFTER_IMPORT=true with import mode to recalculate affected official league contribution rows in the same transaction.');
  else if (summary.recalculation_required) console.log(`Contribution recalculation was not run. Run the existing admin recalculation endpoint or rerun this importer against a restored pre-import backup with RECALCULATE_AFTER_IMPORT=true. Affected league ids: ${summary.recalculated_league_ids.join(", ")}.`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`import:old-sqlite-official failed: ${message}`);
  process.exitCode = 1;
});
