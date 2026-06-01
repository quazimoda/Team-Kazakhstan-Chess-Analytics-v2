import { sql, type SQL } from "drizzle-orm";

export type GetPlayersQueryOptions = {
  query: string;
  official: "all" | "with" | "without";
  team: "all" | "members";
  sort:
    | "username"
    | "rating"
    | "official_games"
    | "contribution"
    | "last_played";
};

export type GetPlayersQueryRow = {
  id: number;
  username: string;
  name: string | null;
  title: string | null;
  country: string | null;
  avatar_url: string | null;
  chesscom_url: string | null;
  current_rating: number | null;
  is_team_member: number;
  last_seen_at: Date | string | null;
  matches_played: number | string;
  games_played: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  contribution_score: number | string;
  best_league_name: string | null;
  last_played_at: Date | string | null;
};

function buildPlayersWhereClause({
  query,
  official,
  team,
}: GetPlayersQueryOptions) {
  const conditions: SQL[] = [];

  if (query) conditions.push(sql`lower(p.username) like ${`%${query}%`}`);
  if (team === "members") conditions.push(sql`p.is_team_member = 1`);
  if (official === "with")
    conditions.push(sql`coalesce(cs.games_played, 0) > 0`);
  if (official === "without")
    conditions.push(sql`coalesce(cs.games_played, 0) = 0`);

  return conditions.length
    ? sql`where ${sql.join(conditions, sql` and `)}`
    : sql``;
}

function buildPlayersOrderByClause(sort: GetPlayersQueryOptions["sort"]) {
  if (sort === "rating") return sql`p.current_rating desc, p.username asc`;
  if (sort === "official_games")
    return sql`coalesce(cs.games_played, 0) desc, p.username asc`;
  if (sort === "contribution")
    return sql`coalesce(cs.contribution_score, 0) desc, p.username asc`;
  if (sort === "last_played")
    return sql`cs.last_played_at desc nulls last, p.username asc`;
  return sql`p.username asc`;
}

export function buildGetPlayersSql(options: GetPlayersQueryOptions) {
  const whereClause = buildPlayersWhereClause(options);
  const orderByClause = buildPlayersOrderByClause(options.sort);

  return sql<GetPlayersQueryRow>`
    with contribution_stats as (
      select
        pc.player_id,
        coalesce(sum(pc.matches_played), 0)::int as matches_played,
        coalesce(sum(pc.games_played), 0)::int as games_played,
        coalesce(sum(pc.wins), 0)::int as wins,
        coalesce(sum(pc.draws), 0)::int as draws,
        coalesce(sum(pc.losses), 0)::int as losses,
        coalesce(sum(pc.contribution_score), 0) as contribution_score,
        max(pc.last_played_at) as last_played_at,
        max(l.name) filter (where pc.games_played > 0) as best_league_name
      from player_contributions pc
      left join leagues l on pc.league_id = l.id
      where pc.period = ${"all"}
      group by pc.player_id
    )
    select
      p.id,
      p.username,
      p.name,
      p.title,
      p.country,
      p.avatar_url,
      p.chesscom_url,
      p.current_rating,
      p.is_team_member,
      p.last_seen_at,
      coalesce(cs.matches_played, p.matches_played, 0)::int as matches_played,
      coalesce(cs.games_played, p.games_played, 0)::int as games_played,
      coalesce(cs.wins, p.wins, 0)::int as wins,
      coalesce(cs.draws, p.draws, 0)::int as draws,
      coalesce(cs.losses, p.losses, 0)::int as losses,
      coalesce(cs.contribution_score, p.contribution_score, 0) as contribution_score,
      cs.best_league_name,
      cs.last_played_at
    from players p
    left join contribution_stats cs on cs.player_id = p.id
    ${whereClause}
    order by ${orderByClause}
    limit ${500}
  `;
}
