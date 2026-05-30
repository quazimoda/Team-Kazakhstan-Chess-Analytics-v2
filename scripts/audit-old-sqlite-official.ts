import { createWriteStream, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import postgres from "postgres";

type OldGameRow = {
  game_url: string;
  date: number | null;
  time_class: string | null;
  time_control: string | null;
  rules: string | null;
  player: string | null;
  opponent: string | null;
  result: string | null;
  pgn: string | null;
  is_tournament: number | null;
  tournament_url: string | null;
};

type SqliteMessage = { type: "meta"; total_old_games: number } | ({ type: "row" } & OldGameRow);

type NewMatch = {
  id: number;
  chesscomMatchId: number;
  isOfficial: boolean;
  leagueId: number | null;
  matchName: string;
  opponent: string;
  leagueSlug: string | null;
  leagueName: string | null;
};

type ExtractedTags = {
  chesscomMatchId: number;
  event: string | null;
  white: string | null;
  black: string | null;
  pgnResult: string | null;
  whiteElo: string | null;
  blackElo: string | null;
  link: string | null;
  endDate: string | null;
  endTime: string | null;
};

type OfficialSample = OldGameRow & ExtractedTags & {
  newMatchId: number;
  newMatchName: string;
  leagueSlug: string;
  duplicate: boolean;
  candidate: boolean;
  year: string;
};

type NonOfficialSample = OldGameRow & ExtractedTags & {
  newMatchId: number;
  newMatchName: string;
  leagueSlug: string | null;
  isOfficial: boolean;
  hasLeague: boolean;
  duplicate: boolean;
};

type DuplicateRow = OldGameRow & ExtractedTags & {
  duplicateKeys: string;
  newMatchId: number | null;
  leagueSlug: string | null;
};

const OLD_MATCH_RE = /\[Match\s+"https:\/\/www\.chess\.com\/club\/matches\/(?:live\/)?(\d+)"\]/;
const TAGS = {
  event: /\[Event\s+"([^"]+)"\]/,
  white: /\[White\s+"([^"]+)"\]/,
  black: /\[Black\s+"([^"]+)"\]/,
  result: /\[Result\s+"([^"]+)"\]/,
  whiteElo: /\[WhiteElo\s+"([^"]+)"\]/,
  blackElo: /\[BlackElo\s+"([^"]+)"\]/,
  link: /\[Link\s+"([^"]+)"\]/,
  endDate: /\[EndDate\s+"([^"]+)"\]/,
  endTime: /\[EndTime\s+"([^"]+)"\]/,
};

const OUTPUT_DIR = "old-db-audit-output";
const SAMPLE_LIMIT = 500;

function requiredEnv(name: "OLD_SQLITE_PATH" | "DATABASE_URL") {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function extractTag(pgn: string, regex: RegExp) {
  return pgn.match(regex)?.[1] ?? null;
}

function extractTags(pgn: string): ExtractedTags | null {
  const matchId = extractTag(pgn, OLD_MATCH_RE);
  if (!matchId) return null;
  return {
    chesscomMatchId: Number(matchId),
    event: extractTag(pgn, TAGS.event),
    white: extractTag(pgn, TAGS.white),
    black: extractTag(pgn, TAGS.black),
    pgnResult: extractTag(pgn, TAGS.result),
    whiteElo: extractTag(pgn, TAGS.whiteElo),
    blackElo: extractTag(pgn, TAGS.blackElo),
    link: extractTag(pgn, TAGS.link),
    endDate: extractTag(pgn, TAGS.endDate),
    endTime: extractTag(pgn, TAGS.endTime),
  };
}

function normalizedGameKeys(...values: (string | null | undefined)[]) {
  const keys = new Set<string>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    keys.add(value);
    keys.add(value.replace(/\/$/, ""));
    keys.add(value.replace(/[?#].*$/, ""));
    keys.add(value.replace(/[?#].*$/, "").replace(/\/$/, ""));
    const numericId = value.match(/\/game\/(?:live|daily|daily960)\/(\d+)/i)?.[1] ?? value.match(/\/(\d+)(?:[/?#].*)?$/)?.[1];
    if (numericId) keys.add(numericId);
  }
  return [...keys];
}

function ruleIsImportable(rules: string | null) {
  const normalized = rules?.trim().toLowerCase();
  return normalized === "chess" || normalized === "chess960";
}

function inferYear(row: OldGameRow, tags: ExtractedTags) {
  const endDateYear = tags.endDate?.match(/^(\d{4})[.-]/)?.[1];
  if (endDateYear) return endDateYear;
  if (typeof row.date === "number") {
    const raw = String(row.date);
    if (/^(19|20)\d{6}$/.test(raw)) return raw.slice(0, 4);
    if (row.date > 1_000_000_000 && row.date < 4_000_000_000) return String(new Date(row.date * 1000).getUTCFullYear());
    if (row.date > 1_000_000_000_000 && row.date < 4_000_000_000_000) return String(new Date(row.date).getUTCFullYear());
  }
  return "unknown";
}

function increment<K>(map: Map<K, number>, key: K, by = 1) {
  map.set(key, (map.get(key) ?? 0) + by);
}

function csvEscape(value: unknown) {
  if (value == null) return "";
  const text = String(value);
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

async function loadNewMatchesAndGames(databaseUrl: string) {
  const sql = postgres(databaseUrl, { prepare: false, max: 1 });
  try {
    await sql`begin read only`;
    const matchRows = await sql<{
      id: number;
      chesscom_match_id: number;
      is_official: number;
      league_id: number | null;
      name: string;
      opponent: string;
      league_slug: string | null;
      league_name: string | null;
    }[]>`
      select
        m.id,
        m.chesscom_match_id,
        m.is_official,
        m.league_id,
        m.name,
        m.opponent,
        l.slug as league_slug,
        l.name as league_name
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
    await sql`rollback`;

    const matchesByChesscomId = new Map<number, NewMatch>();
    for (const row of matchRows) {
      matchesByChesscomId.set(Number(row.chesscom_match_id), {
        id: row.id,
        chesscomMatchId: Number(row.chesscom_match_id),
        isOfficial: row.is_official === 1,
        leagueId: row.league_id,
        matchName: row.name,
        opponent: row.opponent,
        leagueSlug: row.league_slug,
        leagueName: row.league_name,
      });
    }

    const existingGameKeys = new Set<string>();
    for (const row of gameRows) {
      for (const key of normalizedGameKeys(row.chesscom_game_uuid, row.raw_url, row.raw_game_url, row.raw_link)) existingGameKeys.add(key);
    }

    return { matchesByChesscomId, existingGameKeys };
  } catch (error) {
    try {
      await sql`rollback`;
    } catch {
      // Ignore rollback errors after failed read-only setup/query.
    }
    throw error;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function* oldSqliteRows(sqlitePath: string): AsyncGenerator<SqliteMessage> {
  const python = spawn("python3", ["-", sqlitePath], {
    stdio: ["pipe", "pipe", "inherit"],
  });
  python.stdin.end(String.raw`
import json
import sqlite3
import sys

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

async function main() {
  const sqlitePath = resolve(requiredEnv("OLD_SQLITE_PATH"));
  if (!existsSync(sqlitePath)) throw new Error(`OLD_SQLITE_PATH does not exist: ${sqlitePath}`);
  const databaseUrl = requiredEnv("DATABASE_URL");

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const { matchesByChesscomId, existingGameKeys } = await loadNewMatchesAndGames(databaseUrl);

  let totalOldGames = 0;
  let oldGamesWithMatchTag = 0;
  let gamesLinkedToOfficialMatches = 0;
  let gamesLinkedToNonOfficialMatches = 0;
  let duplicateGames = 0;
  let finalCandidateGames = 0;
  let invalidRuleMatchedOfficialGames = 0;

  const oldMatchIds = new Set<number>();
  const foundMatchIds = new Set<number>();
  const unmatchedOldMatchIds = new Set<number>();
  const unmatchedCounts = new Map<number, number>();
  const unmatchedEvents = new Map<string, number>();
  const officialMatchIdsByLeague = new Map<string, Set<number>>();
  const leagueRows = new Map<string, { league_slug: string; league_name: string; distinct_match_ids: number; linked_games: number; duplicate_games: number; candidate_games: number }>();
  const years = new Map<string, number>();
  const matchedOfficialSamples: OfficialSample[] = [];
  const nonOfficialSamples: NonOfficialSample[] = [];
  const duplicateRows: DuplicateRow[] = [];

  for await (const message of oldSqliteRows(sqlitePath)) {
    if (message.type === "meta") {
      totalOldGames = message.total_old_games;
      continue;
    }

    const tags = extractTags(message.pgn ?? "");
    if (!tags) continue;
    oldGamesWithMatchTag += 1;
    oldMatchIds.add(tags.chesscomMatchId);

    const newMatch = matchesByChesscomId.get(tags.chesscomMatchId);
    const year = inferYear(message, tags);
    const duplicateKeys = normalizedGameKeys(message.game_url, tags.link).filter((key) => existingGameKeys.has(key));
    const isDuplicate = duplicateKeys.length > 0;
    if (isDuplicate) duplicateGames += 1;

    if (!newMatch) {
      unmatchedOldMatchIds.add(tags.chesscomMatchId);
      increment(unmatchedCounts, tags.chesscomMatchId);
      increment(unmatchedEvents, tags.event ?? "(missing Event)");
      if (isDuplicate) {
        duplicateRows.push({ ...message, ...tags, duplicateKeys: duplicateKeys.join(" | "), newMatchId: null, leagueSlug: null });
      }
      continue;
    }

    foundMatchIds.add(tags.chesscomMatchId);
    const isOfficialWithLeague = newMatch.isOfficial && newMatch.leagueId != null;

    if (isDuplicate) {
      duplicateRows.push({ ...message, ...tags, duplicateKeys: duplicateKeys.join(" | "), newMatchId: newMatch.id, leagueSlug: newMatch.leagueSlug });
    }

    if (isOfficialWithLeague) {
      gamesLinkedToOfficialMatches += 1;
      const importableRule = ruleIsImportable(message.rules);
      if (!importableRule) invalidRuleMatchedOfficialGames += 1;
      const candidate = importableRule && !isDuplicate;
      if (candidate) {
        finalCandidateGames += 1;
        increment(years, year);
      }

      const leagueSlug = newMatch.leagueSlug ?? "(missing slug)";
      const row = leagueRows.get(leagueSlug) ?? { league_slug: leagueSlug, league_name: newMatch.leagueName ?? "", distinct_match_ids: 0, linked_games: 0, duplicate_games: 0, candidate_games: 0 };
      row.linked_games += 1;
      if (isDuplicate) row.duplicate_games += 1;
      if (candidate) row.candidate_games += 1;
      leagueRows.set(leagueSlug, row);
      const matchIds = officialMatchIdsByLeague.get(leagueSlug) ?? new Set<number>();
      matchIds.add(tags.chesscomMatchId);
      officialMatchIdsByLeague.set(leagueSlug, matchIds);

      if (matchedOfficialSamples.length < SAMPLE_LIMIT) {
        matchedOfficialSamples.push({ ...message, ...tags, newMatchId: newMatch.id, newMatchName: newMatch.matchName, leagueSlug, duplicate: isDuplicate, candidate, year });
      }
    } else {
      gamesLinkedToNonOfficialMatches += 1;
      if (nonOfficialSamples.length < SAMPLE_LIMIT) {
        nonOfficialSamples.push({ ...message, ...tags, newMatchId: newMatch.id, newMatchName: newMatch.matchName, leagueSlug: newMatch.leagueSlug, isOfficial: newMatch.isOfficial, hasLeague: newMatch.leagueId != null, duplicate: isDuplicate });
      }
    }
  }

  for (const [slug, matchIds] of officialMatchIdsByLeague) {
    const row = leagueRows.get(slug);
    if (row) row.distinct_match_ids = matchIds.size;
  }

  const matchedByLeague = [...leagueRows.values()].sort((a, b) => b.candidate_games - a.candidate_games || a.league_slug.localeCompare(b.league_slug));
  const unmatchedRows = [...unmatchedCounts.entries()]
    .map(([chesscom_match_id, old_games]) => ({ chesscom_match_id, old_games }))
    .sort((a, b) => b.old_games - a.old_games || a.chesscom_match_id - b.chesscom_match_id);
  const topUnmatchedEvents = [...unmatchedEvents.entries()]
    .map(([event, old_games]) => ({ event, old_games }))
    .sort((a, b) => b.old_games - a.old_games || a.event.localeCompare(b.event))
    .slice(0, 100);
  const yearBreakdown = [...years.entries()].map(([year, candidate_games]) => ({ year, candidate_games })).sort((a, b) => a.year.localeCompare(b.year));

  writeCsv(`${OUTPUT_DIR}/matched_official_games_sample.csv`, matchedOfficialSamples as unknown as Record<string, unknown>[], ["game_url", "date", "rules", "time_class", "chesscomMatchId", "event", "white", "black", "pgnResult", "whiteElo", "blackElo", "link", "endDate", "endTime", "newMatchId", "newMatchName", "leagueSlug", "duplicate", "candidate", "year"]);
  writeCsv(`${OUTPUT_DIR}/matched_by_league.csv`, matchedByLeague as unknown as Record<string, unknown>[], ["league_slug", "league_name", "distinct_match_ids", "linked_games", "duplicate_games", "candidate_games"]);
  writeCsv(`${OUTPUT_DIR}/unmatched_old_match_ids.csv`, unmatchedRows as unknown as Record<string, unknown>[], ["chesscom_match_id", "old_games"]);
  writeCsv(`${OUTPUT_DIR}/non_official_matched_games_sample.csv`, nonOfficialSamples as unknown as Record<string, unknown>[], ["game_url", "date", "rules", "time_class", "chesscomMatchId", "event", "white", "black", "pgnResult", "link", "newMatchId", "newMatchName", "leagueSlug", "isOfficial", "hasLeague", "duplicate"]);
  writeCsv(`${OUTPUT_DIR}/duplicate_games.csv`, duplicateRows as unknown as Record<string, unknown>[], ["game_url", "date", "rules", "time_class", "chesscomMatchId", "event", "white", "black", "pgnResult", "link", "duplicateKeys", "newMatchId", "leagueSlug"]);
  writeCsv(`${OUTPUT_DIR}/top_unmatched_events.csv`, topUnmatchedEvents as unknown as Record<string, unknown>[], ["event", "old_games"]);

  console.log(JSON.stringify({
    total_old_games: totalOldGames,
    old_games_with_match_club_matches: oldGamesWithMatchTag,
    distinct_old_match_ids: oldMatchIds.size,
    old_match_ids_found_in_new_matches: foundMatchIds.size,
    old_match_ids_not_found_in_new_matches: unmatchedOldMatchIds.size,
    games_linked_to_official_matches: gamesLinkedToOfficialMatches,
    games_linked_to_non_official_matches: gamesLinkedToNonOfficialMatches,
    duplicate_games_already_in_new_db: duplicateGames,
    invalid_rule_games_linked_to_official_matches: invalidRuleMatchedOfficialGames,
    final_candidate_games_for_import: finalCandidateGames,
    breakdown_by_league: matchedByLeague,
    breakdown_by_year: yearBreakdown,
    top_unmatched_event_names: topUnmatchedEvents.slice(0, 20),
    csv_output_dir: OUTPUT_DIR,
  }, null, 2));
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`audit:old-sqlite-official failed: ${message}`);
  process.exit(1);
});
