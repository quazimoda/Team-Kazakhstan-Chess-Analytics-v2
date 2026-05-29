import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { syncClubMatches } from "@/lib/sync/syncClubMatches";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
  if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
  }

  const summary = await syncClubMatches();
  return NextResponse.json(summary, { status: summary.status === "success" ? 200 : 500 });
}
