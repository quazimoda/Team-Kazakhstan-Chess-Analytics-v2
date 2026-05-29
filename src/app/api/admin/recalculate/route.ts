import { NextRequest, NextResponse } from "next/server";
import { recalculatePlayerContributions } from "@/lib/analytics/recalculatePlayerContributions";
import { env } from "@/lib/env";

function parseLeagueId(value: string | null) {
  if (!value) return undefined;
  if (value === "null") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
  if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
  }

  const leagueId = parseLeagueId(request.nextUrl.searchParams.get("leagueId"));
  const summary = await recalculatePlayerContributions({ leagueId });
  return NextResponse.json(summary);
}
