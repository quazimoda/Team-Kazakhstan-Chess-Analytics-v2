import { count, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { games, leagues, matches, matchParticipations, playerArchiveSyncState, playerContributions, players } from "@/server/db/schema";
import { buildDataQualityWarnings } from "./dataQualityWarnings";
import { getBackfillMonthsProgress } from "@/lib/sync/archiveBackfillMonths";

export type DataQualitySummary = {
  source: "database" | "demo";
  playersTotal: number;
  teamMembersTotal: number;
  opponentPlayersTotal: number;
  archiveSyncedPlayers: number;
  archiveSyncedTeamMembers: number;
  archiveBackfillProgressPercent: number;
  teamMembersWithParticipations: number;
  gamesImported: number;
  participationRows: number;
  contributionRows: number;
  officialMatchesWithParticipations: number;
  unknownMatchesCount: number;
  officialLeaguesWithMatchesButNoGames: string[];
  officialMonthsWithZeroArchiveProgress: string[];
  lcalOfficialMatches: number;
  lcalParticipations: number;
  warnings: string[];
};

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  if (!db) {
    const empty = { playersTotal: 0, teamMembersTotal: 0, opponentPlayersTotal: 0, archiveSyncedPlayers: 0, archiveSyncedTeamMembers: 0, archiveBackfillProgressPercent: 0, teamMembersWithParticipations: 0, gamesImported: 0, participationRows: 0, contributionRows: 0, officialMatchesWithParticipations: 0, unknownMatchesCount: 0, officialLeaguesWithMatchesButNoGames: [], officialMonthsWithZeroArchiveProgress: [], lcalOfficialMatches: 0, lcalParticipations: 0 };
    return { source: "demo", ...empty, warnings: ["DATABASE_URL is not configured; data quality requires PostgreSQL."] };
  }

  const [[playersRow], [teamMembersRow], [opponentPlayersRow], [syncedRow], [syncedTeamRow], [teamMembersWithParticipationsRow], [gamesRow], [participationsRow], [contributionsRow], [officialWithParticipationsRow], [unknownRow], leagueGameRows, [lcalRow], monthProgress] = await Promise.all([
    db.select({ value: count() }).from(players),
    db.select({ value: count() }).from(players).where(eq(players.isTeamMember, 1)),
    db.select({ value: count() }).from(players).where(eq(players.isTeamMember, 0)),
    db.select({ value: sql<number>`count(distinct lower(${playerArchiveSyncState.username}))` }).from(playerArchiveSyncState).where(eq(playerArchiveSyncState.status, "success")),
    db.select({ value: sql<number>`count(distinct lower(${playerArchiveSyncState.username}))` }).from(playerArchiveSyncState).innerJoin(players, sql`lower(${players.username}) = lower(${playerArchiveSyncState.username})`).where(sql`${playerArchiveSyncState.status} = ${"success"} and ${players.isTeamMember} = 1`),
    db.select({ value: sql<number>`count(distinct ${players.id})` }).from(players).innerJoin(matchParticipations, eq(players.id, matchParticipations.playerId)).where(eq(players.isTeamMember, 1)),
    db.select({ value: count() }).from(games),
    db.select({ value: count() }).from(matchParticipations),
    db.select({ value: count() }).from(playerContributions),
    db.select({ value: sql<number>`count(distinct ${matches.id})` }).from(matches).innerJoin(matchParticipations, eq(matches.id, matchParticipations.matchId)).where(eq(matches.isOfficial, 1)),
    db.select({ value: count() }).from(matches).leftJoin(leagues, eq(matches.leagueId, leagues.id)).where(sql`${leagues.slug} = ${"unknown"} or ${matches.leagueId} is null`),
    db
      .select({ leagueName: leagues.name, leagueSlug: leagues.slug, matchCount: sql<number>`count(distinct ${matches.id})`, gameCount: sql<number>`count(distinct ${games.id})` })
      .from(leagues)
      .innerJoin(matches, eq(matches.leagueId, leagues.id))
      .leftJoin(games, eq(games.matchId, matches.id))
      .where(eq(matches.isOfficial, 1))
      .groupBy(leagues.id, leagues.name, leagues.slug),
    db
      .select({ officialMatches: sql<number>`count(distinct ${matches.id})`, participations: sql<number>`count(${matchParticipations.playerId})` })
      .from(matches)
      .innerJoin(leagues, eq(matches.leagueId, leagues.id))
      .leftJoin(matchParticipations, eq(matchParticipations.matchId, matches.id))
      .where(sql`${matches.isOfficial} = 1 and lower(${leagues.slug}) = ${"lcal"}`),
    getBackfillMonthsProgress(),
  ]);

  const teamMembersTotal = Number(teamMembersRow?.value ?? 0);
  const archiveSyncedTeamMembers = Number(syncedTeamRow?.value ?? 0);
  const officialLeaguesWithMatchesButNoGames = leagueGameRows
    .filter((row) => Number(row.matchCount ?? 0) > 0 && Number(row.gameCount ?? 0) === 0)
    .map((row) => row.leagueName ?? row.leagueSlug ?? "Unassigned");
  const officialMonthsWithZeroArchiveProgress = monthProgress
    .filter((month) => month.officialMatchCount > 0 && month.progressPercent === 0)
    .map((month) => `${month.year}-${String(month.month).padStart(2, "0")}`);

  const counts = {
    playersTotal: Number(playersRow?.value ?? 0),
    teamMembersTotal,
    opponentPlayersTotal: Number(opponentPlayersRow?.value ?? 0),
    archiveSyncedPlayers: Number(syncedRow?.value ?? 0),
    archiveSyncedTeamMembers,
    archiveBackfillProgressPercent: teamMembersTotal > 0 ? Math.round((archiveSyncedTeamMembers / teamMembersTotal) * 1000) / 10 : 0,
    teamMembersWithParticipations: Number(teamMembersWithParticipationsRow?.value ?? 0),
    gamesImported: Number(gamesRow?.value ?? 0),
    participationRows: Number(participationsRow?.value ?? 0),
    contributionRows: Number(contributionsRow?.value ?? 0),
    officialMatchesWithParticipations: Number(officialWithParticipationsRow?.value ?? 0),
    unknownMatchesCount: Number(unknownRow?.value ?? 0),
    officialLeaguesWithMatchesButNoGames,
    officialMonthsWithZeroArchiveProgress,
    lcalOfficialMatches: Number(lcalRow?.officialMatches ?? 0),
    lcalParticipations: Number(lcalRow?.participations ?? 0),
  };
  return { source: "database", ...counts, warnings: buildDataQualityWarnings(counts) };
}
