import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BASE_RESULT_POINTS, calculateContributionScore } from "./contributionScore";

describe("calculateContributionScore", () => {
  it("exposes MVP base result points", () => {
    assert.deepEqual(BASE_RESULT_POINTS, { win: 3, draw: 2, loss: 1, timeoutLoss: -1 });
  });

  it("calculates contribution score, win rate, and chess points", () => {
    assert.deepEqual(calculateContributionScore({ games: 10, wins: 5, draws: 3, losses: 2, timeoutLosses: 1, upsetWins: 2 }), {
      points: 6.5,
      winRate: 50,
      contributionScore: 24,
    });
  });

  it("returns a zero win rate when there are no games", () => {
    assert.deepEqual(calculateContributionScore({ games: 0, wins: 0, draws: 0, losses: 0 }), { points: 0, winRate: 0, contributionScore: 0 });
  });
});
