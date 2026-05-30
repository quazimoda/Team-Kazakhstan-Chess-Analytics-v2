import assert from "node:assert/strict";
import test from "node:test";
import {
  evaluateCandidateEligibility,
  executeImportPlan,
  extractPgnTags,
  normalizedGameKeys,
  resultForColor,
  type CurrentMatchForImport,
  type OldSqliteGameRow,
} from "./oldSqliteOfficial";

function row(overrides: Partial<OldSqliteGameRow> = {}): OldSqliteGameRow {
  return {
    game_url: "https://www.chess.com/game/daily/999",
    date: 20200101,
    time_class: "daily",
    time_control: "1/86400",
    rules: "chess",
    player: "KazPlayer",
    opponent: "Opponent",
    result: "win",
    pgn: '[Event "Team Match"]\n[Match "https://www.chess.com/club/matches/12345"]\n[White "KazPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[Link "https://www.chess.com/game/daily/999"]',
    ...overrides,
  };
}

const officialMatch: CurrentMatchForImport = { id: 7, chesscomMatchId: 12345, isOfficial: true, leagueId: 3, leagueSlug: "lcwl" };

test("extractPgnTags extracts daily and live Chess.com club match ids", () => {
  assert.equal(extractPgnTags('[Match "https://www.chess.com/club/matches/12345"]')?.chesscomMatchId, 12345);
  assert.equal(extractPgnTags('[Match "https://www.chess.com/club/matches/live/67890"]')?.chesscomMatchId, 67890);
});

test("evaluateCandidateEligibility accepts only official league matches with importable rules and no duplicate", () => {
  const matches = new Map([[officialMatch.chesscomMatchId, officialMatch]]);
  assert.equal(evaluateCandidateEligibility(row(), matches, new Set()).reason, "candidate");
  assert.equal(evaluateCandidateEligibility(row({ rules: "crazyhouse" }), matches, new Set()).reason, "invalid_rules");
  assert.equal(evaluateCandidateEligibility(row(), new Map(), new Set()).reason, "unmatched");
  const nonOfficial = new Map([[officialMatch.chesscomMatchId, { ...officialMatch, isOfficial: false }]]);
  assert.equal(evaluateCandidateEligibility(row(), nonOfficial, new Set()).reason, "non_official");
});

test("evaluateCandidateEligibility detects duplicates from normalized raw_game URLs", () => {
  const matches = new Map([[officialMatch.chesscomMatchId, officialMatch]]);
  const existingKeys = new Set(normalizedGameKeys("https://www.chess.com/game/daily/999?move=12"));
  const evaluation = evaluateCandidateEligibility(row(), matches, existingKeys);
  assert.equal(evaluation.reason, "duplicate");
  assert.ok(evaluation.duplicateKeys.includes("999"));
});

test("resultForColor derives win draw loss from PGN result and player color", () => {
  assert.equal(resultForColor("1-0", "white"), "win");
  assert.equal(resultForColor("1-0", "black"), "loss");
  assert.equal(resultForColor("0-1", "black"), "win");
  assert.equal(resultForColor("1/2-1/2", "white"), "draw");
  assert.equal(resultForColor("*", "black"), "unknown");
});

test("executeImportPlan dry-run mode does not call writeCandidate", async () => {
  let writes = 0;
  const result = await executeImportPlan({ dryRun: true, candidates: [1, 2, 3], writeCandidate: async () => { writes += 1; } });
  assert.equal(result.written, 0);
  assert.equal(writes, 0);
});
