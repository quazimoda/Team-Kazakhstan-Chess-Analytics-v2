import { and, asc, eq, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getMatchDetails, getLiveMatchDetails } from "@/lib/chesscom/client";
import { db } from "@/server/db";
import { games, matches, matchParticipations, players, syncJobs } from "@/server/db/schema";

const teamSlug = "team-kazakhstan";
const teamNamePattern = /\b(team\s+kazakhstan|kazakhstan)\b/i;

const playerLikeSchema = z.object({
  username: z.string().optional(),
  "@id": z.string().optional(),
  url: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  country: z.string().optional(),
  avatar: z.string().optional(),
  avatar_url: z.string().optional(),
  rating: z.number().optional(),
  result: z.string().optional(),
}).passthrough();

const gameLikeSchema = z.object({
  uuid: z.string().optional(),
  id: z.union([z.string(), z.number()]).optional(),
  url: z.string().optional(),
  pgn: z.string().optional(),
  time_class: z.string().optional(),
  timeClass: z.string().optional(),
  rated: z.union([z.boolean(), z.number()]).optional(),
  end_time: z.number().optional(),
  endTime: z.number().optional(),
  white: playerLikeSchema.optional(),
  black: playerLikeSchema.optional(),
}).passthrough();

const boardLikeSchema = z.object({
  board: z.number().optional(),
  board_number: z.number().optional(),
  boardNumber: z.number().optional(),
  games: z.array(gameLikeSchema).optional(),
  white: playerLikeSchema.optional(),
  black: playerLikeSchema.optional(),
  players: z.array(playerLikeSchema).optional(),
  board_scores: z.array(playerLikeSchema).optional(),
}).passthrough();

const teamLikeSchema = z.object({
  name: z.string().optional(),
  username: z.string().optional(),
  slug: z.string().optional(),
  url: z.string().optional(),
  "@id": z.string().optional(),
  players: z.array(playerLikeSchema).optional(),
  score: z.union([z.number(), z.string()]).optional(),
}).passthrough();

const matchDetailsSchema = z.object({
  boards: z.array(boardLikeSchema).optional(),
  games: z.array(gameLikeSchema).optional(),
  teams: z.union([z.record(z.string(), teamLikeSchema), z.array(teamLikeSchema)]).optional(),
}).passthrough();

export type GameResult = "win" | "draw" | "loss" | "unknown";
export type PlayerColor = "white" | "black" | "unknown";

export type NormalizedGame = {
  chesscomGameUuid: string;
  boardNumber: number | null;
  whiteUsername: string | null;
  blackUsername: string | null;
  teamUsername: string | null;
  opponentUsername: string | null;
  teamColor: PlayerColor;
  result: GameResult;
  timeoutLoss: boolean;
  whiteRating: number | null;
  blackRating: number | null;
  timeClass: string | null;
  rated: number;
  pgn: string | null;
  endTime: Date | null;
  rawGame: unknown;
};

export type NormalizedParticipation = {
  username: string;
  boardNumber: number | null;
  score: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  timeoutLosses: number;
  upsetWins: number;
  avgOpponentRating: number | null;
  lastPlayedAt: Date | null;
  profile: NormalizedPlayerProfile;
};

type NormalizedPlayerProfile = {
  username: string;
  name: string | null;
  title: string | null;
  country: string | null;
  avatarUrl: string | null;
  chesscomUrl: string | null;
  currentRating: number | null;
  rawProfile: unknown;
};

export type NormalizeMatchDetailsResult = {
  players: NormalizedPlayerProfile[];
  games: NormalizedGame[];
  participations: NormalizedParticipation[];
  warnings: string[];
};

export type SyncMatchDetailsSummary = {
  matchId: number;
  chesscomMatchId: number | null;
  playersUpserted: number;
  gamesUpserted: number;
  participationsUpserted: number;
  warnings: string[];
};

export type SyncMatchDetailsBatchSummary = {
  source: "database" | "demo";
  jobId: string | null;
  status: "success" | "failed";
  startedAt: string;
  finishedAt: string;
  matchesProcessed: number;
  playersUpserted: number;
  gamesUpserted: number;
  participationsUpserted: number;
  warnings: string[];
  errors: string[];
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

function normalizeUsername(username: string | null | undefined) {
  return username?.trim() || null;
}

function chesscomUrlForUsername(username: string) {
  return `https://www.chess.com/member/${encodeURIComponent(username)}`;
}

function isTeamKazakhstanName(value: string | null | undefined) {
  if (!value) return false;
  return value.toLowerCase().includes(teamSlug) || teamNamePattern.test(value);
}

function teamKeys(details: Record<string, unknown>) {
  const teams = details.teams;
  if (!teams) return new Set<string>();
  if (Array.isArray(teams)) {
    return new Set(teams.map(asRecord).filter((team) => isTeamKazakhstanName(getString(team, ["name", "username", "slug", "url", "@id"]))).flatMap((team) => extractTeamUsernames(team)));
  }
  if (typeof teams === "object") {
    return new Set(Object.entries(teams).filter(([key, value]) => isTeamKazakhstanName(key) || isTeamKazakhstanName(getString(asRecord(value), ["name", "username", "slug", "url", "@id"]))).flatMap(([, value]) => extractTeamUsernames(asRecord(value))));
  }
  return new Set<string>();
}

function extractTeamUsernames(team: Record<string, unknown>) {
  const rawPlayers = team.players;
  if (!Array.isArray(rawPlayers)) return [];
  return rawPlayers.map((player) => normalizeUsername(getString(asRecord(player), ["username"]))).filter((username): username is string => Boolean(username));
}

export function mapChessComResult(result: string | null | undefined): GameResult {
  const normalized = result?.toLowerCase();
  if (!normalized) return "unknown";
  if (normalized === "win") return "win";
  if (["agreed", "repetition", "stalemate", "insufficient", "50move", "timevsinsufficient"].includes(normalized)) return "draw";
  if (["checkmated", "timeout", "resigned", "lose", "abandoned", "kingofthehill", "threecheck", "bughousepartnerlose"].includes(normalized)) return "loss";
  return "unknown";
}

export function isTimeoutLoss(result: string | null | undefined) {
  return result?.toLowerCase() === "timeout";
}

export function mapPlayerColor(game: unknown, username: string): PlayerColor {
  const record = asRecord(game);
  const lower = username.toLowerCase();
  const white = normalizeUsername(getString(asRecord(record.white), ["username"]));
  const black = normalizeUsername(getString(asRecord(record.black), ["username"]));
  if (white?.toLowerCase() === lower) return "white";
  if (black?.toLowerCase() === lower) return "black";
  return "unknown";
}

function profileFromPlayer(player: Record<string, unknown>): NormalizedPlayerProfile | null {
  const username = normalizeUsername(getString(player, ["username"]));
  if (!username) return null;
  return {
    username,
    name: getString(player, ["name"]),
    title: getString(player, ["title"]),
    country: getString(player, ["country"]),
    avatarUrl: getString(player, ["avatar", "avatar_url", "avatarUrl"]),
    chesscomUrl: getString(player, ["url", "@id"]) ?? chesscomUrlForUsername(username),
    currentRating: getNumber(player, ["rating", "currentRating"]),
    rawProfile: player,
  };
}

function gameUuid(game: Record<string, unknown>) {
  const uuid = getString(game, ["uuid"]);
  if (uuid) return uuid;
  const url = getString(game, ["url"]);
  if (url) return url;
  const id = getNumber(game, ["id"]);
  return id == null ? null : String(id);
}

function collectBoards(details: Record<string, unknown>) {
  const boards = details.boards;
  if (Array.isArray(boards)) return boards.map(asRecord);
  const topGames = details.games;
  if (Array.isArray(topGames)) return [{ games: topGames, board: null }];
  return [];
}

function inferTeamUsername(game: Record<string, unknown>, teamUsernames: Set<string>) {
  const white = normalizeUsername(getString(asRecord(game.white), ["username"]));
  const black = normalizeUsername(getString(asRecord(game.black), ["username"]));
  if (white && teamUsernames.has(white)) return white;
  if (black && teamUsernames.has(black)) return black;
  const whiteUrl = getString(asRecord(game.white), ["@id", "url"]);
  const blackUrl = getString(asRecord(game.black), ["@id", "url"]);
  if (white && whiteUrl && /team-kazakhstan/i.test(whiteUrl)) return white;
  if (black && blackUrl && /team-kazakhstan/i.test(blackUrl)) return black;
  return white ?? black;
}

function normalizeGame(rawGame: unknown, boardNumber: number | null, teamUsernames: Set<string>, warnings: string[]): NormalizedGame | null {
  const game = asRecord(rawGame);
  const whiteProfile = profileFromPlayer(asRecord(game.white));
  const blackProfile = profileFromPlayer(asRecord(game.black));
  const whiteUsername = whiteProfile?.username ?? null;
  const blackUsername = blackProfile?.username ?? null;
  const teamUsername = inferTeamUsername(game, teamUsernames);
  if (!teamUsername) {
    warnings.push(`Skipped game without a recognizable Team Kazakhstan player on board ${boardNumber ?? "unknown"}.`);
    return null;
  }
  const uuid = gameUuid(game);
  if (!uuid) {
    warnings.push(`Skipped game for ${teamUsername} on board ${boardNumber ?? "unknown"} because Chess.com game UUID/url is missing.`);
    return null;
  }

  const teamColor = mapPlayerColor(game, teamUsername);
  const teamPlayer = teamColor === "white" ? asRecord(game.white) : teamColor === "black" ? asRecord(game.black) : {};
  const opponentPlayer = teamColor === "white" ? asRecord(game.black) : teamColor === "black" ? asRecord(game.white) : {};
  const opponentUsername = normalizeUsername(getString(opponentPlayer, ["username"]));
  const resultText = getString(teamPlayer, ["result"]);

  return {
    chesscomGameUuid: uuid,
    boardNumber,
    whiteUsername,
    blackUsername,
    teamUsername,
    opponentUsername,
    teamColor,
    result: mapChessComResult(resultText),
    timeoutLoss: isTimeoutLoss(resultText),
    whiteRating: whiteProfile?.currentRating ?? null,
    blackRating: blackProfile?.currentRating ?? null,
    timeClass: getString(game, ["time_class", "timeClass"]),
    rated: game.rated === false || game.rated === 0 ? 0 : 1,
    pgn: getString(game, ["pgn"]),
    endTime: getDate(game, ["end_time", "endTime"]),
    rawGame,
  };
}

export function normalizeMatchDetails(rawDetails: unknown): NormalizeMatchDetailsResult {
  const parsed = matchDetailsSchema.safeParse(rawDetails);
  const warnings: string[] = [];
  if (!parsed.success) warnings.push("Chess.com match details did not match the expected top-level shape; attempted defensive parsing.");

  const details = asRecord(rawDetails);
  const usernames = teamKeys(details);
  const profileMap = new Map<string, NormalizedPlayerProfile>();
  const gamesByUuid = new Map<string, NormalizedGame>();
  const boards = collectBoards(details);

  for (const board of boards) {
    const boardNumber = getNumber(board, ["board", "board_number", "boardNumber"]);
    for (const source of [board.white, board.black, ...(Array.isArray(board.players) ? board.players : []), ...(Array.isArray(board.board_scores) ? board.board_scores : [])]) {
      const profile = profileFromPlayer(asRecord(source));
      if (profile) profileMap.set(profile.username.toLowerCase(), profile);
    }

    const rawGames = Array.isArray(board.games) ? board.games : [];
    for (const rawGame of rawGames) {
      const gameRecord = asRecord(rawGame);
      const whiteProfile = profileFromPlayer(asRecord(gameRecord.white));
      const blackProfile = profileFromPlayer(asRecord(gameRecord.black));
      if (whiteProfile) profileMap.set(whiteProfile.username.toLowerCase(), whiteProfile);
      if (blackProfile) profileMap.set(blackProfile.username.toLowerCase(), blackProfile);
      const normalized = normalizeGame(rawGame, boardNumber, usernames, warnings);
      if (normalized) gamesByUuid.set(normalized.chesscomGameUuid, normalized);
    }
  }

  if (boards.length === 0) warnings.push("Chess.com details did not include boards or games; no participation rows were normalized.");

  const participations = new Map<string, NormalizedParticipation>();
  for (const game of gamesByUuid.values()) {
    const username = game.teamUsername;
    if (!username) continue;
    const key = username.toLowerCase();
    const profile = profileMap.get(key) ?? { username, name: null, title: null, country: null, avatarUrl: null, chesscomUrl: chesscomUrlForUsername(username), currentRating: game.teamColor === "white" ? game.whiteRating : game.blackRating, rawProfile: { username } };
    const existing = participations.get(key) ?? { username, boardNumber: game.boardNumber, score: 0, gamesPlayed: 0, wins: 0, draws: 0, losses: 0, timeoutLosses: 0, upsetWins: 0, avgOpponentRating: null, lastPlayedAt: null, profile };
    existing.gamesPlayed += 1;
    if (game.result === "win") existing.wins += 1;
    if (game.result === "draw") existing.draws += 1;
    if (game.result === "loss") existing.losses += 1;
    if (game.timeoutLoss) existing.timeoutLosses += 1;
    existing.score += game.result === "win" ? 1 : game.result === "draw" ? 0.5 : 0;

    const teamRating = game.teamColor === "white" ? game.whiteRating : game.teamColor === "black" ? game.blackRating : null;
    const opponentRating = game.teamColor === "white" ? game.blackRating : game.teamColor === "black" ? game.whiteRating : null;
    if (game.result === "win" && teamRating != null && opponentRating != null && opponentRating >= teamRating + 100) existing.upsetWins += 1;
    if (opponentRating != null) {
      const previousRatedGames = existing.avgOpponentRating == null ? 0 : existing.gamesPlayed - 1;
      existing.avgOpponentRating = Math.round((((existing.avgOpponentRating ?? 0) * previousRatedGames) + opponentRating) / (previousRatedGames + 1));
    }
    if (game.endTime && (!existing.lastPlayedAt || game.endTime > existing.lastPlayedAt)) existing.lastPlayedAt = game.endTime;
    participations.set(key, existing);
  }

  return { players: Array.from(profileMap.values()), games: Array.from(gamesByUuid.values()), participations: Array.from(participations.values()), warnings };
}

function extractMatchIdFromUrl(url: string | null) {
  const id = url?.match(/\/(?:club-)?match(?:\/live)?\/(\d+)/i)?.[1] ?? url?.match(/\/(\d+)(?:\D*)?$/)?.[1];
  return id ? Number(id) : null;
}

function rawMatchHasDetails(rawMatch: unknown) {
  const record = asRecord(rawMatch);
  return Array.isArray(record.boards) || Array.isArray(record.games);
}

async function fetchDetailsForMatch(match: typeof matches.$inferSelect) {
  if (rawMatchHasDetails(match.rawMatch)) return { details: match.rawMatch, warnings: [] as string[] };

  const chesscomMatchId = match.chesscomMatchId ?? extractMatchIdFromUrl(match.chesscomUrl);
  if (!chesscomMatchId) return { details: match.rawMatch, warnings: ["Match has no Chess.com match id or parseable Chess.com URL; used raw_match only."] };

  const first = match.status === "active" ? await getLiveMatchDetails(chesscomMatchId) : await getMatchDetails(chesscomMatchId);
  if (first.ok) return { details: first.data, warnings: [] as string[] };

  const fallback = match.status === "active" ? await getMatchDetails(chesscomMatchId) : await getLiveMatchDetails(chesscomMatchId);
  if (fallback.ok) return { details: fallback.data, warnings: [`Primary Chess.com match detail endpoint failed: ${first.error}; used fallback endpoint.`] };

  return { details: match.rawMatch, warnings: [`Chess.com match detail fetch failed: ${first.error}; fallback failed: ${fallback.error}; used raw_match only.`] };
}

async function upsertPlayer(profile: NormalizedPlayerProfile) {
  if (!db) throw new Error("DATABASE_URL is not configured; match detail sync requires PostgreSQL");
  const [existing] = await db.select().from(players).where(sql`lower(${players.username}) = ${profile.username.toLowerCase()}`).limit(1);
  const values = {
    username: profile.username,
    name: profile.name,
    title: profile.title,
    country: profile.country,
    avatarUrl: profile.avatarUrl,
    chesscomUrl: profile.chesscomUrl,
    currentRating: profile.currentRating,
    rawProfile: profile.rawProfile,
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };
  if (existing) {
    const [row] = await db.update(players).set(values).where(eq(players.id, existing.id)).returning();
    return row;
  }
  const [row] = await db.insert(players).values(values).returning();
  return row;
}

export async function syncMatchDetails(options: { matchId?: number; chesscomMatchId?: number }): Promise<SyncMatchDetailsSummary> {
  if (!db) throw new Error("DATABASE_URL is not configured; match detail sync requires PostgreSQL");
  if (!options.matchId && !options.chesscomMatchId) throw new Error("syncMatchDetails requires matchId or chesscomMatchId");

  const conditions: SQL[] = [];
  if (options.matchId) conditions.push(eq(matches.id, options.matchId));
  if (options.chesscomMatchId) conditions.push(eq(matches.chesscomMatchId, options.chesscomMatchId));
  const [match] = await db.select().from(matches).where(and(...conditions)).limit(1);
  if (!match) throw new Error("Match not found");

  const fetched = await fetchDetailsForMatch(match);
  const normalized = normalizeMatchDetails(fetched.details);
  const warnings = [...fetched.warnings, ...normalized.warnings];
  const playerIdByUsername = new Map<string, number>();

  for (const profile of normalized.players) {
    const row = await upsertPlayer(profile);
    playerIdByUsername.set(profile.username.toLowerCase(), row.id);
  }

  for (const participation of normalized.participations) {
    if (!playerIdByUsername.has(participation.username.toLowerCase())) {
      const row = await upsertPlayer(participation.profile);
      playerIdByUsername.set(participation.username.toLowerCase(), row.id);
    }
  }

  for (const game of normalized.games) {
    const whitePlayerId = game.whiteUsername ? playerIdByUsername.get(game.whiteUsername.toLowerCase()) ?? null : null;
    const blackPlayerId = game.blackUsername ? playerIdByUsername.get(game.blackUsername.toLowerCase()) ?? null : null;
    await db.insert(games).values({
      chesscomGameUuid: game.chesscomGameUuid,
      matchId: match.id,
      whitePlayerId,
      blackPlayerId,
      timeClass: game.timeClass,
      rated: game.rated,
      pgn: game.pgn,
      result: game.result,
      endTime: game.endTime,
      rawGame: game.rawGame,
    }).onConflictDoUpdate({
      target: games.chesscomGameUuid,
      set: { matchId: match.id, whitePlayerId, blackPlayerId, timeClass: game.timeClass, rated: game.rated, pgn: game.pgn, result: game.result, endTime: game.endTime, rawGame: game.rawGame },
    });
  }

  for (const participation of normalized.participations) {
    const playerId = playerIdByUsername.get(participation.username.toLowerCase());
    if (!playerId) continue;
    await db.insert(matchParticipations).values({
      matchId: match.id,
      playerId,
      boardNumber: participation.boardNumber,
      score: participation.score.toFixed(2),
      gamesPlayed: participation.gamesPlayed,
      wins: participation.wins,
      draws: participation.draws,
      losses: participation.losses,
      timeoutLosses: participation.timeoutLosses,
      upsetWins: participation.upsetWins,
      avgOpponentRating: participation.avgOpponentRating,
      lastPlayedAt: participation.lastPlayedAt,
    }).onConflictDoUpdate({
      target: [matchParticipations.matchId, matchParticipations.playerId],
      set: { boardNumber: participation.boardNumber, score: participation.score.toFixed(2), gamesPlayed: participation.gamesPlayed, wins: participation.wins, draws: participation.draws, losses: participation.losses, timeoutLosses: participation.timeoutLosses, upsetWins: participation.upsetWins, avgOpponentRating: participation.avgOpponentRating, lastPlayedAt: participation.lastPlayedAt },
    });
  }


  return { matchId: match.id, chesscomMatchId: match.chesscomMatchId, playersUpserted: playerIdByUsername.size, gamesUpserted: normalized.games.length, participationsUpserted: normalized.participations.length, warnings };
}

export async function syncMatchDetailsBatch(options: { limit?: number; onlyOfficial?: boolean; status?: "completed" | "active" | "all" } = {}): Promise<SyncMatchDetailsBatchSummary> {
  const startedAt = new Date();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const onlyOfficial = options.onlyOfficial ?? false;
  const status = options.status ?? "completed";

  if (!db) {
    const finishedAt = new Date();
    return { source: "demo", jobId: null, status: "failed", startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), matchesProcessed: 0, playersUpserted: 0, gamesUpserted: 0, participationsUpserted: 0, warnings: [], errors: ["DATABASE_URL is not configured; match detail sync requires PostgreSQL"] };
  }

  let job: typeof syncJobs.$inferSelect | null = null;
  const warnings: string[] = [];
  const errors: string[] = [];
  let matchesProcessed = 0;
  let playersUpserted = 0;
  let gamesUpserted = 0;
  let participationsUpserted = 0;

  try {
    [job] = await db.insert(syncJobs).values({ type: "games", status: "running", message: "Syncing Chess.com match details", startedAt, recordsProcessed: 0, payload: { limit, onlyOfficial, status } }).returning();

    const conditions: SQL[] = [];
    if (onlyOfficial) conditions.push(eq(matches.isOfficial, 1));
    if (status !== "all") conditions.push(eq(matches.status, status));
    conditions.push(sql`not exists (select 1 from ${matchParticipations} where ${matchParticipations.matchId} = ${matches.id})`);

    const rows = await db.select({ id: matches.id }).from(matches).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(matches.id)).limit(limit);
    for (const row of rows) {
      try {
        const summary = await syncMatchDetails({ matchId: row.id });
        matchesProcessed += 1;
        playersUpserted += summary.playersUpserted;
        gamesUpserted += summary.gamesUpserted;
        participationsUpserted += summary.participationsUpserted;
        warnings.push(...summary.warnings.map((warning) => `match ${row.id}: ${warning}`));
      } catch (error) {
        errors.push(`match ${row.id}: ${error instanceof Error ? error.message : "Unknown match detail sync error"}`);
      }
    }

    const finishedAt = new Date();
    const finalStatus = errors.length ? "failed" : "success";
    await db.update(syncJobs).set({ status: finalStatus, message: `Synced details for ${matchesProcessed} matches`, finishedAt, recordsProcessed: matchesProcessed, errorMessage: errors.length ? errors.join("\n").slice(0, 2000) : null, payload: { limit, onlyOfficial, status, playersUpserted, gamesUpserted, participationsUpserted, warnings: warnings.slice(0, 50) } }).where(eq(syncJobs.id, job.id));
    return { source: "database", jobId: String(job.id), status: finalStatus, startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), matchesProcessed, playersUpserted, gamesUpserted, participationsUpserted, warnings, errors };
  } catch (error) {
    const finishedAt = new Date();
    const message = error instanceof Error ? error.message : "Unknown match detail batch sync error";
    if (job) {
      try {
        await db.update(syncJobs).set({ status: "failed", message: "Chess.com match detail sync failed", finishedAt, recordsProcessed: matchesProcessed, errorMessage: message }).where(eq(syncJobs.id, job.id));
      } catch {
        // Preserve the original failure so admin endpoints always return JSON.
      }
    }
    return { source: "database", jobId: job ? String(job.id) : null, status: "failed", startedAt: startedAt.toISOString(), finishedAt: finishedAt.toISOString(), matchesProcessed, playersUpserted, gamesUpserted, participationsUpserted, warnings, errors: [...errors, message] };
  }
}
