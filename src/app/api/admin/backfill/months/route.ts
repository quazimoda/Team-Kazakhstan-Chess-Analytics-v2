import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getBackfillMonthsProgress } from "@/lib/sync/archiveBackfillMonths";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin backfill month progress error";
}

export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    if (!env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is not configured; archive backfill progress requires PostgreSQL" }, { status: 500 });

    const data = await getBackfillMonthsProgress();
    return NextResponse.json({ data }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
