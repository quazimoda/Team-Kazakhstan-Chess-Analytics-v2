import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isTimeoutLoss, mapChessComResult, mapPlayerColor, normalizeMatchDetails } from "./matchDetailsNormalizer";

describe("Chess.com match detail normalization", () => {
  it("maps Chess.com win/loss/draw result strings", () => {
    assert.equal(mapChessComResult("win"), "win");
    assert.equal(mapChessComResult("resigned"), "loss");
    assert.equal(mapChessComResult("timeout"), "loss");
    assert.equal(mapChessComResult("agreed"), "draw");
    assert.equal(mapChessComResult("stalemate"), "draw");
    assert.equal(mapChessComResult("mystery"), "unknown");
  });

  it("detects timeout losses when Chess.com exposes a timeout result", () => {
    assert.equal(isTimeoutLoss("timeout"), true);
    assert.equal(isTimeoutLoss("resigned"), false);
    assert.equal(isTimeoutLoss(undefined), false);
  });

  it("maps player colors from game white/black usernames", () => {
    const game = { white: { username: "KazPlayer" }, black: { username: "Opponent" } };
    assert.equal(mapPlayerColor(game, "kazplayer"), "white");
    assert.equal(mapPlayerColor(game, "Opponent"), "black");
    assert.equal(mapPlayerColor(game, "Missing"), "unknown");
  });

  it("normalizes games and participations while tolerating missing unknown fields", () => {
    const normalized = normalizeMatchDetails({
      teams: { "team-kazakhstan": { name: "Team Kazakhstan", players: [{ username: "KazPlayer" }] } },
      boards: [{
        board: 1,
        games: [
          { uuid: "game-1", white: { username: "KazPlayer", rating: 1800, result: "win" }, black: { username: "Opponent", rating: 1905, result: "checkmated" }, end_time: 1_700_000_000 },
          { uuid: "game-2", white: { username: "Opponent", rating: 1905, result: "win" }, black: { username: "KazPlayer", rating: 1800, result: "timeout" } },
          { white: { username: "KazPlayer", result: "win" }, black: { username: "NoUuid" } },
        ],
      }],
    });

    assert.equal(normalized.games.length, 2);
    assert.equal(normalized.participations.length, 1);
    assert.equal(normalized.participations[0]?.username, "KazPlayer");
    assert.equal(normalized.participations[0]?.gamesPlayed, 2);
    assert.equal(normalized.participations[0]?.wins, 1);
    assert.equal(normalized.participations[0]?.losses, 1);
    assert.equal(normalized.participations[0]?.timeoutLosses, 1);
    assert.equal(normalized.participations[0]?.upsetWins, 1);
    assert.ok(normalized.warnings.some((warning) => warning.includes("UUID")));
  });

  it("returns an empty normalization with a warning when details are missing boards and games", () => {
    const normalized = normalizeMatchDetails({ name: "Unknown shape" });
    assert.deepEqual(normalized.games, []);
    assert.deepEqual(normalized.participations, []);
    assert.ok(normalized.warnings.length > 0);
  });
});
