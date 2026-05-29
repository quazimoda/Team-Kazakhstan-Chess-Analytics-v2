import { asc, eq } from "drizzle-orm";
import { NextRequest, NextResponse } from "next/server";
import { getPlayerMonthlyGames } from "@/lib/chesscom/client";
import { env } from "@/lib/env";
import { extractChesscomMatchIdsFromText, findMatchingImportedMatch } from "@/lib/sync/matchGameMatcher";
import { db } from "@/server/db";
import { matches } from "@/server/db/schema";

function parseInteger(value: string | null) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
  if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
  if (!env.DATABASE_URL || !db) return NextResponse.json({ error: "DATABASE_URL is not configured; debug player games requires PostgreSQL" }, { status: 500 });

  const username = request.nextUrl.searchParams.get("username")?.trim();
  const year = parseInteger(request.nextUrl.searchParams.get("year"));
  const month = parseInteger(request.nextUrl.searchParams.get("month"));
  if (!username || !year || !month) return NextResponse.json({ error: "username, year, and month query parameters are required" }, { status: 400 });

  const response = await getPlayerMonthlyGames(username, year, month);
  if (!response.ok) return NextResponse.json({ error: response.error, status: response.status }, { status: 502 });

  const importedMatches = await db.select().from(matches).where(eq(matches.isOfficial, 1)).orderBy(asc(matches.id));
  const inspected = response.data.games.slice(0, 3).map((rawGame) => {
    const game = asRecord(rawGame);
    const url = getString(game, ["url"]);
    const pgn = getString(game, ["pgn"]);
    const detectedMatchIds = extractChesscomMatchIdsFromText(`${url ?? ""}\n${pgn ?? ""}`);
    const matchedImportedMatch = findMatchingImportedMatch({ url, pgn }, importedMatches);
    return {
      url,
      pgnContainsMatchIds: detectedMatchIds.length > 0,
      detectedMatchIds,
      matchedImportedMatchIds: matchedImportedMatch ? [matchedImportedMatch.id] : [],
    };
  });

  return NextResponse.json({
    archiveUrl: `https://api.chess.com/pub/player/${encodeURIComponent(username)}/games/${year}/${String(month).padStart(2, "0")}`,
    gamesCount: response.data.games.length,
    first3GameUrls: inspected.map((game) => game.url).filter(Boolean),
    inspected,
  });
}
