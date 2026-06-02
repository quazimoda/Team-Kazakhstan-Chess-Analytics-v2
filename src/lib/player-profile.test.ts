import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatWinRate,
  isDailyTimeoutLoss,
  mapProfileSummary,
  normalizeProfileUsername,
} from "./player-profile";

describe("player profile helpers", () => {
  it("formats win rates with one decimal and handles empty totals", () => {
    assert.equal(formatWinRate(7, 10), "70.0%");
    assert.equal(formatWinRate(0, 0), "0.0%");
  });

  it("normalizes usernames for profile lookup", () => {
    assert.equal(normalizeProfileUsername(" Bruno_Asfalto "), "bruno_asfalto");
    assert.equal(normalizeProfileUsername("   "), null);
  });

  it("maps profile summary values and derived win rate", () => {
    const summary = mapProfileSummary({
      gamesPlayed: 8,
      wins: 5,
      draws: 1,
      losses: 2,
      contributionScore: 21.5,
      matchesPlayed: 4,
      bestLeagueName: "Daily Chess League",
    });

    assert.equal(summary.winRate, 62.5);
    assert.equal(summary.formattedWinRate, "62.5%");
    assert.equal(summary.bestLeagueName, "Daily Chess League");
  });

  it("counts a daily timeout loss", () => {
    assert.equal(isDailyTimeoutLoss({ timeClass: "daily", playerResult: "timeout" }), true);
  });

  it("does not count a daily non-timeout loss", () => {
    assert.equal(isDailyTimeoutLoss({ timeClass: "daily", playerResult: "resigned" }), false);
  });

  it("does not count a live loss on time as a daily timeout", () => {
    assert.equal(isDailyTimeoutLoss({ timeClass: "blitz", playerResult: "timeout" }), false);
  });

  it("ignores live timeout-looking results", () => {
    assert.equal(isDailyTimeoutLoss({ timeClass: "rapid", playerResult: "timed out" }), false);
  });

  it("does not count missing or unknown time classes", () => {
    assert.equal(isDailyTimeoutLoss({ timeClass: null, playerResult: "timeout" }), false);
    assert.equal(isDailyTimeoutLoss({ timeClass: "unknown", playerResult: "timeout" }), false);
  });
});
