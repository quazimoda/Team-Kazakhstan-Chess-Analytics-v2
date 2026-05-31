import assert from "node:assert/strict";
import test from "node:test";
import { calculateContributionScore } from "./contributionScore";
import { createRecalculateOldSqliteSummary, isOldSqliteRecalculationEnabled, parseTargetLeagueIds } from "../import/recalculateOldSqliteContributions";

test("parseTargetLeagueIds defaults to the old SQLite affected league ids", () => {
  assert.deepEqual(parseTargetLeagueIds(undefined), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.deepEqual(parseTargetLeagueIds("8, 1, 1, 3"), [1, 3, 8]);
});

test("parseTargetLeagueIds rejects empty or unrelated league ids", () => {
  assert.throws(() => parseTargetLeagueIds("", []), /must not be empty/);
  assert.throws(() => parseTargetLeagueIds("1,9"), /invalid: 9/);
});

test("isOldSqliteRecalculationEnabled requires the exact true gate", () => {
  assert.equal(isOldSqliteRecalculationEnabled("true"), true);
  assert.equal(isOldSqliteRecalculationEnabled("TRUE"), false);
  assert.equal(isOldSqliteRecalculationEnabled(undefined), false);
});

test("old SQLite contribution score formula matches importer behavior", () => {
  assert.equal(calculateContributionScore({ games: 10, wins: 5, draws: 3, losses: 2, timeoutLosses: 1, upsetWins: 2 }).contributionScore, 24);
});

test("createRecalculateOldSqliteSummary keeps the required summary shape", () => {
  assert.deepEqual(
    createRecalculateOldSqliteSummary({
      dryRun: true,
      target_league_ids: [1, 2],
      existing_contribution_rows_before: 4,
      rows_to_delete: 4,
      rows_to_insert: 3,
      inserted_rows: 0,
      touched_player_count: 2,
      touched_match_count: 5,
      touched_participation_count: 6,
    }),
    {
      mode: "dry-run",
      target_league_ids: [1, 2],
      existing_contribution_rows_before: 4,
      rows_to_delete: 4,
      rows_to_insert: 3,
      inserted_rows: 0,
      touched_player_count: 2,
      touched_match_count: 5,
      touched_participation_count: 6,
      recalculation_required_after: true,
    },
  );
});
