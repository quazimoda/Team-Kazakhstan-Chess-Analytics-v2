import { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getLeagues } from "@/server/queries";

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
  if (!env.ADMIN_SECRET || secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });

  const result = await getLeagues();

  return NextResponse.json({
    source: result.source,
    rowCount: result.data.length,
    firstRows: result.data.slice(0, 5),
    errorCode: result.readError?.code ?? null,
    errorMessage: result.readError?.message ?? null,
  });
}
