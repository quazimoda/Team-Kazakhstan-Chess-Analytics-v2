import { calculateContributionScore } from "./contributionScore";
import { toDateOrNull } from "../dates";

export type PlayerContributionAggregateRow = {
  playerId: number;
  leagueId: number | null;
  matchesPlayed: unknown;
  gamesPlayed: unknown;
  wins: unknown;
  draws: unknown;
  losses: unknown;
  timeoutLosses: unknown;
  upsetWins: unknown;
  avgOpponentRating: unknown;
  lastPlayedAt: unknown;
};

export function numeric(value: unknown) {
  if (value == null) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildPlayerContributionInsertValues(row: PlayerContributionAggregateRow, period: "all", calculatedAt: Date) {
  const gamesPlayed = numeric(row.gamesPlayed);
  const wins = numeric(row.wins);
  const draws = numeric(row.draws);
  const losses = numeric(row.losses);
  const timeoutLosses = numeric(row.timeoutLosses);
  const upsetWins = numeric(row.upsetWins);
  const metrics = calculateContributionScore({ games: gamesPlayed, wins, draws, losses, timeoutLosses, upsetWins });

  return {
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
    lastPlayedAt: toDateOrNull(row.lastPlayedAt),
    contributionScore: metrics.contributionScore.toFixed(2),
    calculatedAt,
  };
}
