import { NextResponse } from "next/server";
import { getMatches } from "@/server/queries";

export async function GET() {
  return NextResponse.json(await getMatches());
}
