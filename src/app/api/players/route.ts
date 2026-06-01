import { NextRequest, NextResponse } from "next/server";
import { getPlayers, type PlayerFilters } from "@/server/queries";

function parseOfficial(
  value: string | null,
): PlayerFilters["official"] | undefined {
  return value === "with" || value === "without" || value === "all"
    ? value
    : undefined;
}

function parseTeam(value: string | null): PlayerFilters["team"] | undefined {
  return value === "members" || value === "all" ? value : undefined;
}

function parseSort(value: string | null): PlayerFilters["sort"] | undefined {
  return value === "username" ||
    value === "rating" ||
    value === "official_games" ||
    value === "contribution" ||
    value === "last_played"
    ? value
    : undefined;
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return NextResponse.json(
    await getPlayers({
      q: params.get("q") ?? undefined,
      official: parseOfficial(params.get("official")),
      team: parseTeam(params.get("team")),
      sort: parseSort(params.get("sort")),
    }),
  );
}
