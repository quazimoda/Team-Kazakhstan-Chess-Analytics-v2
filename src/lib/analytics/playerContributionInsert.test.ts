import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildPlayerContributionInsertValues } from "./playerContributionInsert";

describe("player contribution insert normalization", () => {
  it("normalizes aggregate string lastPlayedAt values before insert", () => {
    const calculatedAt = new Date("2026-05-29T12:00:00.000Z");
    const values = buildPlayerContributionInsertValues({
      playerId: 1,
      leagueId: null,
      matchesPlayed: "1",
      gamesPlayed: "2",
      wins: "1",
      draws: "1",
      losses: "0",
      timeoutLosses: "0",
      upsetWins: "0",
      avgOpponentRating: "2100",
      lastPlayedAt: "2026-05-29T10:30:00.000Z",
    }, "all", calculatedAt);

    assert.ok(values.lastPlayedAt instanceof Date);
    assert.equal(values.lastPlayedAt.toISOString(), "2026-05-29T10:30:00.000Z");
  });

  it("uses null for invalid aggregate lastPlayedAt values", () => {
    const values = buildPlayerContributionInsertValues({
      playerId: 1,
      leagueId: null,
      matchesPlayed: 0,
      gamesPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      timeoutLosses: 0,
      upsetWins: 0,
      avgOpponentRating: null,
      lastPlayedAt: "not a timestamp",
    }, "all", new Date("2026-05-29T12:00:00.000Z"));

    assert.equal(values.lastPlayedAt, null);
  });
});
