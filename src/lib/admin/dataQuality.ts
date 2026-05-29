import { count, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { games, leagues, matches, matchParticipations, playerArchiveSyncState, playerContributions, players } from "@/server/db/schema";
import { buildDataQualityWarnings } from "./dataQualityWarnings";

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
  warnings: string[];
};

export async function getDataQualitySummary(): Promise<DataQualitySummary> {
  if (!db) {
    const empty = { playersTotal: 0, teamMembersTotal: 0, opponentPlayersTotal: 0, archiveSyncedPlayers: 0, archiveSyncedTeamMembers: 0, archiveBackfillProgressPercent: 0, teamMembersWithParticipations: 0, gamesImported: 0, participationRows: 0, contributionRows: 0, officialMatchesWithParticipations: 0, unknownMatchesCount: 0 };
    return { source: "demo", ...empty, warnings: ["DATABASE_URL is not configured; data quality requires PostgreSQL."] };
  }

  const [[playersRow], [teamMembersRow], [opponentPlayersRow], [syncedRow], [syncedTeamRow], [teamMembersWithParticipationsRow], [gamesRow], [participationsRow], [contributionsRow], [officialWithParticipationsRow], [unknownRow]] = await Promise.all([
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
  ]);

  const teamMembersTotal = Number(teamMembersRow?.value ?? 0);
  const archiveSyncedTeamMembers = Number(syncedTeamRow?.value ?? 0);
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
  };
  return { source: "database", ...counts, warnings: buildDataQualityWarnings(counts) };
}
