import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyLeague } from "../analytics/classifyLeague";

describe("unknown match review suggestions", () => {
  it("returns the suggested classification shape for review rows", () => {
    const suggestedClassification = classifyLeague("LCWL 2026: Team Kazakhstan vs Team Spain");

    assert.equal(suggestedClassification.leagueSlug, "lcwl");
    assert.equal(suggestedClassification.isOfficialCandidate, true);
    assert.ok(suggestedClassification.confidence > 0.9);
    assert.ok(suggestedClassification.reasons.length > 0);
  });
});
