import { NextRequest, NextResponse } from "next/server";
import { getDataQualitySummary } from "@/lib/admin/dataQuality";
import { env } from "@/lib/env";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin data quality error";
}

export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    if (!env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is not configured; data quality requires PostgreSQL" }, { status: 500 });
    return NextResponse.json(await getDataQualitySummary());
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
