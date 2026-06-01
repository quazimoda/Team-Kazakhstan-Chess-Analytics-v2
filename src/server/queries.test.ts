import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PgDialect } from "drizzle-orm/pg-core";
import { buildGetPlayersSql } from "./player-query";

function compilePlayersSql(
  options: Parameters<typeof buildGetPlayersSql>[0] = {
    query: "",
    official: "all",
    team: "all",
    sort: "username",
  },
) {
  return new PgDialect().sqlToQuery(buildGetPlayersSql(options)).sql;
}

describe("getPlayers SQL", () => {
  it("qualifies contribution aggregate references through the CTE alias", () => {
    const compiledSql = compilePlayersSql({
      query: "bruno",
      official: "with",
      team: "members",
      sort: "last_played",
    });

    assert.match(
      compiledSql,
      /coalesce\(cs\.matches_played, p\.matches_played, 0\)::int as matches_played/,
    );
    assert.match(compiledSql, /coalesce\(cs\.games_played, 0\) > 0/);
    assert.match(compiledSql, /order by cs\.last_played_at desc nulls last/);
    assert.doesNotMatch(
      compiledSql,
      /coalesce\("?contribution_[a-z_]+"?,\s*p\./,
    );
  });

  it("keeps the without-official-games filter qualified", () => {
    const compiledSql = compilePlayersSql({
      query: "",
      official: "without",
      team: "all",
      sort: "official_games",
    });

    assert.match(compiledSql, /where coalesce\(cs\.games_played, 0\) = 0/);
    assert.match(
      compiledSql,
      /order by coalesce\(cs\.games_played, 0\) desc, p\.username asc/,
    );
  });
});
