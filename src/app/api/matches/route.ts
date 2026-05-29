import { NextRequest, NextResponse } from "next/server";
import { getMatches } from "@/server/queries";

export async function GET(request: NextRequest) {
  return NextResponse.json(await getMatches({
    official: request.nextUrl.searchParams.get("official") === "official" ? "official" : "all",
    league: request.nextUrl.searchParams.get("league") ?? undefined,
  }));
}
