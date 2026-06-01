import assert from "node:assert/strict";
import test from "node:test";
import { csvEscape, formatCsv, summarizeSuspiciousRows } from "./dataQualityReport";

test("csvEscape formats nullable, quoted, and Date values", () => {
  assert.equal(csvEscape(null), "");
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape('a,"b"'), '"a,""b"""');
  assert.equal(csvEscape(new Date("2024-01-02T03:04:05.000Z")), "2024-01-02T03:04:05.000Z");
});

test("formatCsv writes headers and escaped row values", () => {
  assert.equal(formatCsv([{ name: 'Doe, Jane', score: 4 }] as const, ["name", "score"]), 'name,score\n"Doe, Jane",4\n');
});

test("summarizeSuspiciousRows counts duplicate row occurrences", () => {
  assert.deepEqual(
    summarizeSuspiciousRows([
      { check_type: "duplicate_chesscom_game_uuid", occurrence_count: 2 },
      { check_type: "duplicate_chesscom_game_uuid", occurrence_count: 3 },
      { check_type: "game_null_match_id", occurrence_count: 1 },
    ]),
    { duplicate_chesscom_game_uuid: 5, game_null_match_id: 1 },
  );
});
