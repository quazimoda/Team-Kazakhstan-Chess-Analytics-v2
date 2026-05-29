import { NextRequest, NextResponse } from "next/server";
import { reclassifyMatches } from "@/lib/admin/reclassifyMatches";
import { env } from "@/lib/env";

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin reclassification error";
}

export async function POST(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
    if (!env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL is not configured; match reclassification requires PostgreSQL" }, { status: 500 });

    return NextResponse.json(await reclassifyMatches());
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
