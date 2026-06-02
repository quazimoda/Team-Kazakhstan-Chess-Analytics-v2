import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dataSourceLabel,
  formatMatchResult,
  isOfficialDailyTimeoutLoss,
  isOfficialDailyTimeoutWin,
} from "./match-detail";

describe("match detail helpers", () => {
  it("formats match result from stored result or completed scores", () => {
    assert.equal(formatMatchResult({ status: "completed", result: "win", teamScore: 1, opponentScore: 9 }), "win");
    assert.equal(formatMatchResult({ status: "completed", result: "pending", teamScore: 5, opponentScore: 4 }), "win");
    assert.equal(formatMatchResult({ status: "completed", result: "pending", teamScore: 4, opponentScore: 5 }), "loss");
    assert.equal(formatMatchResult({ status: "completed", result: "pending", teamScore: 4, opponentScore: 4 }), "draw");
    assert.equal(formatMatchResult({ status: "active", result: "pending", teamScore: 4, opponentScore: 5 }), "pending");
    assert.equal(formatMatchResult({ status: "completed", result: "pending", teamScore: null, opponentScore: 5 }), "unknown");
  });

  it("counts timeout losses and wins only for official Daily games", () => {
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: true, timeClass: "daily", teamPlayerResultText: "timeout" }), true);
    assert.equal(isOfficialDailyTimeoutWin({ isOfficial: true, timeClass: "correspondence", opponentResultText: "timed out" }), true);
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: false, timeClass: "daily", teamPlayerResultText: "timeout" }), false);
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: true, timeClass: "rapid", teamPlayerResultText: "timeout" }), false);
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: true, timeClass: null, teamPlayerResultText: "timeout" }), false);
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: true, timeClass: "daily", teamPlayerResultText: "resigned" }), false);
  });

  it("ignores live timeout-looking results", () => {
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: true, timeClass: "blitz", teamPlayerResultText: "timeout" }), false);
    assert.equal(isOfficialDailyTimeoutLoss({ isOfficial: true, timeClass: "bullet", teamPlayerResultText: "time forfeit" }), false);
    assert.equal(isOfficialDailyTimeoutWin({ isOfficial: true, timeClass: "rapid", opponentResultText: "timedout" }), false);
  });

  it("maps data source labels", () => {
    assert.equal(dataSourceLabel("old_sqlite"), "Old SQLite");
    assert.equal(dataSourceLabel("chesscom_api"), "Chess.com API");
    assert.equal(dataSourceLabel("unknown"), "Unknown");
  });
});
