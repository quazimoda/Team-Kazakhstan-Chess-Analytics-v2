export type ContributionInput = {
  games: number;
  wins: number;
  draws: number;
  losses: number;
  timeoutLosses?: number;
  upsetWins?: number;
};

export type ContributionMetrics = {
  points: number;
  winRate: number;
  contributionScore: number;
};

export const BASE_RESULT_POINTS = {
  win: 3,
  draw: 2,
  loss: 1,
  timeoutLoss: -1,
} as const;

function normalizeCount(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0;
}

export function calculateContributionScore(input: ContributionInput): ContributionMetrics {
  const games = normalizeCount(input.games);
  const wins = normalizeCount(input.wins);
  const draws = normalizeCount(input.draws);
  const losses = normalizeCount(input.losses);
  const timeoutLosses = normalizeCount(input.timeoutLosses);
  const upsetWins = normalizeCount(input.upsetWins);

  return {
    points: wins * 1 + draws * 0.5,
    winRate: games > 0 ? (wins / games) * 100 : 0,
    contributionScore: wins * BASE_RESULT_POINTS.win + draws * BASE_RESULT_POINTS.draw + losses * BASE_RESULT_POINTS.loss - timeoutLosses * 2 + upsetWins * 1.5,
  };
}
