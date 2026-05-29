import { and, desc, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@/server/db";
import { leagues, matches, players, syncJobs } from "@/server/db/schema";
import { classifyLeague } from "@/lib/analytics/classifyLeague";
import { demoLeaderboard, demoLeagues, demoMatches, demoPlayers, demoSummary, demoSyncJobs } from "@/lib/demo-data";
import type { ApiResponse, LeaderboardRow, League, Match, Player, SyncJob, TeamSummary } from "@/types";

function toIso(value: Date | string | null | undefined) {
  return value ? new Date(value).toISOString() : null;
}

function toNumber(value: string | number | null | undefined) {
  return value == null ? null : Number(value);
}

export async function getPlayers(): Promise<ApiResponse<Player[]>> {
  if (!db) return { data: demoPlayers, source: "demo" };
  const rows = await db.select().from(players).limit(100);
  if (rows.length === 0) return { data: demoPlayers, source: "demo" };
  return {
    source: "database",
    data: rows.map((row: any) => ({ id: String(row.id), username: row.username, name: row.name, title: row.title, country: row.country, avatarUrl: row.avatarUrl, chesscomUrl: row.chesscomUrl, currentRating: row.currentRating, gamesPlayed: row.gamesPlayed, wins: row.wins, draws: row.draws, losses: row.losses, contributionScore: Number(row.contributionScore), lastSeenAt: toIso(row.lastSeenAt) })),
  };
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
  if (isOfficialOnly) conditions.push(sql`${leagues.slug} is not null and ${leagues.slug} <> 'unknown'`);

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
    data: rows.map((row: any) => ({ id: String(row.match.id), chesscomMatchId: row.match.chesscomMatchId, leagueId: row.match.leagueId ? String(row.match.leagueId) : null, name: row.match.name, opponent: row.match.opponent, status: row.match.status, result: row.match.result, teamScore: toNumber(row.match.teamScore), opponentScore: toNumber(row.match.opponentScore), boardCount: row.match.boardCount, startsAt: toIso(row.match.startsAt), endsAt: toIso(row.match.endsAt), leagueSlug: row.league?.slug ?? classifyLeague(row.match.name).leagueSlug, leagueName: row.league?.name ?? null, isOfficialCandidate: row.league?.slug ? row.league.slug !== "unknown" : classifyLeague(row.match.name).isOfficialCandidate })),
  };
}

export async function getLeagues(): Promise<ApiResponse<League[]>> {
  if (!db) return { data: demoLeagues, source: "demo" };
  const rows = await db.select().from(leagues).limit(100);
  if (rows.length === 0) return { data: demoLeagues, source: "demo" };
  return {
    source: "database",
    data: rows.map((row: any) => ({ id: String(row.id), name: row.name, slug: row.slug, season: row.season, status: row.status, startsAt: toIso(row.startsAt), endsAt: toIso(row.endsAt) })),
  };
}

export async function getSyncJobs(): Promise<ApiResponse<SyncJob[]>> {
  if (!db) return { data: demoSyncJobs, source: "demo" };
  const rows = await db.select().from(syncJobs).orderBy(desc(syncJobs.createdAt)).limit(10);
  if (rows.length === 0) return { data: demoSyncJobs, source: "demo" };
  return {
    source: "database",
    data: rows.map((row: any) => ({ id: String(row.id), type: row.type, status: row.status, message: row.message, recordsProcessed: row.recordsProcessed, errorMessage: row.errorMessage, startedAt: toIso(row.startedAt), finishedAt: toIso(row.finishedAt), createdAt: toIso(row.createdAt) ?? new Date().toISOString() })),
  };
}

export async function getLeaderboard(): Promise<ApiResponse<LeaderboardRow[]>> {
  const playersResult = await getPlayers();
  if (playersResult.source === "demo") return { data: demoLeaderboard, source: "demo" };
  const data = playersResult.data
    .map((player, index) => ({ rank: index + 1, username: player.username, title: player.title, gamesPlayed: player.gamesPlayed, wins: player.wins, draws: player.draws, losses: player.losses, score: player.wins + player.draws * 0.5, contributionScore: player.contributionScore }))
    .sort((a, b) => b.contributionScore - a.contributionScore)
    .map((row, index) => ({ ...row, rank: index + 1 }));
  return { data, source: "database" };
}

export async function getTeamSummary(): Promise<ApiResponse<TeamSummary>> {
  if (!db) return { data: demoSummary, source: "demo" };
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
}

export async function createDemoSyncJob(): Promise<ApiResponse<SyncJob>> {
  if (!db) return { data: { ...demoSyncJobs[0], id: crypto.randomUUID(), message: "Demo sync queued; configure DATABASE_URL for persistence" }, source: "demo" };
  const [row] = await db.insert(syncJobs).values({ type: "matches", status: "queued", message: "Match sync queued from MVP admin endpoint" }).returning();
  return { source: "database", data: { id: String(row.id), type: row.type, status: row.status, message: row.message, recordsProcessed: row.recordsProcessed, errorMessage: row.errorMessage, startedAt: toIso(row.startedAt), finishedAt: toIso(row.finishedAt), createdAt: toIso(row.createdAt) ?? new Date().toISOString() } };
}
