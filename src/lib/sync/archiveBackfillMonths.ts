import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/server/db";
import { games, matches, matchParticipations, playerArchiveSyncState, players } from "@/server/db/schema";
import { buildBackfillMonthProgress, buildOfficialMatchMonths, toBackfillNumber, type BackfillMonthProgress, type OfficialMatchMonth } from "./archiveBackfillMonthCalculations";

export type { BackfillMonthProgress, OfficialMatchMonth } from "./archiveBackfillMonthCalculations";

export async function getOfficialMatchMonths(): Promise<OfficialMatchMonth[]> {
  if (!db) return [];

  const rows = await db
    .select({
      year: sql<number>`extract(year from ${matches.startsAt})::int`,
      month: sql<number>`extract(month from ${matches.startsAt})::int`,
      matchCount: count(),
    })
    .from(matches)
    .where(and(eq(matches.isOfficial, 1), sql`${matches.startsAt} is not null`))
    .groupBy(sql`extract(year from ${matches.startsAt})::int`, sql`extract(month from ${matches.startsAt})::int`)
    .orderBy(desc(sql`extract(year from ${matches.startsAt})::int`), desc(sql`extract(month from ${matches.startsAt})::int`));

  return buildOfficialMatchMonths(rows);
}

export async function getBackfillMonthProgress(year: number, month: number): Promise<BackfillMonthProgress> {
  if (!db) {
    return buildBackfillMonthProgress({ year, month, officialMatchCount: 0, teamMembersTotal: 0, statusCounts: [], gamesImportedForMonth: 0, participationsForMonth: 0 });
  }

  const monthCondition = and(
    eq(matches.isOfficial, 1),
    sql`${matches.startsAt} is not null`,
    sql`extract(year from ${matches.startsAt})::int = ${year}`,
    sql`extract(month from ${matches.startsAt})::int = ${month}`,
  );

  const [[officialRow], [teamRow], statusRows, [gamesRow], [participationsRow]] = await Promise.all([
    db.select({ value: count() }).from(matches).where(monthCondition),
    db.select({ value: count() }).from(players).where(eq(players.isTeamMember, 1)),
    db
      .select({ status: playerArchiveSyncState.status, value: sql<number>`count(distinct lower(${playerArchiveSyncState.username}))` })
      .from(playerArchiveSyncState)
      .innerJoin(players, sql`lower(${players.username}) = lower(${playerArchiveSyncState.username})`)
      .where(and(eq(playerArchiveSyncState.year, year), eq(playerArchiveSyncState.month, month), eq(players.isTeamMember, 1)))
      .groupBy(playerArchiveSyncState.status),
    db.select({ value: count(games.id) }).from(games).innerJoin(matches, eq(games.matchId, matches.id)).where(monthCondition),
    db.select({ value: count(matchParticipations.playerId) }).from(matchParticipations).innerJoin(matches, eq(matchParticipations.matchId, matches.id)).where(monthCondition),
  ]);

  return buildBackfillMonthProgress({
    year,
    month,
    officialMatchCount: toBackfillNumber(officialRow?.value),
    teamMembersTotal: toBackfillNumber(teamRow?.value),
    statusCounts: statusRows,
    gamesImportedForMonth: toBackfillNumber(gamesRow?.value),
    participationsForMonth: toBackfillNumber(participationsRow?.value),
  });
}

export async function getBackfillMonthsProgress(): Promise<BackfillMonthProgress[]> {
  const months = await getOfficialMatchMonths();
  return Promise.all(months.map((month) => getBackfillMonthProgress(month.year, month.month)));
}
