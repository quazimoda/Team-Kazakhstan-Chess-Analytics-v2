import { describe, expect, it } from "vitest";
import { classifyLeague } from "./classifyLeague";

describe("classifyLeague", () => {
  const cases: Array<[string, string]> = [
    ["Asian League 960", "asian-league-960"],
    ["Asian League", "asian-league"],
    ["World League 960", "world-league-960"],
    ["World League", "world-league"],
    ["Live Chess Asian League", "lcal"],
  ];

  for (const [name, expectedSlug] of cases) {
    it(`classifies ${name} as ${expectedSlug}`, () => {
      expect(classifyLeague(name).leagueSlug).toBe(expectedSlug);
    });
  }
});
