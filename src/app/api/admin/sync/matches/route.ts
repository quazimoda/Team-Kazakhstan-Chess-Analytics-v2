import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { createDemoSyncJob } from "@/server/queries";

export async function POST(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
  if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });
  }

  return NextResponse.json(await createDemoSyncJob(), { status: 202 });
}
