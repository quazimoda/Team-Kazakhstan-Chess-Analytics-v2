import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncMatchDetailsBatch } from "@/lib/sync/syncMatchDetails";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin match detail sync error";
}

function parseLimit(value: string | null) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 10;
  return Math.min(Math.max(parsed, 1), 25);
}

function parseStatus(value: string | null): "completed" | "active" | "all" {
  if (value === "active" || value === "all") return value;
  return "completed";
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    }

    if (!env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL is not configured; match detail sync requires PostgreSQL" }, { status: 500 });
    }

    const summary = await syncMatchDetailsBatch({
      limit: parseLimit(request.nextUrl.searchParams.get("limit")),
      onlyOfficial: request.nextUrl.searchParams.get("onlyOfficial") === "true",
      status: parseStatus(request.nextUrl.searchParams.get("status")),
    });
    return NextResponse.json(summary, { status: summary.status === "success" ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
