import { z, type ZodType } from "zod";
import { getChessComUserAgent } from "@/lib/env";

const baseUrl = "https://api.chess.com/pub";

const chessComErrorSchema = z.object({ message: z.string().optional() }).passthrough();

const clubMatchesSchema = z.object({
  finished: z.array(z.unknown()).default([]),
  in_progress: z.array(z.unknown()).default([]),
  registered: z.array(z.unknown()).default([]),
}).passthrough();

const playerProfileSchema = z.object({
  player_id: z.number().optional(),
  "@id": z.string().url().optional(),
  url: z.string().url().optional(),
  username: z.string(),
  title: z.string().optional(),
  name: z.string().optional(),
  avatar: z.string().url().optional(),
  country: z.string().optional(),
  joined: z.number().optional(),
  last_online: z.number().optional(),
  status: z.string().optional(),
}).passthrough();

const playerStatsSchema = z.record(z.string(), z.unknown());

const playerArchivesSchema = z.object({ archives: z.array(z.string().url()) });

const playerMonthlyGamesSchema = z.object({ games: z.array(z.unknown()) }).passthrough();

const matchDetailsSchema = z.record(z.string(), z.unknown());

export type ChessComClubMatches = { finished: unknown[]; in_progress: unknown[]; registered: unknown[] };
export type ChessComPlayerProfile = { player_id?: number; "@id"?: string; url?: string; username: string; title?: string; name?: string; avatar?: string; country?: string; joined?: number; last_online?: number; status?: string };
export type ChessComPlayerStats = Record<string, unknown>;
export type ChessComPlayerArchives = { archives: string[] };
export type ChessComPlayerMonthlyGames = { games: unknown[] };
export type ChessComMatchDetails = Record<string, unknown>;

export type ChessComResult<T> =
  | { ok: true; data: T; status: number }
  | { ok: false; error: string; status: number; details?: unknown };

async function requestChessCom<T>(path: string, schema: ZodType<T>): Promise<ChessComResult<T>> {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      Accept: "application/json",
      "User-Agent": getChessComUserAgent(),
    },
    // Next.js extends RequestInit at runtime; cast keeps this client portable in tests.
    next: { revalidate: 300 },
  } as RequestInit & { next: { revalidate: number } });

  const text = await response.text();
  const json = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const parsedError = chessComErrorSchema.safeParse(json);
    return {
      ok: false,
      status: response.status,
      error: parsedError.success && parsedError.data.message ? parsedError.data.message : `Chess.com API request failed with status ${response.status}`,
      details: json,
    };
  }

  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, status: response.status, error: "Chess.com API response validation failed", details: parsed.error.flatten() };
  }

  return { ok: true, status: response.status, data: parsed.data };
}

export function getClubMatches(clubSlug: string) {
  return requestChessCom(`/club/${encodeURIComponent(clubSlug)}/matches`, clubMatchesSchema);
}

export function getPlayerProfile(username: string) {
  return requestChessCom(`/player/${encodeURIComponent(username)}`, playerProfileSchema);
}

export function getPlayerStats(username: string) {
  return requestChessCom(`/player/${encodeURIComponent(username)}/stats`, playerStatsSchema);
}

export function getPlayerArchives(username: string) {
  return requestChessCom(`/player/${encodeURIComponent(username)}/games/archives`, playerArchivesSchema);
}

export function getPlayerMonthlyGames(username: string, year: number, month: number) {
  const normalizedMonth = String(month).padStart(2, "0");
  return requestChessCom(`/player/${encodeURIComponent(username)}/games/${year}/${normalizedMonth}`, playerMonthlyGamesSchema);
}

export function getMatchDetails(matchId: number) {
  return requestChessCom(`/match/${encodeURIComponent(String(matchId))}`, matchDetailsSchema);
}

export function getLiveMatchDetails(matchId: number) {
  return requestChessCom(`/match/live/${encodeURIComponent(String(matchId))}`, matchDetailsSchema);
}
