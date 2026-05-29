import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/server/db";
import { games, leagues, matches, matchParticipations, playerContributions, players, syncJobs } from "@/server/db/schema";
import { classifyLeague } from "@/lib/analytics/classifyLeague";
import { toIsoOrNull } from "@/lib/dates";
import { demoLeaderboard, demoLeagues, demoMatches, demoPlayers, demoSummary, demoSyncJobs } from "@/lib/demo-data";
import type { ApiResponse, LeaderboardRow, League, Match, MatchGame, MatchParticipation, Player, SyncJob, TeamSummary } from "@/types";

const toIso = toIsoOrNull;

function toNumber(value: string | number | null | undefined) {
  return value == null ? null : Number(value);
}

function describeReadError(error: unknown) {
  if (error && typeof error === "object") {
    const maybeDbError = error as { code?: unknown; message?: unknown; cause?: unknown };
    const cause = maybeDbError.cause && typeof maybeDbError.cause === "object" ? maybeDbError.cause as { code?: unknown; message?: unknown } : null;
    return {
      code: typeof maybeDbError.code === "string" ? maybeDbError.code : typeof cause?.code === "string" ? cause.code : undefined,
      message: typeof maybeDbError.message === "string" ? maybeDbError.message : typeof cause?.message === "string" ? cause.message : String(error),
    };
  }

  return { message: String(error) };
}

function logReadFallback(queryName: string, error: unknown) {
  console.error(`[server/queries] ${queryName} read failed; returning demo fallback data.`, describeReadError(error));
}

export async function getPlayers(): Promise<ApiResponse<Player[]>> {
  if (!db) return { data: demoPlayers, source: "demo" };

  try {
    const rows = await db.select().from(players).limit(100);
    if (rows.length === 0) return { data: demoPlayers, source: "demo" };
    return {
      source: "database",
      data: rows.map((row: any) => ({ id: String(row.id), username: row.username, name: row.name, title: row.title, country: row.country, avatarUrl: row.avatarUrl, chesscomUrl: row.chesscomUrl, currentRating: row.currentRating, matchesPlayed: row.matchesPlayed, gamesPlayed: row.gamesPlayed, wins: row.wins, draws: row.draws, losses: row.losses, contributionScore: Number(row.contributionScore), lastSeenAt: toIso(row.lastSeenAt) })),
    };
  } catch (error) {
    logReadFallback("getPlayers", error);
    return { data: demoPlayers, source: "demo" };
  }
}

export type MatchFilters = { official?: "official" | "all"; league?: string };

export async function getMatches(filters: MatchFilters = {}): Promise<ApiResponse<Match[]>> {
  const isOfficialOnly = filters.official === "official";
  const selectedLeague = filters.league && filters.league !== "all" ? filters.league : null;
  const applyFilters = (rows: Match[]) => rows.filter((match) => {
    const classification = classifyLeague(match.name);
    const leagueSlug = match.leagueSlug ?? classification.leagueSlug;
    if (isOfficialOnly && !classification.isOfficialCandidate) return false;
    if (selectedLeague && leagueSlug !== selectedLeague) return false;
    return true;
  });

  if (!db) return { data: applyFilters(demoMatches), source: "demo" };

  const conditions: SQL[] = [];
  if (selectedLeague) conditions.push(eq(leagues.slug, selectedLeague));
  if (isOfficialOnly) conditions.push(eq(matches.isOfficial, 1));

  try {
    const rows = await db
      .select({ match: matches, league: leagues })
      .from(matches)
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(conditions.length ? (conditions.length === 1 ? conditions[0] : and(...conditions)) : undefined)
      .orderBy(desc(matches.startsAt))
      .limit(100);
    if (rows.length === 0) return { data: applyFilters(demoMatches), source: "demo" };
    return {
      source: "database",
      data: rows.map((row: any) => ({ id: String(row.match.id), chesscomMatchId: row.match.chesscomMatchId, leagueId: row.match.leagueId ? String(row.match.leagueId) : null, name: row.match.name, opponent: row.match.opponent, status: row.match.status, result: row.match.result, teamScore: toNumber(row.match.teamScore), opponentScore: toNumber(row.match.opponentScore), boardCount: row.match.boardCount, startsAt: toIso(row.match.startsAt), endsAt: toIso(row.match.endsAt), leagueSlug: row.league?.slug ?? classifyLeague(row.match.name).leagueSlug, leagueName: row.league?.name ?? null, isOfficialCandidate: Boolean(row.match.isOfficial) })),
    };
  } catch (error) {
    logReadFallback("getMatches", error);
    return { data: applyFilters(demoMatches), source: "demo" };
  }
}

export async function getMatchById(id: number): Promise<ApiResponse<Match | null>> {
  if (!db) return { data: demoMatches.find((match) => Number(match.id) === id) ?? null, source: "demo" };

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
      data: { id: String(row.match.id), chesscomMatchId: row.match.chesscomMatchId, leagueId: row.match.leagueId ? String(row.match.leagueId) : null, name: row.match.name, opponent: row.match.opponent, status: row.match.status, result: row.match.result, teamScore: toNumber(row.match.teamScore), opponentScore: toNumber(row.match.opponentScore), boardCount: row.match.boardCount, startsAt: toIso(row.match.startsAt), endsAt: toIso(row.match.endsAt), leagueSlug: row.league?.slug ?? classifyLeague(row.match.name).leagueSlug, leagueName: row.league?.name ?? null, isOfficialCandidate: Boolean(row.match.isOfficial) },
    };
  } catch (error) {
    logReadFallback("getMatchById", error);
    return { data: demoMatches.find((match) => Number(match.id) === id) ?? null, source: "demo" };
  }
}

export async function getMatchParticipations(matchId: number): Promise<ApiResponse<MatchParticipation[]>> {
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
      data: rows.map((row: any) => ({ matchId: String(row.participation.matchId), playerId: String(row.participation.playerId), username: row.player.username, title: row.player.title, boardNumber: row.participation.boardNumber, score: Number(row.participation.score), gamesPlayed: row.participation.gamesPlayed, wins: row.participation.wins, draws: row.participation.draws, losses: row.participation.losses, timeoutLosses: row.participation.timeoutLosses, upsetWins: row.participation.upsetWins, avgOpponentRating: row.participation.avgOpponentRating, lastPlayedAt: toIso(row.participation.lastPlayedAt) })),
    };
  } catch (error) {
    logReadFallback("getMatchParticipations", error);
    return { data: [], source: "demo" };
  }
}

export async function getMatchGames(matchId: number): Promise<ApiResponse<MatchGame[]>> {
  if (!db) return { data: [], source: "demo" };

  try {
    const whitePlayer = alias(players, "white_player");
    const blackPlayer = alias(players, "black_player");
    const rows = await db
      .select({ game: games, whiteUsername: whitePlayer.username, blackUsername: blackPlayer.username })
      .from(games)
      .leftJoin(whitePlayer, eq(games.whitePlayerId, whitePlayer.id))
      .leftJoin(blackPlayer, eq(games.blackPlayerId, blackPlayer.id))
      .where(eq(games.matchId, matchId))
      .orderBy(games.endTime);
    return {
      source: "database",
      data: rows.map((row: any) => ({ id: String(row.game.id), chesscomGameUuid: row.game.chesscomGameUuid, matchId: row.game.matchId == null ? null : String(row.game.matchId), whiteUsername: row.whiteUsername, blackUsername: row.blackUsername, timeClass: row.game.timeClass, rated: Boolean(row.game.rated), result: row.game.result, endTime: toIso(row.game.endTime) })),
    };
  } catch (error) {
    logReadFallback("getMatchGames", error);
    return { data: [], source: "demo" };
  }
}

export async function getLeagues(): Promise<ApiResponse<League[]>> {
  if (!db) return { data: demoLeagues, source: "demo" };

  try {
    const rows = await db.select().from(leagues).limit(100);
    if (rows.length === 0) return { data: demoLeagues, source: "demo" };
    return {
      source: "database",
      data: rows.map((row: any) => ({ id: String(row.id), name: row.name, slug: row.slug, season: row.season, status: row.status, startsAt: toIso(row.startsAt), endsAt: toIso(row.endsAt) })),
    };
  } catch (error) {
    logReadFallback("getLeagues", error);
    return { data: demoLeagues, source: "demo" };
  }
}

export async function getSyncJobs(): Promise<ApiResponse<SyncJob[]>> {
  if (!db) return { data: demoSyncJobs, source: "demo" };

  try {
    const rows = await db.select().from(syncJobs).orderBy(desc(syncJobs.createdAt)).limit(10);
    if (rows.length === 0) return { data: demoSyncJobs, source: "demo" };
    return {
      source: "database",
      data: rows.map((row: any) => ({ id: String(row.id), type: row.type, status: row.status, message: row.message, recordsProcessed: row.recordsProcessed, errorMessage: row.errorMessage, startedAt: toIso(row.startedAt), finishedAt: toIso(row.finishedAt), createdAt: toIso(row.createdAt) ?? toIso(new Date()) ?? "" })),
    };
  } catch (error) {
    logReadFallback("getSyncJobs", error);
    return { data: demoSyncJobs, source: "demo" };
  }
}

export type LeaderboardSort = "contribution_score" | "points" | "win_rate" | "games";
export type LeaderboardFilters = { league?: string; period?: string; minGames?: number; sort?: LeaderboardSort };

const leaderboardSorters: Record<LeaderboardSort, (row: LeaderboardRow) => number> = {
  contribution_score: (row) => row.contributionScore,
  points: (row) => row.points,
  win_rate: (row) => row.winRate,
  games: (row) => row.games,
};

function normalizeLeaderboardSort(sort: string | undefined): LeaderboardSort {
  if (sort === "points" || sort === "win_rate" || sort === "games") return sort;
  return "contribution_score";
}

function rankLeaderboard(rows: LeaderboardRow[], sort: LeaderboardSort, minGames: number) {
  return rows
    .filter((row) => row.games >= minGames)
    .sort((a, b) => leaderboardSorters[sort](b) - leaderboardSorters[sort](a) || b.contributionScore - a.contributionScore || a.username.localeCompare(b.username))
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

export async function getLeaderboard(filters: LeaderboardFilters = {}): Promise<ApiResponse<LeaderboardRow[]>> {
  const period = filters.period ?? "all";
  const selectedLeague = filters.league && filters.league !== "all" ? filters.league : null;
  const minGames = Math.max(0, filters.minGames ?? 0);
  const sort = normalizeLeaderboardSort(filters.sort);

  if (!db) return { data: rankLeaderboard(demoLeaderboard, sort, minGames), source: "demo" };

  const conditions: SQL[] = [eq(playerContributions.period, period)];
  if (selectedLeague) conditions.push(eq(leagues.slug, selectedLeague));

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
        avgOpponentRating: sql<number | null>`round(sum(${playerContributions.avgOpponentRating} * ${playerContributions.gamesPlayed}) / nullif(sum(${playerContributions.gamesPlayed}), 0))`,
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
        avgOpponentRating: row.avgOpponentRating == null ? null : Number(row.avgOpponentRating),
        lastPlayedAt: toIso(row.lastPlayedAt),
      };
    });

    return { data: rankLeaderboard(data, sort, minGames), source: "database" };
  } catch (error) {
    logReadFallback("getLeaderboard", error);
    return { data: rankLeaderboard(demoLeaderboard, sort, minGames), source: "demo" };
  }
}

export async function getTeamSummary(): Promise<ApiResponse<TeamSummary>> {
  if (!db) return { data: demoSummary, source: "demo" };

  try {
    const [playersResult, matchesResult, leaguesResult, jobsResult] = await Promise.all([getPlayers(), getMatches(), getLeagues(), getSyncJobs()]);
    if ([playersResult.source, matchesResult.source, leaguesResult.source, jobsResult.source].includes("demo")) return { data: demoSummary, source: "demo" };
    return {
      source: "database",
      data: {
        players: playersResult.data.length,
        matches: matchesResult.data.length,
        activeLeagues: leaguesResult.data.filter((league) => league.status === "active").length,
        games: playersResult.data.reduce((sum, player) => sum + player.gamesPlayed, 0),
        lastSync: jobsResult.data[0] ?? null,
      },
    };
  } catch (error) {
    logReadFallback("getTeamSummary", error);
    return { data: demoSummary, source: "demo" };
  }
}

export async function createDemoSyncJob(): Promise<ApiResponse<SyncJob>> {
  if (!db) return { data: { ...demoSyncJobs[0], id: crypto.randomUUID(), message: "Demo sync queued; configure DATABASE_URL for persistence" }, source: "demo" };
  const [row] = await db.insert(syncJobs).values({ type: "matches", status: "queued", message: "Match sync queued from MVP admin endpoint" }).returning();
  return { source: "database", data: { id: String(row.id), type: row.type, status: row.status, message: row.message, recordsProcessed: row.recordsProcessed, errorMessage: row.errorMessage, startedAt: toIso(row.startedAt), finishedAt: toIso(row.finishedAt), createdAt: toIso(row.createdAt) ?? toIso(new Date()) ?? "" } };
}
