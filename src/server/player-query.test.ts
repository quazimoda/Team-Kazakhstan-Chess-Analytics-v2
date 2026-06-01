import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { PLAYER_CONTRIBUTION_STATS_SQL_ALIASES } from "./player-query-aliases";
import { buildGetPlayersSql } from "./player-query";

function renderSql(options: Parameters<typeof buildGetPlayersSql>[0] = {}) {
  const dialect = new PgDialect();
  return dialect.sqlToQuery(buildGetPlayersSql(options)).sql;
}

describe("buildGetPlayersSql", () => {
  it("qualifies contribution aggregate references through the cs CTE alias", () => {
    const query = renderSql({ official: "with", sort: "official_games" });

    assert.match(query, /cs\.matches_played/);
    assert.match(query, /cs\.games_played/);
    assert.match(query, /cs\.last_played_at/);
  });

  it("qualifies player references used by search, selection, and rating sorting", () => {
    const query = renderSql({ q: "bruno", sort: "rating" });

    assert.match(query, /lower\(p\.username\) like/);
    assert.match(query, /p\.username/);
    assert.match(query, /p\.current_rating/);
  });

  it("uses nulls last for last_played sorting", () => {
    const query = renderSql({ sort: "last_played" });

    assert.match(query, /order by cs\.last_played_at desc nulls last, p\.username asc/);
  });

  it("does not emit stale contribution selected-field aliases", () => {
    const query = renderSql({ sort: "contribution" });

    for (const alias of Object.values(PLAYER_CONTRIBUTION_STATS_SQL_ALIASES)) {
      assert.equal(
        query.includes(alias),
        false,
        `${alias} should not appear in the raw players query`,
      );
    }
  });
});
