import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  inferDataCoverageMatchKind,
  inferDataCoverageMissingReason,
  inferDataCoverageRecoveryHint,
} from "./dataCoverageDiagnostics";

describe("data coverage diagnostics", () => {
  it("classifies live, daily, daily960, and unknown match kinds conservatively", () => {
    assert.equal(inferDataCoverageMatchKind({ name: "Live Chess World League R4: Team Kazakhstan vs Team Latvia" }), "live");
    assert.equal(inferDataCoverageMatchKind({ name: "WL2025 R3: Team Kazakhstan vs Team Kyrgyzstan", leagueName: "World League" }), "daily");
    assert.equal(inferDataCoverageMatchKind({ name: "Chess960 WL2025 R4: Team Kazakhstan vs Team Uzbekistan", leagueName: "World League 960" }), "daily960");
    assert.equal(inferDataCoverageMatchKind({ name: "Team Kazakhstan vs Example Club" }), "unknown");
  });

  it("prefers live classification when Chess960 appears in live context", () => {
    assert.equal(inferDataCoverageMatchKind({ name: "Live960 friendly: Team Kazakhstan vs Team Example" }), "live");
  });

  it("returns operational recovery hints without changing scoring labels", () => {
    assert.equal(
      inferDataCoverageRecoveryHint({
        storedGames: 12,
        participationRows: 12,
        boardCount: 6,
        teamScore: 7,
        opponentScore: 5,
        estimatedCoverageLabel: "Likely complete",
        matchKind: "daily",
        hasRawMatch: true,
      }),
      "Likely complete",
    );
    assert.equal(
      inferDataCoverageRecoveryHint({
        storedGames: 0,
        participationRows: 0,
        boardCount: null,
        teamScore: null,
        opponentScore: null,
        estimatedCoverageLabel: "No games",
        matchKind: "live",
        hasRawMatch: false,
      }),
      "Needs live match importer",
    );
    assert.equal(
      inferDataCoverageRecoveryHint({
        storedGames: 0,
        participationRows: 0,
        boardCount: 10,
        teamScore: null,
        opponentScore: null,
        estimatedCoverageLabel: "No games",
        matchKind: "daily960",
        hasRawMatch: true,
      }),
      "Try player archive backfill",
    );
    assert.equal(
      inferDataCoverageRecoveryHint({
        storedGames: 20,
        participationRows: 0,
        boardCount: 10,
        teamScore: 10,
        opponentScore: 10,
        estimatedCoverageLabel: "Likely complete",
        matchKind: "daily",
        hasRawMatch: true,
      }),
      "Likely complete",
    );
    assert.equal(
      inferDataCoverageRecoveryHint({
        storedGames: 10,
        participationRows: 0,
        boardCount: 10,
        teamScore: 5,
        opponentScore: 5,
        estimatedCoverageLabel: "Partial",
        matchKind: "daily",
        hasRawMatch: true,
      }),
      "Rebuild participations",
    );
    assert.equal(
      inferDataCoverageRecoveryHint({
        storedGames: 10,
        participationRows: 10,
        boardCount: null,
        teamScore: 5,
        opponentScore: 5,
        estimatedCoverageLabel: "Has games",
        matchKind: "unknown",
        hasRawMatch: true,
      }),
      "Needs match metadata refresh",
    );
  });

  it("summarizes the first missing operational reason", () => {
    assert.equal(
      inferDataCoverageMissingReason({
        storedGames: 0,
        participationRows: 0,
        boardCount: null,
        teamScore: null,
        opponentScore: null,
        estimatedCoverageLabel: "No games",
        matchKind: "unknown",
        hasRawMatch: false,
      }),
      "No stored games",
    );
    assert.equal(
      inferDataCoverageMissingReason({
        storedGames: 8,
        participationRows: 0,
        boardCount: 8,
        teamScore: null,
        opponentScore: null,
        estimatedCoverageLabel: "Partial",
        matchKind: "daily",
        hasRawMatch: true,
      }),
      "No participation rows",
    );
    assert.equal(
      inferDataCoverageMissingReason({
        storedGames: 8,
        participationRows: 8,
        boardCount: 8,
        teamScore: null,
        opponentScore: 4,
        estimatedCoverageLabel: "Partial",
        matchKind: "daily",
        hasRawMatch: true,
      }),
      "Missing score",
    );
  });
});
