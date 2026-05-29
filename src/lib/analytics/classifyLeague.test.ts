import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyLeague } from "./classifyLeague";

describe("classifyLeague", () => {
  const officialCases: Array<[string, string]> = [
    ["Asian League 960", "asian-league-960"],
    ["Asian League", "asian-league"],
    ["World League 960", "world-league-960"],
    ["World League", "world-league"],
    ["Live Chess Asian League", "lcal"],
    ["WL 2025 R8: Team Latvia vs Team Kazakhstan", "world-league"],
    ["WL2025 R3: Team Kazakhstan vs _Team Kyrgyzstan_", "world-league"],
    ["Chess960 WL2025 R4: Team Kazakhstan vs Team Uzbekistan", "world-league-960"],
    ["Chess 960 WL2025 R2: Team France vs Team Kazakhstan", "world-league-960"],
    ["AL2025 R2: Team Kazakhstan vs. Team Azerbaijan", "asian-league"],
    ["AL 2023 Chess960 Round4: Team Kazakhstan vs Team Singapore", "asian-league-960"],
    ["EL2026 R3: Team Kazakhstan vs Team Schweiz-Suisse-Svizzera", "european-league"],
    ["EL2024 R8: Team Schweiz-Suisse-Svizzera gegen Team Kazakhstan", "european-league"],
    ["LCEL2022 S6 Bullet Team Kazakhstan vs Team Slovakia", "lcel"],
    ["LCEL2021 S4 Rapid Team Kazakhstan vs Team Galicia", "lcel"],
    ["LWCL S6 Div.1 R6 Bullet - Team Kazakhstan vs Team Peru", "lcwl"],
  ];

  for (const [name, expectedSlug] of officialCases) {
    it(`classifies ${name} as ${expectedSlug}`, () => {
      const classification = classifyLeague(name);
      assert.equal(classification.leagueSlug, expectedSlug);
      assert.equal(classification.isOfficialCandidate, true);
    });
  }

  const friendlyCases = [
    "Friendly TeamKazakhstan-TeamUkraine bullet 1+1",
    "Friendly U-1700 Blitz 5|2 : Team Bangladesh vs Team Kazakhstan",
    "Friendly Blitz 5/2 Team Kazakhstan vs Team Philippines",
    "Team Kazakhstan vs. Iran live Chess - friendly 3|2",
    "New Year Friendly Blitz",
    "Nations Friendly Blitz Match",
    "Friendly bullet TK vs SMUCC",
    "Frendly blitz 5|2 Russia vs Kazakhstan",
  ];

  for (const name of friendlyCases) {
    it(`classifies ${name} as friendly and non-official`, () => {
      const classification = classifyLeague(name);
      assert.equal(classification.leagueSlug, "friendly");
      assert.equal(classification.isOfficialCandidate, false);
    });
  }

  it("classifies Chess960 WL as world-league-960 instead of world-league", () => {
    assert.equal(classifyLeague("Chess960 WL2025 R4: Team Kazakhstan vs Team Uzbekistan").leagueSlug, "world-league-960");
  });

  it("maps LWCL to lcwl", () => {
    assert.equal(classifyLeague("LWCL S6 Div.1 R6 Bullet - Team Kazakhstan vs Team Peru").leagueSlug, "lcwl");
  });
});
