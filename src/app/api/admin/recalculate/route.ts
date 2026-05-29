import { NextRequest, NextResponse } from "next/server";
import { recalculatePlayerContributions } from "@/lib/analytics/recalculatePlayerContributions";
import { env } from "@/lib/env";

function parseLeagueId(value: string | null) {
  if (!value) return undefined;
  if (value === "null") return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin recalculation error";
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    }

    if (!env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL is not configured; contribution recalculation requires PostgreSQL" }, { status: 500 });
    }

    const leagueId = parseLeagueId(request.nextUrl.searchParams.get("leagueId"));
    const summary = await recalculatePlayerContributions({ leagueId });
    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
