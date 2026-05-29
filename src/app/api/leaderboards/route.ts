import { NextResponse } from "next/server";
import { getLeaderboard } from "@/server/queries";

export async function GET() {
  return NextResponse.json(await getLeaderboard());
}
