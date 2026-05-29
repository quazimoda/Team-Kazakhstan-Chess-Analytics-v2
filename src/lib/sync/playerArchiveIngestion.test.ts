import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { gameBelongsToMatch, extractChesscomMatchIdsFromText, findMatchingImportedMatch } from "./matchGameMatcher";
import { mapChessComResult } from "./matchDetailsNormalizer";
import { aggregateMatchedGames } from "./playerArchiveAggregation";

const importedMatch = {
  id: 42,
  chesscomMatchId: 3151163,
  name: "LCAL LIVE960 LEAGUE RD4: Team Pakistan vs Team Kazakhstan",
  chesscomUrl: "https://api.chess.com/pub/match/live/3151163",
  rawMatch: { "@id": "https://api.chess.com/pub/match/live/3151163", name: "LCAL LIVE960 LEAGUE RD4: Team Pakistan vs Team Kazakhstan" },
};

describe("Chess.com player archive ingestion helpers", () => {
  it("extracts Chess.com match ids from URLs and PGN links", () => {
    assert.deepEqual(extractChesscomMatchIdsFromText('[Link "https://api.chess.com/pub/match/live/3151163"]'), [3151163]);
    assert.deepEqual(extractChesscomMatchIdsFromText("https://api.chess.com/pub/match/12345"), [12345]);
    assert.deepEqual(extractChesscomMatchIdsFromText("no match link here"), []);
  });

  it("detects games that belong to imported matches by URL, PGN, id, or name", () => {
    assert.equal(gameBelongsToMatch({ url: "https://www.chess.com/game/live/1?match=3151163" }, importedMatch), true);
    assert.equal(gameBelongsToMatch({ pgn: '[Link "https://api.chess.com/pub/match/live/3151163"]' }, importedMatch), true);
    assert.equal(gameBelongsToMatch({ pgn: "LCAL LIVE960 LEAGUE RD4: Team Pakistan vs Team Kazakhstan" }, importedMatch), true);
    assert.equal(gameBelongsToMatch({ url: "https://www.chess.com/game/live/999" }, importedMatch), false);
    assert.equal(findMatchingImportedMatch({ pgn: "match/live/3151163" }, [importedMatch])?.id, 42);
  });

  it("maps archive game result strings into normalized analytics results", () => {
    assert.equal(mapChessComResult("win"), "win");
    assert.equal(mapChessComResult("repetition"), "draw");
    assert.equal(mapChessComResult("timevsinsufficient"), "draw");
    assert.equal(mapChessComResult("timeout"), "loss");
    assert.equal(mapChessComResult("abandoned"), "loss");
  });

  it("aggregates matched archive games into match participation stats", () => {
    const last = new Date("2026-05-29T12:00:00Z");
    const aggregate = aggregateMatchedGames([
      { matchId: 42, teamUsername: "KazPlayer", result: "win", timeoutLoss: false, opponentRating: 2100, endTime: new Date("2026-05-29T10:00:00Z") },
      { matchId: 42, teamUsername: "kazplayer", result: "draw", timeoutLoss: false, opponentRating: 2000, endTime: last },
      { matchId: 42, teamUsername: "KazPlayer", result: "loss", timeoutLoss: true, opponentRating: null, endTime: null },
    ]);

    assert.equal(aggregate.length, 1);
    assert.equal(aggregate[0]?.gamesPlayed, 3);
    assert.equal(aggregate[0]?.wins, 1);
    assert.equal(aggregate[0]?.draws, 1);
    assert.equal(aggregate[0]?.losses, 1);
    assert.equal(aggregate[0]?.timeoutLosses, 1);
    assert.equal(aggregate[0]?.score, 1.5);
    assert.equal(aggregate[0]?.avgOpponentRating, 2050);
    assert.equal(aggregate[0]?.lastPlayedAt, last);
  });
});
