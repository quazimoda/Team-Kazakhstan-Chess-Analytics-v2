import { describe, expect, it } from "vitest";
import { BASE_RESULT_POINTS, calculateContributionScore } from "./contributionScore";

describe("calculateContributionScore", () => {
  it("exposes MVP base result points", () => {
    expect(BASE_RESULT_POINTS).toEqual({ win: 3, draw: 2, loss: 1, timeoutLoss: -1 });
  });

  it("calculates contribution score, win rate, and chess points", () => {
    expect(calculateContributionScore({ games: 10, wins: 5, draws: 3, losses: 2, timeoutLosses: 1, upsetWins: 2 })).toEqual({
      points: 6.5,
      winRate: 50,
      contributionScore: 22,
    });
  });

  it("returns a zero win rate when there are no games", () => {
    expect(calculateContributionScore({ games: 0, wins: 0, draws: 0, losses: 0 })).toEqual({ points: 0, winRate: 0, contributionScore: 0 });
  });
});
