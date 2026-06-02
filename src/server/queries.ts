import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { buildGetPlayersSql, type GetPlayersSqlRow } from "@/server/player-query";
import {
  games,
  leagues,
  matches,
  matchParticipations,
  playerContributions,
  players,
  syncJobs,
} from "@/server/db/schema";
import { classifyLeague } from "@/lib/analytics/classifyLeague";
import { toIsoOrNull } from "@/lib/dates";
import { formatMatchResult, isOfficialDailyTimeoutLoss } from "@/lib/match-detail";
import { chesscomMemberUrl, mapProfileSummary, normalizeProfileUsername, resultFromViewedPlayerPerspective } from "@/lib/player-profile";
import {
  demoLeaderboard,
  demoLeagues,
  demoMatches,
  demoPlayers,
  demoSummary,
  demoSyncJobs,
} from "@/lib/demo-data";
import type {
  ApiResponse,
  LeaderboardRow,
  League,
  Match,
  MatchDetail,
  MatchGame,
  MatchParticipation,
  Player,
  PlayerProfile,
  SyncJob,
  TeamSummary,
} from "@/types";

const toIso = toIsoOrNull;

function toNumber(value: string | number | null | undefined) {
  return value == null ? null : Number(value);
}

function sanitizeReadErrorValue(value: unknown) {
  return String(value)
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "postgres://[redacted]")
    .replace(/password=([^\s&]+)/gi, "password=[redacted]")
    .slice(0, 500);
}

export function describeReadError(error: unknown) {
  if (error && typeof error === "object") {
    const maybeDbError = error as {
      code?: unknown;
      message?: unknown;
      cause?: unknown;
    };
    const cause =
      maybeDbError.cause && typeof maybeDbError.cause === "object"
        ? (maybeDbError.cause as { code?: unknown; message?: unknown })
        : null;
    const code =
      typeof maybeDbError.code === "string"
        ? maybeDbError.code
        : typeof cause?.code === "string"
          ? cause.code
          : undefined;
    const message =
      typeof maybeDbError.message === "string"
        ? maybeDbError.message
        : typeof cause?.message === "string"
          ? cause.message
          : String(error);

    return {
      code: code?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80),
      message: sanitizeReadErrorValue(message),
    };
  }

  return { message: sanitizeReadErrorValue(error) };
}

function logReadFallback(queryName: string, error: unknown) {
  console.error(
    `[server/queries] ${queryName} read failed; returning demo fallback data.`,
    describeReadError(error),
  );
}

function logReadError(queryName: string, error: unknown) {
  console.error(`[server/queries] ${queryName} read failed.`, {
    queryName,
    ...describeReadError(error),
  });
}

function isExplicitDemoMode() {
  return (
    process.env.DEMO_MODE === "true" ||
    process.env.NEXT_PUBLIC_DEMO_MODE === "true"
  );
}

export type PlayerFilters = {
  q?: string;
  official?: "all" | "with" | "without";
  team?: "all" | "members";
  sort?:
    | "username"
    | "rating"
    | "official_games"
    | "contribution"
    | "last_played";
};

function normalizePlayerSort(
  sort: string | undefined,
): NonNullable<PlayerFilters["sort"]> {
  if (
    sort === "rating" ||
    sort === "official_games" ||
    sort === "contribution" ||
    sort === "last_played"
  )
    return sort;
  return "username";
}

export async function getPlayers(
  filters: PlayerFilters = {},
): Promise<ApiResponse<Player[]>> {
  const query = filters.q?.trim().toLowerCase() ?? "";
  const official = filters.official ?? "all";
  const team = filters.team ?? "all";
  const sort = normalizePlayerSort(filters.sort);

  const filterDemoRows = (rows: Player[]) =>
    rows
      .filter(
        (player) => !query || player.username.toLowerCase().includes(query),
      )
      .filter((player) =>
        official === "with"
          ? player.gamesPlayed > 0
          : official === "without"
            ? player.gamesPlayed === 0
            : true,
      )
      .filter((player) =>
        team === "members" ? Boolean(player.isTeamMember) : true,
      )
      .sort((a, b) => {
        if (sort === "rating")
          return (
            (b.currentRating ?? -1) - (a.currentRating ?? -1) ||
            a.username.localeCompare(b.username)
          );
        if (sort === "official_games")
          return (
            b.gamesPlayed - a.gamesPlayed ||
            a.username.localeCompare(b.username)
          );
        if (sort === "contribution")
          return (
            b.contributionScore - a.contributionScore ||
            a.username.localeCompare(b.username)
          );
        if (sort === "last_played")
          return (
            (Date.parse(b.lastPlayedAt ?? "") || 0) -
              (Date.parse(a.lastPlayedAt ?? "") || 0) ||
            a.username.localeCompare(b.username)
          );
        return a.username.localeCompare(b.username);
      });

  if (!db || isExplicitDemoMode())
    return { data: filterDemoRows(demoPlayers), source: "demo" };

  try {
    const rows = await db.execute<GetPlayersSqlRow>(
      buildGetPlayersSql({ q: query, official, team, sort }),
    );

    return {
      source: "database",
      data: rows.map((row) => ({
        id: String(row.id),
        username: row.username,
        name: row.name,
        title: row.title,
        country: row.country,
        avatarUrl: row.avatarUrl,
        chesscomUrl: row.chesscomUrl,
        currentRating: row.currentRating,
        matchesPlayed: Number(row.matchesPlayed),
        gamesPlayed: Number(row.gamesPlayed),
        wins: Number(row.wins),
        draws: Number(row.draws),
        losses: Number(row.losses),
        contributionScore: Number(row.contributionScore),
        bestLeagueName: row.bestLeagueName,
        lastPlayedAt: toIso(row.lastPlayedAt),
        isTeamMember: Boolean(row.isTeamMember),
        lastSeenAt: toIso(row.lastSeenAt),
      })),
    };
  } catch (error) {
    const readError = describeReadError(error);
    logReadError("getPlayers", error);
    return { data: [], source: "database", readError };
  }
}

export type MatchFilters = {
  official?: "official" | "all";
  league?: string;
  month?: string;
};

export async function getMatches(
  filters: MatchFilters = {},
): Promise<ApiResponse<Match[]>> {
  const isOfficialOnly = filters.official === "official";
  const selectedLeague =
    filters.league && filters.league !== "all" ? filters.league : null;
  const selectedMonth =
    filters.month && /^\d{4}-\d{2}$/.test(filters.month) ? filters.month : null;
  const applyFilters = (rows: Match[]) =>
    rows.filter((match) => {
      const classification = classifyLeague(match.name);
      const leagueSlug = match.leagueSlug ?? classification.leagueSlug;
      if (isOfficialOnly && !classification.isOfficialCandidate) return false;
      if (selectedLeague && leagueSlug !== selectedLeague) return false;
      if (selectedMonth && match.startsAt?.slice(0, 7) !== selectedMonth)
        return false;
      return true;
    });

  if (!db) return { data: applyFilters(demoMatches), source: "demo" };

  const conditions: SQL[] = [];
  if (selectedLeague) conditions.push(eq(leagues.slug, selectedLeague));
  if (isOfficialOnly) conditions.push(eq(matches.isOfficial, 1));
  if (selectedMonth)
    conditions.push(
      sql`to_char(${matches.startsAt}, ${"YYYY-MM"}) = ${selectedMonth}`,
    );

  try {
    const rows = await db
      .select({ match: matches, league: leagues })
      .from(matches)
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(
        conditions.length
          ? conditions.length === 1
            ? conditions[0]
            : and(...conditions)
          : undefined,
      )
      .orderBy(desc(matches.startsAt))
      .limit(100);
    if (rows.length === 0)
      return { data: applyFilters(demoMatches), source: "demo" };
    return {
      source: "database",
      data: rows.map((row: any) => ({
        id: String(row.match.id),
        chesscomMatchId: row.match.chesscomMatchId,
        leagueId: row.match.leagueId ? String(row.match.leagueId) : null,
        name: row.match.name,
        opponent: row.match.opponent,
        status: row.match.status,
        result: row.match.result,
        teamScore: toNumber(row.match.teamScore),
        opponentScore: toNumber(row.match.opponentScore),
        boardCount: row.match.boardCount,
        startsAt: toIso(row.match.startsAt),
        endsAt: toIso(row.match.endsAt),
        leagueSlug:
          row.league?.slug ?? classifyLeague(row.match.name).leagueSlug,
        leagueName: row.league?.name ?? null,
        isOfficialCandidate: Boolean(row.match.isOfficial),
        chesscomUrl: row.match.chesscomUrl,
        opponentUrl: /^https?:\/\//i.test(row.match.opponent ?? "")
          ? row.match.opponent
          : null,
      })),
    };
  } catch (error) {
    logReadFallback("getMatches", error);
    return { data: applyFilters(demoMatches), source: "demo" };
  }
}

export async function getMatchById(
  id: number,
): Promise<ApiResponse<Match | null>> {
  if (!db)
    return {
      data: demoMatches.find((match) => Number(match.id) === id) ?? null,
      source: "demo",
    };

  try {
    const [row] = await db
      .select({ match: matches, league: leagues })
      .from(matches)
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(eq(matches.id, id))
      .limit(1);
    if (!row) return { data: null, source: "database" };
    return {
      source: "database",
      data: {
        id: String(row.match.id),
        chesscomMatchId: row.match.chesscomMatchId,
        leagueId: row.match.leagueId ? String(row.match.leagueId) : null,
        name: row.match.name,
        opponent: row.match.opponent,
        status: row.match.status,
        result: row.match.result,
        teamScore: toNumber(row.match.teamScore),
        opponentScore: toNumber(row.match.opponentScore),
        boardCount: row.match.boardCount,
        startsAt: toIso(row.match.startsAt),
        endsAt: toIso(row.match.endsAt),
        leagueSlug:
          row.league?.slug ?? classifyLeague(row.match.name).leagueSlug,
        leagueName: row.league?.name ?? null,
        isOfficialCandidate: Boolean(row.match.isOfficial),
        chesscomUrl: row.match.chesscomUrl,
        opponentUrl: /^https?:\/\//i.test(row.match.opponent ?? "")
          ? row.match.opponent
          : null,
      },
    };
  } catch (error) {
    logReadFallback("getMatchById", error);
    return {
      data: demoMatches.find((match) => Number(match.id) === id) ?? null,
      source: "demo",
    };
  }
}

export async function getMatchParticipations(
  matchId: number,
): Promise<ApiResponse<MatchParticipation[]>> {
  if (!db) return { data: [], source: "demo" };

  try {
    const rows = await db
      .select({ participation: matchParticipations, player: players })
      .from(matchParticipations)
      .innerJoin(players, eq(matchParticipations.playerId, players.id))
      .where(eq(matchParticipations.matchId, matchId))
      .orderBy(matchParticipations.boardNumber, players.username);
    return {
      source: "database",
      data: rows.map((row: any) => ({
        matchId: String(row.participation.matchId),
        playerId: String(row.participation.playerId),
        username: row.player.username,
        title: row.player.title,
        boardNumber: row.participation.boardNumber,
        score: Number(row.participation.score),
        gamesPlayed: row.participation.gamesPlayed,
        wins: row.participation.wins,
        draws: row.participation.draws,
        losses: row.participation.losses,
        timeoutLosses: row.participation.timeoutLosses,
        upsetWins: row.participation.upsetWins,
        avgOpponentRating: row.participation.avgOpponentRating,
        lastPlayedAt: toIso(row.participation.lastPlayedAt),
      })),
    };
  } catch (error) {
    logReadFallback("getMatchParticipations", error);
    return { data: [], source: "demo" };
  }
}

export async function getMatchGames(
  matchId: number,
): Promise<ApiResponse<MatchGame[]>> {
  if (!db) return { data: [], source: "demo" };

  try {
    const whitePlayer = alias(players, "white_player");
    const blackPlayer = alias(players, "black_player");
    const rows = await db
      .select({
        game: games,
        whiteUsername: whitePlayer.username,
        blackUsername: blackPlayer.username,
      })
      .from(games)
      .leftJoin(whitePlayer, eq(games.whitePlayerId, whitePlayer.id))
      .leftJoin(blackPlayer, eq(games.blackPlayerId, blackPlayer.id))
      .where(eq(games.matchId, matchId))
      .orderBy(games.endTime);
    return {
      source: "database",
      data: rows.map((row: any) => ({
        id: String(row.game.id),
        chesscomGameUuid: row.game.chesscomGameUuid,
        matchId: row.game.matchId == null ? null : String(row.game.matchId),
        whiteUsername: row.whiteUsername,
        blackUsername: row.blackUsername,
        timeClass: row.game.timeClass,
        rated: Boolean(row.game.rated),
        result: row.game.result,
        endTime: toIso(row.game.endTime),
      })),
    };
  } catch (error) {
    logReadFallback("getMatchGames", error);
    return { data: [], source: "demo" };
  }
}


type MatchDetailGameSqlRow = {
  id: number | string;
  chesscomGameUuid: string;
  matchId: number | string | null;
  boardNumber: number | string | null;
  whiteUsername: string | null;
  blackUsername: string | null;
  teamPlayerUsername: string | null;
  opponentUsername: string | null;
  color: "white" | "black" | "unknown";
  result: "win" | "draw" | "loss" | "unknown";
  timeClass: string | null;
  endedAt: Date | string | null;
  dataSource: "old_sqlite" | "chesscom_api" | "unknown";
  chesscomUrl: string | null;
  teamPlayerResultText: string | null;
  opponentResultText: string | null;
};

type MatchDetailPlayerSqlRow = {
  playerId: number | string;
  username: string;
  title: string | null;
  games: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  score: number | string;
  contributionScore: number | string | null;
  lastPlayedAt: Date | string | null;
};

type MatchDetailAggregateSqlRow = {
  storedGamesCount: number | string;
  oldSqliteGamesCount: number | string;
  chesscomApiGamesCount: number | string;
  unknownSourceGamesCount: number | string;
  opponentPlayersCount: number | string;
  unknownResultGamesCount: number | string;
  unknownTimeClassGamesCount: number | string;
  gamesWithoutChesscomUrlCount: number | string;
  dailyTimeoutLosses: number | string;
  dailyTimeoutWins: number | string;
  lastStoredGameDate: Date | string | null;
};

type MatchDetailPlayerTimeoutSqlRow = {
  username: string;
  dailyTimeoutLosses: number | string;
};


function demoMatchDetail(matchId: number): MatchDetail | null {
  const match = demoMatches.find((row) => Number(row.id) === matchId);
  if (!match) return null;
  const result = formatMatchResult({ status: match.status, result: match.result, teamScore: match.teamScore, opponentScore: match.opponentScore });
  return {
    match: {
      ...match,
      isOfficial: Boolean(match.isOfficialCandidate),
      timeClass: null,
      matchType: null,
    },
    summary: {
      teamScore: match.teamScore,
      opponentScore: match.opponentScore,
      result,
      totalStoredGames: 0,
      teamPlayersCount: 0,
      opponentPlayersCount: 0,
      dailyTimeoutLosses: 0,
      dailyTimeoutWins: 0,
      oldSqliteGames: 0,
      chesscomApiGames: 0,
    },
    players: [],
    games: [],
    coverage: {
      storedGamesCount: 0,
      oldSqliteGamesCount: 0,
      chesscomApiGamesCount: 0,
      unknownSourceGamesCount: 0,
      unknownResultGamesCount: 0,
      unknownTimeClassGamesCount: 0,
      gamesWithoutChesscomUrlCount: 0,
      lastStoredGameDate: null,
    },
  };
}

export async function getMatchDetail(matchId: string | number): Promise<ApiResponse<MatchDetail | null>> {
  const id = typeof matchId === "number" ? matchId : Number(matchId);
  if (!Number.isInteger(id) || id <= 0) return { data: null, source: db ? "database" : "demo" };
  if (!db || isExplicitDemoMode()) return { data: demoMatchDetail(id), source: "demo" };

  try {
    const [matchRow] = await db
      .select({ match: matches, league: leagues })
      .from(matches)
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(eq(matches.id, id))
      .limit(1);

    if (!matchRow) return { data: null, source: "database" };

    const isOfficial = Boolean(matchRow.match.isOfficial);
    const [playerRows, gameRows, aggregateRows, playerTimeoutRows] = await Promise.all([
      db.execute<MatchDetailPlayerSqlRow>(sql`
        select
          p.id as "playerId",
          p.username,
          p.title,
          mp.games_played as games,
          mp.wins,
          mp.draws,
          mp.losses,
          mp.score,
          pc.contribution_score as "contributionScore",
          mp.last_played_at as "lastPlayedAt"
        from match_participations mp
        inner join players p on p.id = mp.player_id
        left join player_contributions pc on pc.player_id = p.id
          and pc.period = 'all'
          and pc.league_id is not distinct from ${matchRow.match.leagueId}
        where mp.match_id = ${id}
        order by pc.contribution_score desc nulls last, mp.score desc, mp.games_played desc, lower(p.username) asc
      `),
      db.execute<MatchDetailGameSqlRow>(sql`
        with team_games as (
          select
            g.id,
            g.chesscom_game_uuid as "chesscomGameUuid",
            g.match_id as "matchId",
            coalesce(mp_white.board_number, mp_black.board_number) as "boardNumber",
            wp.username as "whiteUsername",
            bp.username as "blackUsername",
            case when mp_white.player_id is not null then wp.username when mp_black.player_id is not null then bp.username else null end as "teamPlayerUsername",
            case when mp_white.player_id is not null then bp.username when mp_black.player_id is not null then wp.username else null end as "opponentUsername",
            case when mp_white.player_id is not null then 'white' when mp_black.player_id is not null then 'black' else 'unknown' end as color,
            g.result,
            g.time_class as "timeClass",
            g.end_time as "endedAt",
            case when g.raw_game->>'source' = 'old_sqlite' then 'old_sqlite' when g.raw_game is not null then 'chesscom_api' else 'unknown' end as "dataSource",
            coalesce(g.raw_game->>'url', g.raw_game->>'game_url', g.raw_game->>'link') as "chesscomUrl",
            case
              when mp_white.player_id is not null then coalesce(g.raw_game->'white'->>'result', g.raw_game->>'old_result')
              when mp_black.player_id is not null then coalesce(g.raw_game->'black'->>'result', g.raw_game->>'old_result')
              else null
            end as "teamPlayerResultText",
            case
              when mp_white.player_id is not null then g.raw_game->'black'->>'result'
              when mp_black.player_id is not null then g.raw_game->'white'->>'result'
              else null
            end as "opponentResultText"
          from games g
          left join players wp on wp.id = g.white_player_id
          left join players bp on bp.id = g.black_player_id
          left join match_participations mp_white on mp_white.match_id = g.match_id and mp_white.player_id = g.white_player_id
          left join match_participations mp_black on mp_black.match_id = g.match_id and mp_black.player_id = g.black_player_id
          where g.match_id = ${id}
        )
        select * from team_games
        order by "endedAt" desc nulls last, id desc
        limit 200
      `),
      db.execute<MatchDetailAggregateSqlRow>(sql`
        with match_games as (
          select
            g.id,
            g.result,
            g.time_class,
            g.end_time,
            case when g.raw_game->>'source' = 'old_sqlite' then 'old_sqlite' when g.raw_game is not null then 'chesscom_api' else 'unknown' end as data_source,
            coalesce(g.raw_game->>'url', g.raw_game->>'game_url', g.raw_game->>'link') as chesscom_url,
            case
              when mp_white.player_id is not null then coalesce(g.raw_game->'white'->>'result', g.raw_game->>'old_result')
              when mp_black.player_id is not null then coalesce(g.raw_game->'black'->>'result', g.raw_game->>'old_result')
              else null
            end as team_player_result_text,
            case
              when mp_white.player_id is not null then g.raw_game->'black'->>'result'
              when mp_black.player_id is not null then g.raw_game->'white'->>'result'
              else null
            end as opponent_result_text,
            case when mp_white.player_id is not null then bp.username when mp_black.player_id is not null then wp.username else null end as opponent_username
          from games g
          left join players wp on wp.id = g.white_player_id
          left join players bp on bp.id = g.black_player_id
          left join match_participations mp_white on mp_white.match_id = g.match_id and mp_white.player_id = g.white_player_id
          left join match_participations mp_black on mp_black.match_id = g.match_id and mp_black.player_id = g.black_player_id
          where g.match_id = ${id}
        )
        select
          count(*)::int as "storedGamesCount",
          count(*) filter (where data_source = 'old_sqlite')::int as "oldSqliteGamesCount",
          count(*) filter (where data_source = 'chesscom_api')::int as "chesscomApiGamesCount",
          count(*) filter (where data_source = 'unknown')::int as "unknownSourceGamesCount",
          count(distinct opponent_username) filter (where opponent_username is not null)::int as "opponentPlayersCount",
          count(*) filter (where result = 'unknown')::int as "unknownResultGamesCount",
          count(*) filter (where time_class is null or btrim(time_class) = '')::int as "unknownTimeClassGamesCount",
          count(*) filter (where chesscom_url is null or btrim(chesscom_url) = '')::int as "gamesWithoutChesscomUrlCount",
          count(*) filter (
            where ${isOfficial}
              and lower(coalesce(time_class, '')) in ('daily', 'correspondence', 'daily960')
              and regexp_replace(lower(coalesce(team_player_result_text, '')), '[\s_-]+', '', 'g') in ('timeout', 'timedout', 'timeforfeit')
          )::int as "dailyTimeoutLosses",
          count(*) filter (
            where ${isOfficial}
              and lower(coalesce(time_class, '')) in ('daily', 'correspondence', 'daily960')
              and regexp_replace(lower(coalesce(opponent_result_text, '')), '[\s_-]+', '', 'g') in ('timeout', 'timedout', 'timeforfeit')
          )::int as "dailyTimeoutWins",
          max(end_time) as "lastStoredGameDate"
        from match_games
      `),
      db.execute<MatchDetailPlayerTimeoutSqlRow>(sql`
        with team_games as (
          select
            case when mp_white.player_id is not null then wp.username when mp_black.player_id is not null then bp.username else null end as username,
            g.time_class,
            case
              when mp_white.player_id is not null then coalesce(g.raw_game->'white'->>'result', g.raw_game->>'old_result')
              when mp_black.player_id is not null then coalesce(g.raw_game->'black'->>'result', g.raw_game->>'old_result')
              else null
            end as team_player_result_text
          from games g
          left join players wp on wp.id = g.white_player_id
          left join players bp on bp.id = g.black_player_id
          left join match_participations mp_white on mp_white.match_id = g.match_id and mp_white.player_id = g.white_player_id
          left join match_participations mp_black on mp_black.match_id = g.match_id and mp_black.player_id = g.black_player_id
          where g.match_id = ${id}
        )
        select
          username,
          count(*) filter (
            where ${isOfficial}
              and lower(coalesce(time_class, '')) in ('daily', 'correspondence', 'daily960')
              and regexp_replace(lower(coalesce(team_player_result_text, '')), '[\s_-]+', '', 'g') in ('timeout', 'timedout', 'timeforfeit')
          )::int as "dailyTimeoutLosses"
        from team_games
        where username is not null
        group by username
      `),
    ]);

    const match: MatchDetail["match"] = {
      id: String(matchRow.match.id),
      chesscomMatchId: matchRow.match.chesscomMatchId,
      leagueId: matchRow.match.leagueId ? String(matchRow.match.leagueId) : null,
      name: matchRow.match.name,
      opponent: matchRow.match.opponent,
      status: matchRow.match.status,
      result: matchRow.match.result,
      teamScore: toNumber(matchRow.match.teamScore),
      opponentScore: toNumber(matchRow.match.opponentScore),
      boardCount: matchRow.match.boardCount,
      startsAt: toIso(matchRow.match.startsAt),
      endsAt: toIso(matchRow.match.endsAt),
      leagueSlug: matchRow.league?.slug ?? classifyLeague(matchRow.match.name).leagueSlug,
      leagueName: matchRow.league?.name ?? null,
      isOfficialCandidate: isOfficial,
      isOfficial,
      chesscomUrl: matchRow.match.chesscomUrl,
      opponentUrl: /^https?:\/\//i.test(matchRow.match.opponent ?? "") ? matchRow.match.opponent : null,
      timeClass: typeof (matchRow.match.rawMatch as { time_class?: unknown } | null)?.time_class === "string" ? (matchRow.match.rawMatch as { time_class: string }).time_class : null,
      matchType: typeof (matchRow.match.rawMatch as { match_type?: unknown; type?: unknown } | null)?.match_type === "string" ? (matchRow.match.rawMatch as { match_type: string }).match_type : typeof (matchRow.match.rawMatch as { type?: unknown } | null)?.type === "string" ? (matchRow.match.rawMatch as { type: string }).type : null,
    };

    const gamesDetail = gameRows.map((row) => ({
      id: String(row.id),
      chesscomGameUuid: row.chesscomGameUuid,
      boardNumber: row.boardNumber == null ? null : Number(row.boardNumber),
      teamPlayerUsername: row.teamPlayerUsername,
      opponentUsername: row.opponentUsername,
      color: row.color,
      result: row.result,
      timeClass: row.timeClass,
      endedAt: toIso(row.endedAt),
      dataSource: row.dataSource,
      chesscomUrl: row.chesscomUrl,
      isDailyTimeoutLoss: isOfficialDailyTimeoutLoss({ isOfficial, timeClass: row.timeClass, teamPlayerResultText: row.teamPlayerResultText }),
    }));

    const timeoutLossesByUsername = new Map(
      playerTimeoutRows.map((row) => [
        row.username.toLowerCase(),
        Number(row.dailyTimeoutLosses),
      ]),
    );

    const playersDetail = playerRows.map((row) => ({
      playerId: String(row.playerId),
      username: row.username,
      title: row.title,
      games: Number(row.games),
      wins: Number(row.wins),
      draws: Number(row.draws),
      losses: Number(row.losses),
      score: Number(row.score),
      contributionScore: row.contributionScore == null ? null : Number(row.contributionScore),
      dailyTimeoutLosses: timeoutLossesByUsername.get(row.username.toLowerCase()) ?? 0,
      lastPlayedAt: toIso(row.lastPlayedAt),
    })).sort((a, b) =>
      (b.contributionScore ?? Number.NEGATIVE_INFINITY) - (a.contributionScore ?? Number.NEGATIVE_INFINITY) ||
      b.score - a.score ||
      b.games - a.games ||
      a.username.localeCompare(b.username),
    );

    const aggregate = aggregateRows[0] ?? {
      storedGamesCount: 0,
      oldSqliteGamesCount: 0,
      chesscomApiGamesCount: 0,
      unknownSourceGamesCount: 0,
      opponentPlayersCount: 0,
      unknownResultGamesCount: 0,
      unknownTimeClassGamesCount: 0,
      gamesWithoutChesscomUrlCount: 0,
      dailyTimeoutLosses: 0,
      dailyTimeoutWins: 0,
      lastStoredGameDate: null,
    };
    const oldSqliteGames = Number(aggregate.oldSqliteGamesCount);
    const chesscomApiGames = Number(aggregate.chesscomApiGamesCount);
    const dailyTimeoutLosses = Number(aggregate.dailyTimeoutLosses);
    const dailyTimeoutWins = Number(aggregate.dailyTimeoutWins);
    const opponentPlayersCount = Number(aggregate.opponentPlayersCount);
    const result = formatMatchResult({ status: match.status, result: match.result, teamScore: match.teamScore, opponentScore: match.opponentScore });

    return {
      source: "database",
      data: {
        match,
        summary: {
          teamScore: match.teamScore,
          opponentScore: match.opponentScore,
          result,
          totalStoredGames: Number(aggregate.storedGamesCount),
          teamPlayersCount: playersDetail.length,
          opponentPlayersCount,
          dailyTimeoutLosses,
          dailyTimeoutWins,
          oldSqliteGames,
          chesscomApiGames,
        },
        players: playersDetail,
        games: gamesDetail,
        coverage: {
          storedGamesCount: Number(aggregate.storedGamesCount),
          oldSqliteGamesCount: oldSqliteGames,
          chesscomApiGamesCount: chesscomApiGames,
          unknownSourceGamesCount: Number(aggregate.unknownSourceGamesCount),
          unknownResultGamesCount: Number(aggregate.unknownResultGamesCount),
          unknownTimeClassGamesCount: Number(aggregate.unknownTimeClassGamesCount),
          gamesWithoutChesscomUrlCount: Number(aggregate.gamesWithoutChesscomUrlCount),
          lastStoredGameDate: toIso(aggregate.lastStoredGameDate),
        },
      },
    };
  } catch (error) {
    const readError = describeReadError(error);
    logReadError("getMatchDetail", error);
    return { data: null, source: "database", readError };
  }
}

export async function getLeagues(): Promise<ApiResponse<League[]>> {
  if (!db || isExplicitDemoMode()) return { data: demoLeagues, source: "demo" };

  const startedAt = Date.now();

  try {
    const matchStats = db
      .select({
        leagueId: matches.leagueId,
        matchCount: sql<number>`count(*)`.as("match_count"),
        officialMatchCount:
          sql<number>`count(*) filter (where ${matches.isOfficial} = 1)`.as(
            "official_match_count",
          ),
      })
      .from(matches)
      .groupBy(matches.leagueId)
      .as("match_stats");

    const gameStats = db
      .select({
        leagueId: matches.leagueId,
        gameCount: sql<number>`count(${games.id})`.as("game_count"),
      })
      .from(games)
      .innerJoin(matches, eq(games.matchId, matches.id))
      .groupBy(matches.leagueId)
      .as("game_stats");

    const participationStats = db
      .select({
        leagueId: matches.leagueId,
        participationCount: sql<number>`count(*)`.as("participation_count"),
      })
      .from(matchParticipations)
      .innerJoin(matches, eq(matchParticipations.matchId, matches.id))
      .groupBy(matches.leagueId)
      .as("participation_stats");

    const contributionStats = db
      .select({
        leagueId: playerContributions.leagueId,
        contributionCount: sql<number>`count(*)`.as("contribution_count"),
      })
      .from(playerContributions)
      .groupBy(playerContributions.leagueId)
      .as("contribution_stats");

    const rows = await db
      .select({
        id: leagues.id,
        name: leagues.name,
        slug: leagues.slug,
        season: leagues.season,
        status: leagues.status,
        startsAt: leagues.startsAt,
        endsAt: leagues.endsAt,
        matchCount: sql<number>`coalesce(${matchStats.matchCount}, 0)`,
        officialMatchCount: sql<number>`coalesce(${matchStats.officialMatchCount}, 0)`,
        gameCount: sql<number>`coalesce(${gameStats.gameCount}, 0)`,
        participationCount: sql<number>`coalesce(${participationStats.participationCount}, 0)`,
        contributionCount: sql<number>`coalesce(${contributionStats.contributionCount}, 0)`,
      })
      .from(leagues)
      .leftJoin(matchStats, eq(matchStats.leagueId, leagues.id))
      .leftJoin(gameStats, eq(gameStats.leagueId, leagues.id))
      .leftJoin(participationStats, eq(participationStats.leagueId, leagues.id))
      .leftJoin(contributionStats, eq(contributionStats.leagueId, leagues.id))
      .orderBy(sql`coalesce(${matchStats.matchCount}, 0) desc`, leagues.name);

    console.info("[server/queries] getLeagues completed", {
      durationMs: Date.now() - startedAt,
      rowCount: rows.length,
    });

    return {
      source: "database",
      data: rows.map((row: any) => ({
        id: String(row.id),
        name: row.name,
        slug: row.slug,
        season: row.season,
        status: row.status,
        startsAt: toIso(row.startsAt),
        endsAt: toIso(row.endsAt),
        matchCount: Number(row.matchCount),
        officialMatchCount: Number(row.officialMatchCount),
        gameCount: Number(row.gameCount),
        participationCount: Number(row.participationCount),
        contributionCount: Number(row.contributionCount),
      })),
    };
  } catch (error) {
    const readError = describeReadError(error);
    logReadError("getLeagues", error);
    return { data: [], source: "database", readError };
  }
}

export async function getSyncJobs(): Promise<ApiResponse<SyncJob[]>> {
  if (!db) return { data: demoSyncJobs, source: "demo" };

  try {
    const rows = await db
      .select()
      .from(syncJobs)
      .orderBy(desc(syncJobs.createdAt))
      .limit(10);
    if (rows.length === 0) return { data: demoSyncJobs, source: "demo" };
    return {
      source: "database",
      data: rows.map((row: any) => ({
        id: String(row.id),
        type: row.type,
        status: row.status,
        message: row.message,
        recordsProcessed: row.recordsProcessed,
        errorMessage: row.errorMessage,
        startedAt: toIso(row.startedAt),
        finishedAt: toIso(row.finishedAt),
        createdAt: toIso(row.createdAt) ?? toIso(new Date()) ?? "",
      })),
    };
  } catch (error) {
    logReadFallback("getSyncJobs", error);
    return { data: demoSyncJobs, source: "demo" };
  }
}

export type LeaderboardSort =
  | "contribution_score"
  | "points"
  | "win_rate"
  | "games";
export type LeaderboardFilters = {
  league?: string;
  period?: string;
  minGames?: number;
  sort?: LeaderboardSort;
  q?: string;
};

const leaderboardSorters: Record<
  LeaderboardSort,
  (row: LeaderboardRow) => number
> = {
  contribution_score: (row) => row.contributionScore,
  points: (row) => row.points,
  win_rate: (row) => row.winRate,
  games: (row) => row.games,
};

function normalizeLeaderboardSort(sort: string | undefined): LeaderboardSort {
  if (sort === "points" || sort === "win_rate" || sort === "games") return sort;
  return "contribution_score";
}

function rankLeaderboard(
  rows: LeaderboardRow[],
  sort: LeaderboardSort,
  minGames: number,
) {
  return rows
    .filter((row) => row.games >= minGames)
    .sort(
      (a, b) =>
        leaderboardSorters[sort](b) - leaderboardSorters[sort](a) ||
        b.contributionScore - a.contributionScore ||
        a.username.localeCompare(b.username),
    )
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getLeaderboard(
  filters: LeaderboardFilters = {},
): Promise<ApiResponse<LeaderboardRow[]>> {
  const period = filters.period ?? "all";
  const selectedLeague =
    filters.league && filters.league !== "all" ? filters.league : null;
  const minGames = Math.max(0, filters.minGames ?? 0);
  const sort = normalizeLeaderboardSort(filters.sort);
  const query = filters.q?.trim().toLowerCase() ?? "";

  if (!db)
    return {
      data: rankLeaderboard(
        demoLeaderboard.filter(
          (row) => !query || row.username.toLowerCase().includes(query),
        ),
        sort,
        minGames,
      ),
      source: "demo",
    };

  const conditions: SQL[] = [eq(playerContributions.period, period)];
  if (selectedLeague) conditions.push(eq(leagues.slug, selectedLeague));
  if (query)
    conditions.push(sql`lower(${players.username}) like ${`%${query}%`}`);

  try {
    const rows = await db
      .select({
        username: players.username,
        title: players.title,
        matches: sql<number>`coalesce(sum(${playerContributions.matchesPlayed}), 0)`,
        games: sql<number>`coalesce(sum(${playerContributions.gamesPlayed}), 0)`,
        wins: sql<number>`coalesce(sum(${playerContributions.wins}), 0)`,
        draws: sql<number>`coalesce(sum(${playerContributions.draws}), 0)`,
        losses: sql<number>`coalesce(sum(${playerContributions.losses}), 0)`,
        points: sql<number>`coalesce(sum(${playerContributions.points}), 0)`,
        contributionScore: sql<number>`coalesce(sum(${playerContributions.contributionScore}), 0)`,
        avgOpponentRating: sql<
          number | null
        >`round(sum(${playerContributions.avgOpponentRating} * ${playerContributions.gamesPlayed}) / nullif(sum(${playerContributions.gamesPlayed}), 0))`,
        lastPlayedAt: sql<Date | null>`max(${playerContributions.lastPlayedAt})`,
      })
      .from(playerContributions)
      .innerJoin(players, eq(playerContributions.playerId, players.id))
      .leftJoin(leagues, eq(playerContributions.leagueId, leagues.id))
      .where(and(...conditions))
      .groupBy(players.id, players.username, players.title)
      .limit(200);

    const data: LeaderboardRow[] = rows.map((row: any) => {
      const games = Number(row.games);
      const wins = Number(row.wins);
      return {
        rank: 0,
        username: row.username,
        title: row.title,
        matches: Number(row.matches),
        games,
        wins,
        draws: Number(row.draws),
        losses: Number(row.losses),
        points: Number(row.points),
        winRate: games > 0 ? (wins / games) * 100 : 0,
        contributionScore: Number(row.contributionScore),
        avgOpponentRating:
          row.avgOpponentRating == null ? null : Number(row.avgOpponentRating),
        lastPlayedAt: toIso(row.lastPlayedAt),
      };
    });

    return { data: rankLeaderboard(data, sort, minGames), source: "database" };
  } catch (error) {
    logReadFallback("getLeaderboard", error);
    return {
      data: rankLeaderboard(
        demoLeaderboard.filter(
          (row) => !query || row.username.toLowerCase().includes(query),
        ),
        sort,
        minGames,
      ),
      source: "demo",
    };
  }
}

export async function getTeamSummary(): Promise<ApiResponse<TeamSummary>> {
  if (!db) return { data: demoSummary, source: "demo" };

  try {
    const oldSqlitePredicate = sql`${games.rawGame}->>${"source"} = ${"old_sqlite"} or (jsonb_typeof(${games.rawGame}) = ${"string"} and ${games.rawGame} #>> ${"{}"} like ${"%old_sqlite%"})`;
    const [
      [playersRow],
      [matchesRow],
      [officialMatchesRow],
      [activeLeaguesRow],
      [gamesRow],
      [oldArchiveGamesRow],
      [contributionRowsRow],
      [gameDatesRow],
      jobsResult,
    ] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(players),
      db.select({ count: sql<number>`count(*)` }).from(matches),
      db
        .select({ count: sql<number>`count(*)` })
        .from(matches)
        .where(eq(matches.isOfficial, 1)),
      db
        .select({ count: sql<number>`count(*)` })
        .from(leagues)
        .where(
          sql`${leagues.status} = ${"active"} and ${leagues.slug} not in (${"unknown"}, ${"friendly"})`,
        ),
      db.select({ count: sql<number>`count(*)` }).from(games),
      db
        .select({ count: sql<number>`count(*)` })
        .from(games)
        .where(oldSqlitePredicate),
      db.select({ count: sql<number>`count(*)` }).from(playerContributions),
      db
        .select({
          earliestGameDate: sql<Date | null>`min(${games.endTime})`,
          latestGameDate: sql<Date | null>`max(${games.endTime})`,
        })
        .from(games),
      getSyncJobs(),
    ]);

    return {
      source: "database",
      data: {
        players: Number(playersRow?.count ?? 0),
        matches: Number(matchesRow?.count ?? 0),
        activeLeagues: Number(activeLeaguesRow?.count ?? 0),
        games: Number(gamesRow?.count ?? 0),
        oldArchiveGames: Number(oldArchiveGamesRow?.count ?? 0),
        officialMatches: Number(officialMatchesRow?.count ?? 0),
        contributionRows: Number(contributionRowsRow?.count ?? 0),
        earliestGameDate: toIso(gameDatesRow?.earliestGameDate),
        latestGameDate: toIso(gameDatesRow?.latestGameDate),
        lastSync:
          jobsResult.source === "database"
            ? (jobsResult.data[0] ?? null)
            : null,
      },
    };
  } catch (error) {
    logReadFallback("getTeamSummary", error);
    return { data: demoSummary, source: "demo" };
  }
}

export async function createDemoSyncJob(): Promise<ApiResponse<SyncJob>> {
  if (!db)
    return {
      data: {
        ...demoSyncJobs[0],
        id: crypto.randomUUID(),
        message: "Demo sync queued; configure DATABASE_URL for persistence",
      },
      source: "demo",
    };
  const [row] = await db
    .insert(syncJobs)
    .values({
      type: "matches",
      status: "queued",
      message: "Match sync queued from MVP admin endpoint",
    })
    .returning();
  return {
    source: "database",
    data: {
      id: String(row.id),
      type: row.type,
      status: row.status,
      message: row.message,
      recordsProcessed: row.recordsProcessed,
      errorMessage: row.errorMessage,
      startedAt: toIso(row.startedAt),
      finishedAt: toIso(row.finishedAt),
      createdAt: toIso(row.createdAt) ?? toIso(new Date()) ?? "",
    },
  };
}


type PlayerProfileSqlRow = {
  id: number | string;
  username: string;
  name: string | null;
  title: string | null;
  country: string | null;
  avatarUrl: string | null;
  chesscomUrl: string | null;
  currentRating: number | null;
  matchesPlayed: number | string;
  gamesPlayed: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  contributionScore: number | string;
  bestLeagueName: string | null;
  lastPlayedAt: Date | string | null;
  isTeamMember: number | boolean;
  lastSeenAt: Date | string | null;
  dailyOfficialGames: number | string;
  dailyTimeoutLosses: number | string;
  dailyTimeoutWins: number | string;
  lastDailyTimeoutDate: Date | string | null;
};

type PlayerProfileLeagueSqlRow = {
  leagueName: string | null;
  leagueSlug: string | null;
  gamesPlayed: number | string;
  matchesPlayed: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  contributionScore: number | string;
  lastPlayedAt: Date | string | null;
  dailyGames: number | string;
  dailyTimeoutLosses: number | string;
};

type PlayerProfileGameSqlRow = {
  id: number | string;
  endedAt: Date | string | null;
  leagueName: string | null;
  leagueSlug: string | null;
  matchId: number | string | null;
  matchTitle: string | null;
  opponentUsername: string | null;
  color: "white" | "black" | "unknown";
  storedTeamResult: "win" | "draw" | "loss" | "unknown";
  viewedPlayerIsTeamPlayer: boolean | number;
  chesscomUrl: string | null;
  dataSource: "old_sqlite" | "chesscom_api" | "unknown";
  timeClass: string | null;
  isDailyTimeoutLoss: boolean | number;
};

type PlayerProfileMatchSqlRow = {
  id: number | string;
  opponentTeam: string;
  leagueName: string | null;
  leagueSlug: string | null;
  status: Match["status"];
  teamResult: Match["result"];
  playerScore: number | string;
  gamesPlayed: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  lastPlayedAt: Date | string | null;
};

function profileTimeoutLossSql(playerIdSql: SQL = sql`target.id`) {
  return sql`
    lower(coalesce(g.time_class, '')) in ('daily', 'correspondence', 'daily960')
    and lower(coalesce(
      case
        when g.white_player_id = ${playerIdSql} then g.raw_game #>> '{white,result}'
        when g.black_player_id = ${playerIdSql} then g.raw_game #>> '{black,result}'
        else null
      end,
      ''
    )) in ('timeout', 'timedout', 'timed out', 'time_forfeit', 'time-forfeit')
  `;
}

function profileTimeoutWinSql(playerIdSql: SQL = sql`target.id`) {
  return sql`
    lower(coalesce(g.time_class, '')) in ('daily', 'correspondence', 'daily960')
    and lower(coalesce(
      case
        when g.white_player_id = ${playerIdSql} then g.raw_game #>> '{black,result}'
        when g.black_player_id = ${playerIdSql} then g.raw_game #>> '{white,result}'
        else null
      end,
      ''
    )) in ('timeout', 'timedout', 'timed out', 'time_forfeit', 'time-forfeit')
  `;
}

export async function getPlayerProfile(username: string): Promise<ApiResponse<PlayerProfile | null>> {
  const normalized = normalizeProfileUsername(username);
  if (!normalized) return { data: null, source: db ? "database" : "demo" };

  if (!db || isExplicitDemoMode()) {
    const player = demoPlayers.find((row) => row.username.toLowerCase() === normalized) ?? null;
    if (!player) return { data: null, source: "demo" };
    const summary = mapProfileSummary({
      gamesPlayed: player.gamesPlayed,
      wins: player.wins,
      draws: player.draws,
      losses: player.losses,
      contributionScore: player.contributionScore,
      matchesPlayed: player.matchesPlayed,
      bestLeagueName: player.bestLeagueName ?? null,
    });
    return {
      source: "demo",
      data: {
        player,
        summary: {
          officialGames: summary.gamesPlayed,
          wins: summary.wins,
          draws: summary.draws,
          losses: summary.losses,
          winRate: summary.winRate,
          contributionScore: summary.contributionScore,
          matchesPlayed: summary.matchesPlayed,
          bestLeague: summary.bestLeagueName,
        },
        timeoutStats: { dailyOfficialGames: 0, dailyTimeoutLosses: 0, dailyTimeoutWins: 0, dailyTimeoutRate: 0, lastDailyTimeoutDate: null },
        leagueBreakdown: [],
        recentGames: [],
        recentMatches: [],
      },
    };
  }

  try {
    const timeoutLossSql = profileTimeoutLossSql();
    const timeoutWinSql = profileTimeoutWinSql();
    const [[profile], leagueRows, gameRows, matchRows] = await Promise.all([
      db.execute<PlayerProfileSqlRow>(sql`
        with target as (
          select * from players where lower(username) = ${normalized} limit 1
        ), contribution_stats as (
          select
            pc.player_id,
            coalesce(sum(pc.matches_played), 0)::int as matches_played,
            coalesce(sum(pc.games_played), 0)::int as games_played,
            coalesce(sum(pc.wins), 0)::int as wins,
            coalesce(sum(pc.draws), 0)::int as draws,
            coalesce(sum(pc.losses), 0)::int as losses,
            coalesce(sum(pc.contribution_score), 0) as contribution_score,
            max(pc.last_played_at) as last_played_at,
            (array_agg(l.name order by pc.contribution_score desc, pc.games_played desc) filter (where pc.games_played > 0))[1] as best_league_name
          from player_contributions pc
          left join leagues l on pc.league_id = l.id
          inner join target on target.id = pc.player_id
          where pc.period = 'all'
          group by pc.player_id
        ), timeout_stats as (
          select
            target.id as player_id,
            count(*) filter (where lower(coalesce(g.time_class, '')) in ('daily', 'correspondence', 'daily960'))::int as daily_official_games,
            count(*) filter (where ${timeoutLossSql})::int as daily_timeout_losses,
            count(*) filter (where ${timeoutWinSql})::int as daily_timeout_wins,
            max(g.end_time) filter (where ${timeoutLossSql}) as last_daily_timeout_date
          from target
          inner join games g on (g.white_player_id = target.id or g.black_player_id = target.id)
          inner join matches m on g.match_id = m.id and m.is_official = 1
          group by target.id
        )
        select
          target.id,
          target.username,
          target.name,
          target.title,
          target.country,
          target.avatar_url as "avatarUrl",
          target.chesscom_url as "chesscomUrl",
          target.current_rating as "currentRating",
          coalesce(cs.matches_played, target.matches_played, 0)::int as "matchesPlayed",
          coalesce(cs.games_played, target.games_played, 0)::int as "gamesPlayed",
          coalesce(cs.wins, target.wins, 0)::int as wins,
          coalesce(cs.draws, target.draws, 0)::int as draws,
          coalesce(cs.losses, target.losses, 0)::int as losses,
          coalesce(cs.contribution_score, target.contribution_score, 0) as "contributionScore",
          cs.best_league_name as "bestLeagueName",
          cs.last_played_at as "lastPlayedAt",
          target.is_team_member as "isTeamMember",
          target.last_seen_at as "lastSeenAt",
          coalesce(ts.daily_official_games, 0)::int as "dailyOfficialGames",
          coalesce(ts.daily_timeout_losses, 0)::int as "dailyTimeoutLosses",
          coalesce(ts.daily_timeout_wins, 0)::int as "dailyTimeoutWins",
          ts.last_daily_timeout_date as "lastDailyTimeoutDate"
        from target
        left join contribution_stats cs on cs.player_id = target.id
        left join timeout_stats ts on ts.player_id = target.id
      `),
      db.execute<PlayerProfileLeagueSqlRow>(sql`
        with target as (select id from players where lower(username) = ${normalized} limit 1),
        daily_by_league as (
          select
            m.league_id,
            count(*) filter (where lower(coalesce(g.time_class, '')) in ('daily', 'correspondence', 'daily960'))::int as daily_games,
            count(*) filter (where ${profileTimeoutLossSql()})::int as daily_timeout_losses
          from target
          inner join games g on (g.white_player_id = target.id or g.black_player_id = target.id)
          inner join matches m on g.match_id = m.id and m.is_official = 1
          group by m.league_id
        )
        select
          l.name as "leagueName",
          l.slug as "leagueSlug",
          pc.games_played as "gamesPlayed",
          pc.matches_played as "matchesPlayed",
          pc.wins,
          pc.draws,
          pc.losses,
          pc.contribution_score as "contributionScore",
          pc.last_played_at as "lastPlayedAt",
          coalesce(dbl.daily_games, 0)::int as "dailyGames",
          coalesce(dbl.daily_timeout_losses, 0)::int as "dailyTimeoutLosses"
        from player_contributions pc
        inner join target on target.id = pc.player_id
        left join leagues l on pc.league_id = l.id
        left join daily_by_league dbl on dbl.league_id is not distinct from pc.league_id
        where pc.period = 'all' and pc.league_id is not null
        order by pc.contribution_score desc, pc.games_played desc
      `),
      db.execute<PlayerProfileGameSqlRow>(sql`
        with target as (select id from players where lower(username) = ${normalized} limit 1)
        select
          g.id,
          g.end_time as "endedAt",
          l.name as "leagueName",
          l.slug as "leagueSlug",
          m.id as "matchId",
          m.name as "matchTitle",
          case when g.white_player_id = target.id then bp.username when g.black_player_id = target.id then wp.username else null end as "opponentUsername",
          case when g.white_player_id = target.id then 'white' when g.black_player_id = target.id then 'black' else 'unknown' end as color,
          g.result as "storedTeamResult",
          exists (
            select 1
            from match_participations target_mp
            where target_mp.match_id = m.id and target_mp.player_id = target.id
          ) as "viewedPlayerIsTeamPlayer",
          coalesce(g.raw_game->>'url', g.raw_game->>'game_url', g.raw_game->>'link', g.chesscom_game_uuid) as "chesscomUrl",
          case when g.raw_game->>'source' = 'old_sqlite' then 'old_sqlite' when g.raw_game is not null then 'chesscom_api' else 'unknown' end as "dataSource",
          g.time_class as "timeClass",
          (${profileTimeoutLossSql()}) as "isDailyTimeoutLoss"
        from target
        inner join games g on (g.white_player_id = target.id or g.black_player_id = target.id)
        inner join matches m on g.match_id = m.id and m.is_official = 1
        left join leagues l on m.league_id = l.id
        left join players wp on g.white_player_id = wp.id
        left join players bp on g.black_player_id = bp.id
        order by g.end_time desc nulls last, g.id desc
        limit 20
      `),
      db.execute<PlayerProfileMatchSqlRow>(sql`
        with target as (select id from players where lower(username) = ${normalized} limit 1)
        select
          m.id,
          m.opponent as "opponentTeam",
          l.name as "leagueName",
          l.slug as "leagueSlug",
          m.status,
          m.result as "teamResult",
          mp.score as "playerScore",
          mp.games_played as "gamesPlayed",
          mp.wins,
          mp.draws,
          mp.losses,
          mp.last_played_at as "lastPlayedAt"
        from target
        inner join match_participations mp on mp.player_id = target.id
        inner join matches m on m.id = mp.match_id and m.is_official = 1
        left join leagues l on m.league_id = l.id
        order by mp.last_played_at desc nulls last, m.starts_at desc nulls last
        limit 10
      `),
    ]);

    if (!profile) return { data: null, source: "database" };

    const officialGames = Number(profile.gamesPlayed);
    const wins = Number(profile.wins);
    const summary = mapProfileSummary({
      gamesPlayed: officialGames,
      wins,
      draws: Number(profile.draws),
      losses: Number(profile.losses),
      contributionScore: Number(profile.contributionScore),
      matchesPlayed: Number(profile.matchesPlayed),
      bestLeagueName: profile.bestLeagueName,
    });
    const dailyOfficialGames = Number(profile.dailyOfficialGames);
    const dailyTimeoutLosses = Number(profile.dailyTimeoutLosses);

    return {
      source: "database",
      data: {
        player: {
          id: String(profile.id),
          username: profile.username,
          name: profile.name,
          title: profile.title,
          country: profile.country,
          avatarUrl: profile.avatarUrl,
          chesscomUrl: profile.chesscomUrl ?? chesscomMemberUrl(profile.username),
          currentRating: profile.currentRating,
          matchesPlayed: summary.matchesPlayed,
          gamesPlayed: summary.gamesPlayed,
          wins: summary.wins,
          draws: summary.draws,
          losses: summary.losses,
          contributionScore: summary.contributionScore,
          bestLeagueName: summary.bestLeagueName,
          lastPlayedAt: toIso(summary.gamesPlayed > 0 ? profile.lastPlayedAt : null),
          isTeamMember: Boolean(profile.isTeamMember),
          lastSeenAt: toIso(profile.lastSeenAt),
        },
        summary: {
          officialGames: summary.gamesPlayed,
          wins: summary.wins,
          draws: summary.draws,
          losses: summary.losses,
          winRate: summary.winRate,
          contributionScore: summary.contributionScore,
          matchesPlayed: summary.matchesPlayed,
          bestLeague: summary.bestLeagueName,
        },
        timeoutStats: {
          dailyOfficialGames,
          dailyTimeoutLosses,
          dailyTimeoutWins: Number(profile.dailyTimeoutWins),
          dailyTimeoutRate: dailyOfficialGames > 0 ? (dailyTimeoutLosses / dailyOfficialGames) * 100 : 0,
          lastDailyTimeoutDate: toIso(profile.lastDailyTimeoutDate),
        },
        leagueBreakdown: leagueRows.map((row) => {
          const gamesPlayed = Number(row.gamesPlayed);
          const wins = Number(row.wins);
          const dailyGames = Number(row.dailyGames);
          const dailyTimeoutLosses = Number(row.dailyTimeoutLosses);
          return {
            leagueName: row.leagueName,
            leagueSlug: row.leagueSlug,
            gamesPlayed,
            matchesPlayed: Number(row.matchesPlayed),
            wins,
            draws: Number(row.draws),
            losses: Number(row.losses),
            winRate: gamesPlayed > 0 ? (wins / gamesPlayed) * 100 : 0,
            contributionScore: Number(row.contributionScore),
            lastPlayedAt: toIso(row.lastPlayedAt),
            dailyGames,
            dailyTimeoutLosses,
            timeoutRate: dailyGames > 0 ? (dailyTimeoutLosses / dailyGames) * 100 : 0,
          };
        }),
        recentGames: gameRows.map((row) => ({
          id: String(row.id),
          endedAt: toIso(row.endedAt),
          leagueName: row.leagueName,
          leagueSlug: row.leagueSlug,
          matchId: row.matchId == null ? null : String(row.matchId),
          matchTitle: row.matchTitle,
          opponentUsername: row.opponentUsername,
          color: row.color,
          result: resultFromViewedPlayerPerspective({
            storedTeamResult: row.storedTeamResult,
            viewedPlayerIsTeamPlayer: Boolean(row.viewedPlayerIsTeamPlayer),
          }),
          chesscomUrl: row.chesscomUrl,
          dataSource: row.dataSource,
          timeClass: row.timeClass,
          isDailyTimeoutLoss: Boolean(row.isDailyTimeoutLoss),
        })),
        recentMatches: matchRows.map((row) => ({
          id: String(row.id),
          opponentTeam: row.opponentTeam,
          leagueName: row.leagueName,
          leagueSlug: row.leagueSlug,
          status: row.status,
          teamResult: row.teamResult,
          playerScore: Number(row.playerScore),
          gamesPlayed: Number(row.gamesPlayed),
          wins: Number(row.wins),
          draws: Number(row.draws),
          losses: Number(row.losses),
          lastPlayedAt: toIso(row.lastPlayedAt),
        })),
      },
    };
  } catch (error) {
    const readError = describeReadError(error);
    logReadError("getPlayerProfile", error);
    return { data: null, source: "database", readError };
  }
}
