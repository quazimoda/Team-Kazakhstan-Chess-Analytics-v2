import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getTableColumns } from "drizzle-orm";
import { PLAYER_CONTRIBUTION_STATS_SQL_ALIASES } from "./player-query-aliases";
import { players } from "./db/schema";

describe("player contribution stats SQL aliases", () => {
  it("do not collide with players table column names", () => {
    const playerColumnNames = new Set(
      Object.values(getTableColumns(players)).map((column) => column.name),
    );

    for (const alias of Object.values(PLAYER_CONTRIBUTION_STATS_SQL_ALIASES)) {
      assert.equal(
        playerColumnNames.has(alias),
        false,
        `${alias} must stay unique so joined player aggregate references are not ambiguous`,
      );
    }
  });
});
