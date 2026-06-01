import assert from "node:assert/strict";
import test from "node:test";
import { normalizedGameKeys } from "./oldSqliteOfficial";
import { buildNormalizedDuplicateGameKeyRows, csvEscape, formatCsv, summarizeSuspiciousRows } from "./dataQualityReport";

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

test("buildNormalizedDuplicateGameKeyRows detects Chess.com numeric ids across URL forms", () => {
  const rows = buildNormalizedDuplicateGameKeyRows(
    [
      {
        game_id: 10,
        chesscom_game_uuid: "https://www.chess.com/game/daily/12345?move=8",
        raw_url: null,
        raw_game_url: null,
        raw_link: null,
      },
      {
        game_id: 11,
        chesscom_game_uuid: "legacy-row-11",
        raw_url: null,
        raw_game_url: "https://www.chess.com/game/daily/12345",
        raw_link: null,
      },
      {
        game_id: 12,
        chesscom_game_uuid: "https://www.chess.com/game/live/99999",
        raw_url: null,
        raw_game_url: null,
        raw_link: null,
      },
    ],
    normalizedGameKeys,
  );

  const numericDuplicate = rows.find((row) => row.normalized_key === "12345");
  assert.ok(numericDuplicate);
  assert.equal(numericDuplicate.check_type, "normalized_duplicate_game_key");
  assert.equal(numericDuplicate.occurrence_count, 2);
  assert.match(numericDuplicate.detail, /sample_game_ids=10\|11/);
  assert.match(numericDuplicate.detail, /chesscom_game_uuid/);
});
