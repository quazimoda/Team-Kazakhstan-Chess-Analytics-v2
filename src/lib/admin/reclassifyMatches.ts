import { eq } from "drizzle-orm";
import { classifyLeague, isOfficialLeagueSlug, type LeagueSlug } from "@/lib/analytics/classifyLeague";
import { db } from "@/server/db";
import { seedBaseLeagues } from "@/server/db/seedLeagues";
import { matches } from "@/server/db/schema";

export type ReclassifyMatchesSummary = {
  processed: number;
  updated: number;
  countsByLeague: Partial<Record<LeagueSlug, number>>;
};

export async function reclassifyMatches(): Promise<ReclassifyMatchesSummary> {
  if (!db) throw new Error("DATABASE_URL is not configured; match reclassification requires PostgreSQL");

  const leagueIds = await seedBaseLeagues();
  const importedMatches = await db.select({ id: matches.id, name: matches.name, leagueId: matches.leagueId, isOfficial: matches.isOfficial }).from(matches);
  const countsByLeague: Partial<Record<LeagueSlug, number>> = {};
  let updated = 0;
  const now = new Date();

  for (const match of importedMatches) {
    const classification = classifyLeague(match.name);
    countsByLeague[classification.leagueSlug] = (countsByLeague[classification.leagueSlug] ?? 0) + 1;

    const leagueId = leagueIds.get(classification.leagueSlug) ?? leagueIds.get("unknown") ?? null;
    const isOfficial = isOfficialLeagueSlug(classification.leagueSlug) ? 1 : 0;

    if (match.leagueId === leagueId && match.isOfficial === isOfficial) continue;

    await db.update(matches).set({ leagueId, isOfficial, updatedAt: now }).where(eq(matches.id, match.id));
    updated += 1;
  }

  return { processed: importedMatches.length, updated, countsByLeague };
}
