import { sql, type SQL } from "drizzle-orm";

export type GetPlayersSqlOptions = {
  q?: string;
  official?: "all" | "with" | "without";
  team?: "all" | "members";
  sort?:
    | "username"
    | "rating"
    | "official_games"
    | "contribution"
    | "last_played";
};

export type GetPlayersSqlRow = {
  id: number | string;
  username: string;
  name: string | null;
  title: string | null;
  country: string | null;
  avatarUrl: string | null;
  chesscomUrl: string | null;
  currentRating: number | null;
  matchesPlayed: number | string;
  gamesPlayed: number | string;
  wins: number | string;
  draws: number | string;
  losses: number | string;
  contributionScore: number | string;
  bestLeagueName: string | null;
  lastPlayedAt: Date | string | null;
  isTeamMember: number | boolean;
  lastSeenAt: Date | string | null;
};

function normalizePlayerSort(
  sort: string | undefined,
): NonNullable<GetPlayersSqlOptions["sort"]> {
  if (
    sort === "rating" ||
    sort === "official_games" ||
    sort === "contribution" ||
    sort === "last_played"
  )
    return sort;
  return "username";
}

export function buildGetPlayersSql(
  options: GetPlayersSqlOptions = {},
): SQL<GetPlayersSqlRow> {
  const query = options.q?.trim().toLowerCase() ?? "";
  const official = options.official ?? "all";
  const team = options.team ?? "all";
  const sort = normalizePlayerSort(options.sort);

  const conditions: SQL[] = [];
  if (query) conditions.push(sql`lower(p.username) like ${`%${query}%`}`);
  if (team === "members") conditions.push(sql`p.is_team_member = 1`);
  if (official === "with")
    conditions.push(sql`coalesce(cs.games_played, p.games_played, 0) > 0`);
  if (official === "without")
    conditions.push(sql`coalesce(cs.games_played, p.games_played, 0) = 0`);

  const whereSql = conditions.length
    ? sql`where ${sql.join(conditions, sql` and `)}`
    : sql``;

  const orderBySql =
    sort === "rating"
      ? sql`p.current_rating desc nulls last, p.username asc`
      : sort === "official_games"
        ? sql`coalesce(cs.games_played, p.games_played, 0) desc, p.username asc`
        : sort === "contribution"
          ? sql`coalesce(cs.contribution_score, p.contribution_score, 0) desc, p.username asc`
          : sort === "last_played"
            ? sql`cs.last_played_at desc nulls last, p.username asc`
            : sql`p.username asc`;

  return sql<GetPlayersSqlRow>`
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
      where pc.period = 'all'
      group by pc.player_id
    )
    select
      p.id,
      p.username,
      p.name,
      p.title,
      p.country,
      p.avatar_url as "avatarUrl",
      p.chesscom_url as "chesscomUrl",
      p.current_rating as "currentRating",
      coalesce(cs.matches_played, p.matches_played, 0)::int as "matchesPlayed",
      coalesce(cs.games_played, p.games_played, 0)::int as "gamesPlayed",
      coalesce(cs.wins, p.wins, 0)::int as wins,
      coalesce(cs.draws, p.draws, 0)::int as draws,
      coalesce(cs.losses, p.losses, 0)::int as losses,
      coalesce(cs.contribution_score, p.contribution_score, 0) as "contributionScore",
      cs.best_league_name as "bestLeagueName",
      cs.last_played_at as "lastPlayedAt",
      p.is_team_member as "isTeamMember",
      p.last_seen_at as "lastSeenAt"
    from players p
    left join contribution_stats cs on cs.player_id = p.id
    ${whereSql}
    order by ${orderBySql}
    limit 500
  `;
}
