import type { GameResult } from "./matchDetailsNormalizer";

export type AggregateInputGame = {
  matchId: number;
  teamUsername: string;
  result: GameResult;
  timeoutLoss: boolean;
  opponentRating: number | null;
  endTime: Date | null;
};

export type ParticipationAggregate = {
  matchId: number;
  username: string;
  boardNumber: null;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  timeoutLosses: number;
  score: number;
  avgOpponentRating: number | null;
  lastPlayedAt: Date | null;
};

export function aggregateMatchedGames(gamesToAggregate: AggregateInputGame[]): ParticipationAggregate[] {
  const aggregates = new Map<string, ParticipationAggregate & { opponentRatingTotal: number; opponentRatedGames: number }>();
  for (const game of gamesToAggregate) {
    const key = `${game.matchId}:${game.teamUsername.toLowerCase()}`;
    const aggregate = aggregates.get(key) ?? { matchId: game.matchId, username: game.teamUsername, boardNumber: null, gamesPlayed: 0, wins: 0, draws: 0, losses: 0, timeoutLosses: 0, score: 0, avgOpponentRating: null, lastPlayedAt: null, opponentRatingTotal: 0, opponentRatedGames: 0 };
    aggregate.gamesPlayed += 1;
    if (game.result === "win") aggregate.wins += 1;
    if (game.result === "draw") aggregate.draws += 1;
    if (game.result === "loss") aggregate.losses += 1;
    if (game.timeoutLoss) aggregate.timeoutLosses += 1;
    aggregate.score += game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0;
    if (game.opponentRating != null) {
      aggregate.opponentRatingTotal += game.opponentRating;
      aggregate.opponentRatedGames += 1;
      aggregate.avgOpponentRating = Math.round(aggregate.opponentRatingTotal / aggregate.opponentRatedGames);
    }
    if (game.endTime && (!aggregate.lastPlayedAt || game.endTime > aggregate.lastPlayedAt)) aggregate.lastPlayedAt = game.endTime;
    aggregates.set(key, aggregate);
  }

  return Array.from(aggregates.values()).map((aggregate) => ({
    matchId: aggregate.matchId,
    username: aggregate.username,
    boardNumber: aggregate.boardNumber,
    gamesPlayed: aggregate.gamesPlayed,
    wins: aggregate.wins,
    draws: aggregate.draws,
    losses: aggregate.losses,
    timeoutLosses: aggregate.timeoutLosses,
    score: aggregate.score,
    avgOpponentRating: aggregate.avgOpponentRating,
    lastPlayedAt: aggregate.lastPlayedAt,
  }));
}
