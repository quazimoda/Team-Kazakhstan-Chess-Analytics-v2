import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildBackfillMonthProgress, buildOfficialMatchMonths, calculateBackfillProgressPercent } from "./archiveBackfillMonthCalculations";
import { isRetryFailedArchiveCandidateForMonth } from "./playerArchiveSyncOptions";

describe("archive backfill month helpers", () => {
  it("groups official match rows by year/month and orders newest first", () => {
    const months = buildOfficialMatchMonths([
      { year: 2025, month: 6, matchCount: 2 },
      { year: "2026", month: "5", matchCount: "3" },
      { year: 2025, month: 5, matchCount: 1 },
    ]);

    assert.deepEqual(months, [
      { year: 2026, month: 5, matchCount: 3 },
      { year: 2025, month: 6, matchCount: 2 },
      { year: 2025, month: 5, matchCount: 1 },
    ]);
  });

  it("month progress uses only team-member status counts supplied by the database query", () => {
    const progress = buildBackfillMonthProgress({
      year: 2026,
      month: 5,
      officialMatchCount: 4,
      teamMembersTotal: 10,
      statusCounts: [
        { status: "success", value: 6 },
        { status: "failed", value: 2 },
        { status: "running", value: 1 },
        { status: "skipped", value: 1 },
      ],
      gamesImportedForMonth: 12,
      participationsForMonth: 7,
    });

    assert.equal(progress.teamMembersTotal, 10);
    assert.equal(progress.syncedTeamMembers, 6);
    assert.equal(progress.failedTeamMembers, 2);
    assert.equal(progress.progressPercent, 60);
  });

  it("progressPercent handles a zero team-member denominator safely", () => {
    assert.equal(calculateBackfillProgressPercent(0, 0), 0);
    assert.equal(calculateBackfillProgressPercent(5, 0), 0);
  });

  it("retry failed candidates are constrained to year/month and team members", () => {
    const target = { year: 2026, month: 5 };

    assert.equal(isRetryFailedArchiveCandidateForMonth({ year: 2026, month: 5, status: "failed", isTeamMember: 1 }, target), true);
    assert.equal(isRetryFailedArchiveCandidateForMonth({ year: 2026, month: 4, status: "failed", isTeamMember: 1 }, target), false);
    assert.equal(isRetryFailedArchiveCandidateForMonth({ year: 2026, month: 5, status: "success", isTeamMember: 1 }, target), false);
    assert.equal(isRetryFailedArchiveCandidateForMonth({ year: 2026, month: 5, status: "failed", isTeamMember: 0 }, target), false);
  });
});
