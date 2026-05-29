import { NextResponse } from "next/server";
import { getLeagues } from "@/server/queries";

export async function GET() {
  return NextResponse.json(await getLeagues());
}
