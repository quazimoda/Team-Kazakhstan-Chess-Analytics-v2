import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getDataCoverageSummary } from "@/server/queries";

function adminErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected admin data coverage error";
}

export async function GET(request: NextRequest) {
  try {
    const secret = request.headers.get("x-admin-secret") ?? request.nextUrl.searchParams.get("secret");
    if (env.ADMIN_SECRET && secret !== env.ADMIN_SECRET) return NextResponse.json({ error: "Invalid ADMIN_SECRET" }, { status: 401 });

    const result = await getDataCoverageSummary();
    if (result.readError) {
      return NextResponse.json({ error: result.readError.message, readError: result.readError }, { status: 500 });
    }

    return NextResponse.json(result.data);
  } catch (error) {
    return NextResponse.json({ error: adminErrorMessage(error) }, { status: 500 });
  }
}
