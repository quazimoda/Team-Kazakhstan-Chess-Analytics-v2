import { NextResponse } from "next/server";
import { getPlayers } from "@/server/queries";

export async function GET() {
  return NextResponse.json(await getPlayers());
}
