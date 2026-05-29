import { and, eq, sql } from "drizzle-orm";
import { calculateContributionScore } from "@/lib/analytics/contributionScore";
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

function numeric(value: unknown) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

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
    const gamesPlayed = numeric(row.gamesPlayed);
    const wins = numeric(row.wins);
    const draws = numeric(row.draws);
    const losses = numeric(row.losses);
    const timeoutLosses = numeric(row.timeoutLosses);
    const upsetWins = numeric(row.upsetWins);
    const metrics = calculateContributionScore({ games: gamesPlayed, wins, draws, losses, timeoutLosses, upsetWins });

    await db.insert(playerContributions).values({
      playerId: row.playerId,
      leagueId: row.leagueId,
      period,
      matchesPlayed: numeric(row.matchesPlayed),
      gamesPlayed,
      wins,
      draws,
      losses,
      timeoutLosses,
      upsetWins,
      points: metrics.points.toFixed(2),
      score: metrics.points.toFixed(2),
      winRate: metrics.winRate.toFixed(2),
      avgOpponentRating: row.avgOpponentRating == null ? null : numeric(row.avgOpponentRating),
      lastPlayedAt: row.lastPlayedAt,
      contributionScore: metrics.contributionScore.toFixed(2),
      calculatedAt: now,
    });
  }

  return { source: "database", period, leagueId, rowsWritten: aggregates.length };
}
