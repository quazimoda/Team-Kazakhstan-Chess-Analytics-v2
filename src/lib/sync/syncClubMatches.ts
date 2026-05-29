import { eq } from "drizzle-orm";
import { classifyLeague, type LeagueSlug } from "@/lib/analytics/classifyLeague";
import { getClubMatches } from "@/lib/chesscom/client";
import { toDateOrNull, toIsoOrNull } from "@/lib/dates";
import { db } from "@/server/db";
import { matches, syncJobs } from "@/server/db/schema";
import { seedBaseLeagues } from "@/server/db/seedLeagues";

const clubSlug = "team-kazakhstan";
const teamNamePattern = /\b(team\s+kazakhstan|kazakhstan)\b/i;

type ChessComMatchBucket = "registered" | "in_progress" | "finished";
type NormalizedMatch = {
  chesscomMatchId: number | null;
  leagueSlug: LeagueSlug;
  name: string;
  opponent: string;
  status: "registration" | "active" | "completed";
  result: "win" | "draw" | "loss" | "pending";
  teamScore: string | null;
  opponentScore: string | null;
  boardCount: number | null;
  startsAt: Date | null;
  endsAt: Date | null;
  chesscomUrl: string | null;
  rawMatch: unknown;
};

export type SyncClubMatchesSummary = {
  source: "database" | "demo";
  jobId: string | null;
  status: "success" | "failed";
  startedAt: string;
  finishedAt: string;
  recordsProcessed: number;
  errorMessage: string | null;
  buckets: Record<ChessComMatchBucket, number>;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function getNumber(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) return Number(value);
  }
  return null;
}

function getDate(record: Record<string, unknown>, keys: string[]) {
  const value = getNumber(record, keys);
  if (value == null) return null;
  return new Date(value > 10_000_000_000 ? value : value * 1000);
}

function scoreToString(value: number | null) {
  return value == null ? null : String(value);
}

function extractMatchId(record: Record<string, unknown>) {
  const directId = getNumber(record, ["match_id", "id"]);
  if (directId != null) return directId;

  const url = getString(record, ["url", "@id"]);
  const urlId = url?.match(/\/(?:club-)?match\/(\d+)/i)?.[1] ?? url?.match(/\/(\d+)(?:\D*)$/)?.[1];
  return urlId ? Number(urlId) : null;
}

function extractOpponent(record: Record<string, unknown>, name: string) {
  const directOpponent = getString(record, ["opponent", "opponent_name", "opponent_club", "opponent_team"]);
  if (directOpponent) return directOpponent;

  const clubs = record.clubs;
  if (Array.isArray(clubs)) {
    const opponent = clubs.map(asRecord).map((club) => getString(club, ["name", "club", "username"])).find((clubName) => clubName && !teamNamePattern.test(clubName));
    if (opponent) return opponent;
  }

  const teams = record.teams;
  if (teams && typeof teams === "object") {
    const opponent = Object.values(teams).map(asRecord).map((team) => getString(team, ["name", "club", "username"])).find((teamName) => teamName && !teamNamePattern.test(teamName));
    if (opponent) return opponent;
  }

  const versusParts = name.split(/\s+(?:vs\.?|versus|-)\s+/i).map((part) => part.trim()).filter(Boolean);
  const namedOpponent = versusParts.find((part) => !teamNamePattern.test(part));
  return namedOpponent ?? "Unknown opponent";
}

function extractScores(record: Record<string, unknown>) {
  const teamScore = getNumber(record, ["team_score", "teamKazakhstanScore", "score", "club_score"]);
  const opponentScore = getNumber(record, ["opponent_score", "opponentScore"]);
  return { teamScore, opponentScore };
}

function resultFromScores(teamScore: number | null, opponentScore: number | null) {
  if (teamScore == null || opponentScore == null) return "pending";
  if (teamScore > opponentScore) return "win";
  if (teamScore < opponentScore) return "loss";
  return "draw";
}

function normalizeMatch(rawMatch: unknown, bucket: ChessComMatchBucket): NormalizedMatch {
  const record = asRecord(rawMatch);
  const name = getString(record, ["name", "title"]) ?? "Untitled Chess.com match";
  const classification = classifyLeague(name);
  const status = bucket === "registered" ? "registration" : bucket === "in_progress" ? "active" : "completed";
  const { teamScore, opponentScore } = extractScores(record);

  return {
    chesscomMatchId: extractMatchId(record),
    leagueSlug: classification.leagueSlug,
    name,
    opponent: extractOpponent(record, name),
    status,
    result: status === "completed" ? resultFromScores(teamScore, opponentScore) : "pending",
    teamScore: scoreToString(teamScore),
    opponentScore: scoreToString(opponentScore),
    boardCount: getNumber(record, ["board_count", "boards", "boardCount", "players_per_team"]),
    startsAt: getDate(record, ["start_time", "startTime", "starts_at", "start_at"]),
    endsAt: getDate(record, ["end_time", "endTime", "ends_at", "end_at", "finish_time"]),
    chesscomUrl: getString(record, ["url", "@id"]),
    rawMatch,
  };
}

function emptyBuckets(): Record<ChessComMatchBucket, number> {
  return { registered: 0, in_progress: 0, finished: 0 };
}

export async function syncClubMatches(): Promise<SyncClubMatchesSummary> {
  const startedAt = new Date();
  const buckets = emptyBuckets();

  if (!db) {
    const finishedAt = new Date();
    return {
      source: "demo",
      jobId: null,
      status: "failed",
      startedAt: toIsoOrNull(startedAt) ?? "",
      finishedAt: toIsoOrNull(finishedAt) ?? "",
      recordsProcessed: 0,
      errorMessage: "DATABASE_URL is not configured; match sync requires PostgreSQL",
      buckets,
    };
  }

  let job: typeof syncJobs.$inferSelect | null = null;

  try {
    [job] = await db
      .insert(syncJobs)
      .values({ type: "matches", status: "running", message: `Syncing Chess.com matches for ${clubSlug}`, startedAt, recordsProcessed: 0 })
      .returning();

    const result = await getClubMatches(clubSlug);
    if (!result.ok) throw new Error(result.error);

    const leagueIds = await seedBaseLeagues();
    const normalizedMatches = (["registered", "in_progress", "finished"] as const).flatMap((bucket) => {
      const rawMatches: unknown[] = result.data[bucket];
      buckets[bucket] = rawMatches.length;
      return rawMatches.map((rawMatch) => normalizeMatch(rawMatch, bucket));
    });

    const now = new Date();
    for (const match of normalizedMatches) {
      const values = {
        chesscomMatchId: match.chesscomMatchId,
        leagueId: leagueIds.get(match.leagueSlug) ?? leagueIds.get("unknown") ?? null,
        name: match.name,
        opponent: match.opponent,
        status: match.status,
        result: match.result,
        teamScore: match.teamScore,
        opponentScore: match.opponentScore,
        boardCount: match.boardCount,
        startsAt: toDateOrNull(match.startsAt),
        endsAt: toDateOrNull(match.endsAt),
        chesscomUrl: match.chesscomUrl,
        rawMatch: match.rawMatch,
        isOfficial: match.leagueSlug !== "unknown" ? 1 : 0,
        updatedAt: now,
      };

      if (match.chesscomMatchId == null) {
        await db.insert(matches).values(values);
      } else {
        await db.insert(matches).values(values).onConflictDoUpdate({
          target: matches.chesscomMatchId,
          set: values,
        });
      }
    }

    const finishedAt = new Date();
    await db
      .update(syncJobs)
      .set({
        status: "success",
        message: `Synced ${normalizedMatches.length} Chess.com matches for ${clubSlug}`,
        finishedAt,
        recordsProcessed: normalizedMatches.length,
        errorMessage: null,
      })
      .where(eq(syncJobs.id, job.id));

    return {
      source: "database",
      jobId: String(job.id),
      status: "success",
      startedAt: toIsoOrNull(startedAt) ?? "",
      finishedAt: toIsoOrNull(finishedAt) ?? "",
      recordsProcessed: normalizedMatches.length,
      errorMessage: null,
      buckets,
    };
  } catch (error) {
    const finishedAt = new Date();
    const errorMessage = error instanceof Error ? error.message : "Unknown match sync error";
    if (job) {
      try {
        await db
          .update(syncJobs)
          .set({ status: "failed", message: "Chess.com match sync failed", finishedAt, recordsProcessed: 0, errorMessage })
          .where(eq(syncJobs.id, job.id));
      } catch {
        // Preserve the original failure so the admin route can return JSON even if sync_jobs is unavailable.
      }
    }

    return {
      source: "database",
      jobId: job ? String(job.id) : null,
      status: "failed",
      startedAt: toIsoOrNull(startedAt) ?? "",
      finishedAt: toIsoOrNull(finishedAt) ?? "",
      recordsProcessed: 0,
      errorMessage,
      buckets,
    };
  }
}
