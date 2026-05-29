import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncPlayerArchives } from "@/lib/sync/syncPlayerArchives";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin player archive sync error";
}

function parseInteger(value: string | null) {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : undefined;
}

function parseLimitPlayers(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 25);
}

function parseMode(value: string | null) {
  if (value === "retry-failed" || value === "specific") return value;
  return "next";
}

function parseBoolean(value: string | null, fallback: boolean) {
  if (value === "true") return true;
  if (value === "false") return false;
  return fallback;
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    if (!env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is not configured; player archive sync requires PostgreSQL" }, { status: 500 });

    const usernameParam = request.nextUrl.searchParams.get("username");
    const usernames = (request.nextUrl.searchParams.get("usernames") ?? usernameParam)?.split(",").map((username) => username.trim()).filter(Boolean);
    const summary = await syncPlayerArchives({
      usernames: usernames?.length ? usernames : undefined,
      limitPlayers: parseLimitPlayers(request.nextUrl.searchParams.get("limitPlayers")),
      mode: parseMode(request.nextUrl.searchParams.get("mode")),
      skipAlreadySynced: parseBoolean(request.nextUrl.searchParams.get("skipAlreadySynced"), true),
      year: parseInteger(request.nextUrl.searchParams.get("year")),
      month: parseInteger(request.nextUrl.searchParams.get("month")),
      matchId: parseInteger(request.nextUrl.searchParams.get("matchId")),
      onlyOfficial: request.nextUrl.searchParams.get("onlyOfficial") !== "false",
    });
    return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
