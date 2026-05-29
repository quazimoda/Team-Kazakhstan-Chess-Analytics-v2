import { NextResponse } from "next/server";
import { getTeamSummary } from "@/server/queries";

export async function GET() {
  return NextResponse.json(await getTeamSummary());
}
