import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  formatWinRate,
  isDailyTimeoutLoss,
  mapProfileSummary,
  normalizeProfileUsername,
  resultFromViewedPlayerPerspective,
  shouldCountOfficialDailyTimeoutLoss,
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

  it("keeps Team Kazakhstan player results unchanged", () => {
    assert.equal(resultFromViewedPlayerPerspective({ storedTeamResult: "win", viewedPlayerIsTeamPlayer: true }), "win");
    assert.equal(resultFromViewedPlayerPerspective({ storedTeamResult: "loss", viewedPlayerIsTeamPlayer: true }), "loss");
  });

  it("inverts the result when the viewed player is the opponent", () => {
    assert.equal(resultFromViewedPlayerPerspective({ storedTeamResult: "win", viewedPlayerIsTeamPlayer: false }), "loss");
    assert.equal(resultFromViewedPlayerPerspective({ storedTeamResult: "loss", viewedPlayerIsTeamPlayer: false }), "win");
    assert.equal(resultFromViewedPlayerPerspective({ storedTeamResult: "draw", viewedPlayerIsTeamPlayer: false }), "draw");
    assert.equal(resultFromViewedPlayerPerspective({ storedTeamResult: "unknown", viewedPlayerIsTeamPlayer: false }), "unknown");
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

  it("does not count unmatched daily timeout games without a match id", () => {
    assert.equal(shouldCountOfficialDailyTimeoutLoss({ timeClass: "daily", playerResult: "timeout", matchId: null, matchIsOfficial: true }), false);
  });

  it("counts official daily timeout games", () => {
    assert.equal(shouldCountOfficialDailyTimeoutLoss({ timeClass: "daily", playerResult: "timeout", matchId: 123, matchIsOfficial: true }), true);
  });

  it("does not count official live timeout-looking results", () => {
    assert.equal(shouldCountOfficialDailyTimeoutLoss({ timeClass: "blitz", playerResult: "timeout", matchId: 123, matchIsOfficial: true }), false);
  });
});
