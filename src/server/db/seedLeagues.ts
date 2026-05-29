import { inArray } from "drizzle-orm";
import { db } from "@/server/db";
import { leagues } from "@/server/db/schema";
import type { LeagueSlug } from "@/lib/analytics/classifyLeague";

export const baseLeagues: Array<{ name: string; slug: LeagueSlug; status: "active" }> = [
  { name: "World League", slug: "world-league", status: "active" },
  { name: "World League 960", slug: "world-league-960", status: "active" },
  { name: "Asian League", slug: "asian-league", status: "active" },
  { name: "Asian League 960", slug: "asian-league-960", status: "active" },
  { name: "European League", slug: "european-league", status: "active" },
  { name: "Live Chess World League", slug: "lcwl", status: "active" },
  { name: "Live Chess Asian League", slug: "lcal", status: "active" },
  { name: "Live Chess European League", slug: "lcel", status: "active" },
  { name: "Friendly / Non-league", slug: "friendly", status: "active" },
  { name: "Unknown", slug: "unknown", status: "active" },
];

export async function seedBaseLeagues() {
  if (!db) return new Map<LeagueSlug, number>();

  const now = new Date();
  for (const league of baseLeagues) {
    await db
      .insert(leagues)
      .values({ ...league, updatedAt: now })
      .onConflictDoUpdate({
        target: leagues.slug,
        set: { name: league.name, status: league.status, updatedAt: now },
      });
  }

  const rows = await db.select({ id: leagues.id, slug: leagues.slug }).from(leagues).where(inArray(leagues.slug, baseLeagues.map((league) => league.slug)));
  return new Map(rows.map((row: { slug: string; id: number }) => [row.slug as LeagueSlug, row.id]));
}
