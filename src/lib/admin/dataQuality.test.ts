import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDataQualityWarnings } from "./dataQualityWarnings";

describe("data quality warnings", () => {
  it("warns when archive sync, participations, and recalculation are incomplete", () => {
    const warnings = buildDataQualityWarnings({
      playersTotal: 1378,
      archiveSyncedPlayers: 0,
      gamesImported: 4,
      participationRows: 0,
      contributionRows: 0,
      officialMatchesWithParticipations: 0,
      unknownMatchesCount: 625,
    });

    assert.ok(warnings.some((warning) => warning.includes("No players")));
    assert.ok(warnings.some((warning) => warning.includes("Games exist")));
    assert.ok(warnings.some((warning) => warning.includes("Unknown matches")));
  });

  it("warns to recalculate when participations exist without contribution rows", () => {
    const warnings = buildDataQualityWarnings({
      playersTotal: 10,
      archiveSyncedPlayers: 5,
      gamesImported: 20,
      participationRows: 12,
      contributionRows: 0,
      officialMatchesWithParticipations: 3,
      unknownMatchesCount: 1,
    });

    assert.deepEqual(warnings, ["Participation rows exist but contribution rows are empty. Run Recalculate."]);
  });
});
