import { asc, eq, sql } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { classifyLeague } from "@/lib/analytics/classifyLeague";
import { env } from "@/lib/env";
import { db } from "@/server/db";
import { leagues, matches } from "@/server/db/schema";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected unknown match review error";
}

function parseLimit(value: string | null) {
  const parsed = Number(value ?? 50);
  if (!Number.isFinite(parsed)) return 50;
  return Math.max(1, Math.min(100, Math.trunc(parsed)));
}

export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    if (!env.DATABASE_URL || !db) return NextResponse.json({ error: "DATABASE_URL is not configured; unknown match review requires PostgreSQL" }, { status: 500 });

    const limit = parseLimit(request.nextUrl.searchParams.get("limit"));
    const rows = await db
      .select({ id: matches.id, chesscomMatchId: matches.chesscomMatchId, name: matches.name, status: matches.status, chesscomUrl: matches.chesscomUrl })
      .from(matches)
      .leftJoin(leagues, eq(matches.leagueId, leagues.id))
      .where(sql`${leagues.slug} = ${"unknown"} or ${matches.leagueId} is null`)
      .orderBy(asc(matches.id))
      .limit(limit);

    return NextResponse.json({
      data: rows.map((row) => ({ ...row, suggestedClassification: classifyLeague(row.name) })),
      limit,
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
