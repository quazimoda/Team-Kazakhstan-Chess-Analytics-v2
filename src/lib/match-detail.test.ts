import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dataSourceLabel,
  formatMatchResult,
  isDailyGame,
  isDailyTimeoutLoss,
  isDailyTimeoutWin,
} from "./match-detail";

describe("match detail helpers", () => {
  it("formats match and game results for display", () => {
    assert.equal(formatMatchResult("win"), "Win");
    assert.equal(formatMatchResult("loss"), "Loss");
    assert.equal(formatMatchResult("draw"), "Draw");
    assert.equal(formatMatchResult("pending"), "Pending");
    assert.equal(formatMatchResult("unknown"), "Unknown");
  });

  it("labels data sources", () => {
    assert.equal(dataSourceLabel("old_sqlite"), "Old SQLite");
    assert.equal(dataSourceLabel("chesscom_api"), "Chess.com API");
    assert.equal(dataSourceLabel("unknown"), "Unknown");
    assert.equal(dataSourceLabel(null), "Unknown");
  });

  it("recognizes only daily/correspondence time classes", () => {
    assert.equal(isDailyGame("daily"), true);
    assert.equal(isDailyGame(" correspondence "), true);
    assert.equal(isDailyGame("daily960"), true);
    assert.equal(isDailyGame("blitz"), false);
    assert.equal(isDailyGame("rapid"), false);
    assert.equal(isDailyGame(null), false);
  });

  it("counts conservative daily timeout losses", () => {
    assert.equal(isDailyTimeoutLoss({ timeClass: "daily", playerResult: "timeout" }), true);
    assert.equal(isDailyTimeoutLoss({ timeClass: "correspondence", playerResult: "time_forfeit" }), true);
    assert.equal(isDailyTimeoutLoss({ timeClass: "blitz", playerResult: "timeout" }), false);
    assert.equal(isDailyTimeoutLoss({ timeClass: "daily", playerResult: "resigned" }), false);
    assert.equal(isDailyTimeoutLoss({ timeClass: "unknown", playerResult: "timeout" }), false);
  });

  it("counts conservative daily timeout wins", () => {
    assert.equal(isDailyTimeoutWin({ timeClass: "daily", opponentResult: "timed out" }), true);
    assert.equal(isDailyTimeoutWin({ timeClass: "rapid", opponentResult: "timed out" }), false);
    assert.equal(isDailyTimeoutWin({ timeClass: "daily", opponentResult: "checkmated" }), false);
  });
});
