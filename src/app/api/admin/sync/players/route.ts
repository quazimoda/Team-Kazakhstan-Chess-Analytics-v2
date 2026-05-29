import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncClubMembers } from "@/lib/sync/syncClubMembers";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin player sync error";
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    if (!env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is not configured; player sync requires PostgreSQL" }, { status: 500 });

    const clubSlug = request.nextUrl.searchParams.get("clubSlug") || "team-kazakhstan";
    const summary = await syncClubMembers(clubSlug);
    return NextResponse.json(summary, { status: summary.status === "success" ? 200 : 500 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
