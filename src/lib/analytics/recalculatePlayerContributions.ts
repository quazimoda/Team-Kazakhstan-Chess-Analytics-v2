import { and, eq, sql } from "drizzle-orm";
import { buildPlayerContributionInsertValues } from "@/lib/analytics/playerContributionInsert";
import { db } from "@/server/db";
import { matches, matchParticipations, playerContributions } from "@/server/db/schema";

export type RecalculatePlayerContributionsOptions = {
  leagueId?: number | null;
  period?: "all";
};

export type RecalculatePlayerContributionsSummary = {
  source: "database" | "demo";
  period: "all";
  leagueId: number | null;
  rowsWritten: number;
};


export async function recalculatePlayerContributions(options: RecalculatePlayerContributionsOptions = {}): Promise<RecalculatePlayerContributionsSummary> {
  const period = options.period ?? "all";
  const leagueId = options.leagueId ?? null;
  const shouldRecalculateEveryLeague = options.leagueId === undefined;

  if (!db) throw new Error("DATABASE_URL is not configured; contribution recalculation requires PostgreSQL");

  const conditions = [eq(matches.isOfficial, 1)];
  if (!shouldRecalculateEveryLeague && leagueId != null) conditions.push(eq(matches.leagueId, leagueId));
  if (!shouldRecalculateEveryLeague && leagueId == null) conditions.push(sql`${matches.leagueId} is null`);

  const aggregates = await db
    .select({
      playerId: matchParticipations.playerId,
      leagueId: matches.leagueId,
      matchesPlayed: sql<number>`count(distinct ${matchParticipations.matchId})`,
      gamesPlayed: sql<number>`coalesce(sum(${matchParticipations.gamesPlayed}), 0)`,
      wins: sql<number>`coalesce(sum(${matchParticipations.wins}), 0)`,
      draws: sql<number>`coalesce(sum(${matchParticipations.draws}), 0)`,
      losses: sql<number>`coalesce(sum(${matchParticipations.losses}), 0)`,
      timeoutLosses: sql<number>`coalesce(sum(${matchParticipations.timeoutLosses}), 0)`,
      upsetWins: sql<number>`coalesce(sum(${matchParticipations.upsetWins}), 0)`,
      avgOpponentRating: sql<number | null>`round(sum(${matchParticipations.avgOpponentRating} * ${matchParticipations.gamesPlayed}) / nullif(sum(${matchParticipations.gamesPlayed}), 0))`,
      lastPlayedAt: sql<Date | null>`max(coalesce(${matchParticipations.lastPlayedAt}, ${matches.endsAt}, ${matches.startsAt}))`,
    })
    .from(matchParticipations)
    .innerJoin(matches, eq(matchParticipations.matchId, matches.id))
    .where(and(...conditions))
    .groupBy(matchParticipations.playerId, matches.leagueId);

  const deleteCondition = shouldRecalculateEveryLeague
    ? eq(playerContributions.period, period)
    : leagueId == null
      ? and(eq(playerContributions.period, period), sql`${playerContributions.leagueId} is null`)
      : and(eq(playerContributions.period, period), eq(playerContributions.leagueId, leagueId));
  await db.delete(playerContributions).where(deleteCondition);

  const now = new Date();
  for (const row of aggregates) {
    await db.insert(playerContributions).values(buildPlayerContributionInsertValues(row, period, now));
  }

  return { source: "database", period, leagueId, rowsWritten: aggregates.length };
}
