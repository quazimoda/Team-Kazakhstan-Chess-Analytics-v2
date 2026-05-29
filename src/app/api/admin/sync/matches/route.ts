import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncClubMatches } from "@/lib/sync/syncClubMatches";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin sync error";
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
      return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    }

    if (!env.DATABASE_URL) {
      return NextResponse.json({ error: "DATABASE_URL is not configured; match sync requires PostgreSQL" }, { status: 500 });
    }

    const summary = await syncClubMatches();
    return NextResponse.json(summary, { status: summary.status === "success" ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
