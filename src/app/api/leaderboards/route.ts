import { NextRequest, NextResponse } from "next/server";
import { getLeaderboard, type LeaderboardSort } from "@/server/queries";

const sortOptions = new Set(["contribution_score", "points", "win_rate", "games"]);

function parseMinGames(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : undefined;
}

function parseSort(value: string | null): LeaderboardSort | undefined {
  return value && sortOptions.has(value) ? (value as LeaderboardSort) : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const leaderboard = await getLeaderboard({
    league: params.get("league") ?? undefined,
    period: params.get("period") ?? undefined,
    minGames: parseMinGames(params.get("minGames")),
    sort: parseSort(params.get("sort")),
  });

  return NextResponse.json({
    ...leaderboard,
    data: leaderboard.data.map((row) => ({
      rank: row.rank,
      username: row.username,
      matches: row.matches,
      games: row.games,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      points: row.points,
      win_rate: row.winRate,
      contribution_score: row.contributionScore,
      avg_opponent_rating: row.avgOpponentRating,
      last_played_at: row.lastPlayedAt,
    })),
  });
}
