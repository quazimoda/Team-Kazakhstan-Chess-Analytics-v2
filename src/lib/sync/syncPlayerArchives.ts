import { and, asc, eq, inArray, notExists, sql, type SQL } from "drizzle-orm";
import { getPlayerArchives, getPlayerMonthlyGames } from "@/lib/chesscom/client";
import { toDateOrNull } from "@/lib/dates";
import { normalizeArchiveSyncOptions, type SyncPlayerArchivesMode } from "./playerArchiveSyncOptions";
import { db } from "@/server/db";
import { games, matches, matchParticipations, playerArchiveSyncState, players, syncJobs } from "@/server/db/schema";
import { aggregateMatchedGames } from "./playerArchiveAggregation";
import { findMatchingImportedMatch } from "./matchGameMatcher";
import { isTimeoutLoss, mapChessComResult, mapPlayerColor, type GameResult } from "./matchDetailsNormalizer";
import { archivePlayerFirstSeenSource } from "./playerArchiveMembership";

export type { SyncPlayerArchivesMode } from "./playerArchiveSyncOptions";

export type SyncPlayerArchivesOptions = {
  usernames?: string[];
  year?: number;
  month?: number;
  limitPlayers?: number;
  matchId?: number;
  onlyOfficial?: boolean;
  mode?: SyncPlayerArchivesMode;
  skipAlreadySynced?: boolean;
};

export type SyncPlayerArchivesSummary = {
  mode: SyncPlayerArchivesMode;
  year: number;
  month: number;
  skipAlreadySynced: boolean;
  playersSelected: number;
  playersProcessed: number;
  archivesFetched: number;
  gamesScanned: number;
  gamesMatched: number;
  gamesUpserted: number;
  participationsUpserted: number;
  warnings: string[];
  errors: string[];
};

type ArchiveMonth = { year: number; month: number; url: string };
type PlayerProfile = {
  username: string;
  name: string | null;
  title: string | null;
  country: string | null;
  avatarUrl: string | null;
  chesscomUrl: string | null;
  currentRating: number | null;
  rawProfile: unknown;
};

type MatchedArchiveGame = {
  matchId: number;
  chesscomGameUuid: string;
  whiteUsername: string | null;
  blackUsername: string | null;
  teamUsername: string;
  result: GameResult;
  timeoutLoss: boolean;
  whiteRating: number | null;
  blackRating: number | null;
  opponentRating: number | null;
  timeClass: string | null;
  rated: number;
  pgn: string | null;
  endTime: Date | null;
  rawGame: unknown;
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

function profileFromChessComPlayer(player: Record<string, unknown>, fallbackUsername: string | null = null): PlayerProfile | null {
  const username = normalizeUsername(getString(player, ["username"]) ?? fallbackUsername);
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
  const textId = getString(game, ["uuid", "url"]);
  if (textId) return textId;
  const numericId = getNumber(game, ["id"]);
  return numericId == null ? null : String(numericId);
}

function archiveFromUrl(url: string): ArchiveMonth | null {
  const match = url.match(/\/games\/(\d{4})\/(\d{1,2})(?:\D*)?$/);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]), url };
}

function currentMonth(now = new Date()) {
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

function monthForMatch(match: typeof matches.$inferSelect) {
  let startsAt = match.startsAt;
  if (!startsAt) {
    const startTime = getNumber(asRecord(match.rawMatch), ["start_time", "startTime"]);
    if (startTime != null) startsAt = new Date(startTime > 10_000_000_000 ? startTime : startTime * 1000);
  }
  if (!startsAt) return null;
  return { year: startsAt.getUTCFullYear(), month: startsAt.getUTCMonth() + 1 };
}

function resolveTargetMonth(options: SyncPlayerArchivesOptions, match: typeof matches.$inferSelect | null) {
  if (options.year && options.month) return { year: options.year, month: options.month };
  if (match) return monthForMatch(match) ?? currentMonth();
  return currentMonth();
}

function selectArchiveMonth(archives: string[], target: { year: number; month: number }, warnings: string[]) {
  const available = new Map(archives.map(archiveFromUrl).filter((archive): archive is ArchiveMonth => Boolean(archive)).map((archive) => [`${archive.year}-${archive.month}`, archive]));
  const key = `${target.year}-${target.month}`;
  const found = available.get(key);
  if (found) return found;
  warnings.push(`Archive ${target.year}/${String(target.month).padStart(2, "0")} was not listed by Chess.com and was skipped.`);
  return null;
}

function normalizeArchiveGame(rawGame: unknown, syncedUsername: string, matchId: number): { profiles: PlayerProfile[]; game: MatchedArchiveGame | null } {
  const game = asRecord(rawGame);
  const white = asRecord(game.white);
  const black = asRecord(game.black);
  const whiteProfile = profileFromChessComPlayer(white);
  const blackProfile = profileFromChessComPlayer(black);
  const whiteUsername = whiteProfile?.username ?? null;
  const blackUsername = blackProfile?.username ?? null;
  const teamColor = mapPlayerColor(game, syncedUsername);
  if (teamColor === "unknown") return { profiles: [whiteProfile, blackProfile].filter((profile): profile is PlayerProfile => Boolean(profile)), game: null };

  const teamPlayer = teamColor === "white" ? white : black;
  const teamUsername = teamColor === "white" ? whiteUsername : blackUsername;
  if (!teamUsername) return { profiles: [whiteProfile, blackProfile].filter((profile): profile is PlayerProfile => Boolean(profile)), game: null };

  const uuid = gameUuid(game);
  if (!uuid) return { profiles: [whiteProfile, blackProfile].filter((profile): profile is PlayerProfile => Boolean(profile)), game: null };

  const resultText = getString(teamPlayer, ["result"]);
  const opponentRating = teamColor === "white" ? blackProfile?.currentRating ?? null : whiteProfile?.currentRating ?? null;

  return {
    profiles: [whiteProfile, blackProfile].filter((profile): profile is PlayerProfile => Boolean(profile)),
    game: {
      matchId,
      chesscomGameUuid: uuid,
      whiteUsername,
      blackUsername,
      teamUsername,
      result: mapChessComResult(resultText),
      timeoutLoss: isTimeoutLoss(resultText),
      whiteRating: whiteProfile?.currentRating ?? null,
      blackRating: blackProfile?.currentRating ?? null,
      opponentRating,
      timeClass: getString(game, ["time_class", "timeClass"]),
      rated: game.rated === false || game.rated === 0 ? 0 : 1,
      pgn: getString(game, ["pgn"]),
      endTime: getDate(game, ["end_time", "endTime"]),
      rawGame,
    },
  };
}

async function upsertPlayer(profile: PlayerProfile, syncedUsername: string) {
  if (!db) throw new Error("DATABASE_URL is not configured; player archive sync requires PostgreSQL");
  const firstSeenSource = archivePlayerFirstSeenSource(profile.username, syncedUsername);
  const values = { username: profile.username, name: profile.name, title: profile.title, country: profile.country, avatarUrl: profile.avatarUrl, chesscomUrl: profile.chesscomUrl, currentRating: profile.currentRating, rawProfile: profile.rawProfile, lastSeenAt: new Date(), updatedAt: new Date() };
  const [existing] = await db.select().from(players).where(sql`lower(${players.username}) = ${profile.username.toLowerCase()}`).limit(1);
  if (existing) {
    const [row] = await db
      .update(players)
      .set({ ...values, firstSeenSource: sql`coalesce(${players.firstSeenSource}, ${firstSeenSource})` })
      .where(eq(players.id, existing.id))
      .returning();
    return row;
  }
  const [row] = await db.insert(players).values({ ...values, isTeamMember: 0, firstSeenSource }).returning();
  return row;
}

async function loadUsernames(options: ReturnType<typeof normalizeArchiveSyncOptions>, target: { year: number; month: number }) {
  if (!db) throw new Error("DATABASE_URL is not configured; player archive sync requires PostgreSQL");
  if (options.usernames?.length || options.mode === "specific") return (options.usernames ?? []).slice(0, options.limitPlayers);

  if (options.mode === "retry-failed") {
    const rows = await db
      .select({ username: playerArchiveSyncState.username })
      .from(playerArchiveSyncState)
      .innerJoin(players, sql`lower(${players.username}) = lower(${playerArchiveSyncState.username})`)
      .where(and(eq(playerArchiveSyncState.year, target.year), eq(playerArchiveSyncState.month, target.month), eq(playerArchiveSyncState.status, "failed"), eq(players.isTeamMember, 1)))
      .orderBy(asc(playerArchiveSyncState.updatedAt))
      .limit(options.limitPlayers);
    return rows.map((row) => row.username);
  }

  const conditions: SQL[] = [];
  if (options.skipAlreadySynced) {
    conditions.push(notExists(db.select({ id: playerArchiveSyncState.id }).from(playerArchiveSyncState).where(and(sql`lower(${playerArchiveSyncState.username}) = lower(${players.username})`, eq(playerArchiveSyncState.year, target.year), eq(playerArchiveSyncState.month, target.month), eq(playerArchiveSyncState.status, "success")))));
  }
  conditions.push(eq(players.isTeamMember, 1));
  const rows = await db.select({ username: players.username }).from(players).where(and(...conditions)).orderBy(asc(players.id)).limit(options.limitPlayers);
  return rows.map((row) => row.username);
}

async function markArchiveSyncStarted(username: string, target: { year: number; month: number }) {
  if (!db) throw new Error("DATABASE_URL is not configured; player archive sync requires PostgreSQL");
  const now = new Date();
  const stateUsername = username.toLowerCase();
  const [row] = await db.insert(playerArchiveSyncState).values({ username: stateUsername, year: target.year, month: target.month, status: "running", startedAt: now, finishedAt: null, updatedAt: now, gamesScanned: 0, gamesMatched: 0, gamesUpserted: 0, participationsUpserted: 0, errorMessage: null }).onConflictDoUpdate({
    target: [playerArchiveSyncState.username, playerArchiveSyncState.year, playerArchiveSyncState.month],
    set: { username: stateUsername, status: "running", startedAt: now, finishedAt: null, updatedAt: now, gamesScanned: 0, gamesMatched: 0, gamesUpserted: 0, participationsUpserted: 0, errorMessage: null },
  }).returning();
  return row;
}

async function markArchiveSyncFinished(username: string, target: { year: number; month: number }, values: { status: "success" | "failed" | "skipped"; gamesScanned: number; gamesMatched: number; gamesUpserted: number; participationsUpserted: number; errorMessage?: string | null }) {
  if (!db) throw new Error("DATABASE_URL is not configured; player archive sync requires PostgreSQL");
  await db.update(playerArchiveSyncState).set({ ...values, errorMessage: values.errorMessage?.slice(0, 2000) ?? null, finishedAt: new Date(), updatedAt: new Date() }).where(and(sql`lower(${playerArchiveSyncState.username}) = ${username.toLowerCase()}`, eq(playerArchiveSyncState.year, target.year), eq(playerArchiveSyncState.month, target.month)));
}

async function loadImportedMatches(options: SyncPlayerArchivesOptions) {
  if (!db) throw new Error("DATABASE_URL is not configured; player archive sync requires PostgreSQL");
  const conditions: SQL[] = [];
  if (options.matchId) conditions.push(eq(matches.id, options.matchId));
  if (options.onlyOfficial ?? true) conditions.push(eq(matches.isOfficial, 1));
  return db.select().from(matches).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(matches.id));
}

export async function syncPlayerArchives(rawOptions: SyncPlayerArchivesOptions = {}): Promise<SyncPlayerArchivesSummary> {
  const options = normalizeArchiveSyncOptions(rawOptions);
  const fallbackTarget = currentMonth();
  if (!db) return { mode: options.mode, year: fallbackTarget.year, month: fallbackTarget.month, skipAlreadySynced: options.skipAlreadySynced, playersSelected: 0, playersProcessed: 0, archivesFetched: 0, gamesScanned: 0, gamesMatched: 0, gamesUpserted: 0, participationsUpserted: 0, warnings: [], errors: ["DATABASE_URL is not configured; player archive sync requires PostgreSQL"] };

  const warnings = ["Player archive sync is capped at 25 players per request. Continue backfill with repeated next batches or retry-failed batches."];
  const errors: string[] = [];
  let playersProcessed = 0;
  let archivesFetched = 0;
  let gamesScanned = 0;
  let gamesMatched = 0;
  let gamesUpserted = 0;
  let participationsUpserted = 0;
  let job: typeof syncJobs.$inferSelect | null = null;
  let targetMonth = fallbackTarget;

  try {
    const importedMatches = await loadImportedMatches(options);
    const matchForMonth = options.matchId ? importedMatches[0] ?? null : null;
    if (options.matchId && !matchForMonth) warnings.push(`No imported match found for matchId=${options.matchId}.`);
    const target = resolveTargetMonth(options, matchForMonth);
    targetMonth = target;
    const usernames = await loadUsernames(options, target);
    if (!usernames.length) warnings.push("No players available to scan for the target month. Run Sync Players first, choose retry-failed, or pass a specific username.");

    [job] = await db.insert(syncJobs).values({ type: "games", status: "running", message: `Syncing ${target.year}/${String(target.month).padStart(2, "0")} Chess.com player archives`, startedAt: new Date(), recordsProcessed: 0, payload: { ...options, year: target.year, month: target.month } }).returning();

    const playerIdByUsername = new Map<string, number>();
    const matchedGames: MatchedArchiveGame[] = [];

    for (const username of usernames) {
      playersProcessed += 1;
      const playerStartIndex = matchedGames.length;
      let playerGamesScanned = 0;
      let playerGamesMatched = 0;
      await markArchiveSyncStarted(username, target);

      const archives = await getPlayerArchives(username);
      if (!archives.ok) {
        const message = `${username}: ${archives.error}`;
        errors.push(message);
        await markArchiveSyncFinished(username, target, { status: "failed", gamesScanned: 0, gamesMatched: 0, gamesUpserted: 0, participationsUpserted: 0, errorMessage: archives.error });
        continue;
      }

      const archive = selectArchiveMonth(archives.data.archives, target, warnings);
      if (!archive) {
        await markArchiveSyncFinished(username, target, { status: "success", gamesScanned: 0, gamesMatched: 0, gamesUpserted: 0, participationsUpserted: 0, errorMessage: null });
        continue;
      }

      const monthly = await getPlayerMonthlyGames(username, archive.year, archive.month);
      archivesFetched += 1;
      if (!monthly.ok) {
        const message = `${username} ${archive.year}/${archive.month}: ${monthly.error}`;
        errors.push(message);
        await markArchiveSyncFinished(username, target, { status: "failed", gamesScanned: 0, gamesMatched: 0, gamesUpserted: 0, participationsUpserted: 0, errorMessage: monthly.error });
        continue;
      }

      for (const rawGame of monthly.data.games) {
        const gameRecord = asRecord(rawGame);
        gamesScanned += 1;
        playerGamesScanned += 1;
        const importedMatch = findMatchingImportedMatch({ url: getString(gameRecord, ["url"]), pgn: getString(gameRecord, ["pgn"]) }, importedMatches);
        if (!importedMatch) continue;
        const normalized = normalizeArchiveGame(rawGame, username, importedMatch.id);
        if (!normalized.game) continue;
        gamesMatched += 1;
        playerGamesMatched += 1;

        for (const profile of normalized.profiles) {
          const row = await upsertPlayer(profile, username);
          playerIdByUsername.set(profile.username.toLowerCase(), row.id);
        }
        matchedGames.push(normalized.game);
      }

      await markArchiveSyncFinished(username, target, { status: "success", gamesScanned: playerGamesScanned, gamesMatched: playerGamesMatched, gamesUpserted: matchedGames.length - playerStartIndex, participationsUpserted: 0, errorMessage: null });
    }

    for (const game of matchedGames) {
      const whitePlayerId = game.whiteUsername ? playerIdByUsername.get(game.whiteUsername.toLowerCase()) ?? null : null;
      const blackPlayerId = game.blackUsername ? playerIdByUsername.get(game.blackUsername.toLowerCase()) ?? null : null;
      await db.insert(games).values({ chesscomGameUuid: game.chesscomGameUuid, matchId: game.matchId, whitePlayerId, blackPlayerId, timeClass: game.timeClass, rated: game.rated, pgn: game.pgn, result: game.result, endTime: toDateOrNull(game.endTime), rawGame: game.rawGame }).onConflictDoUpdate({
        target: games.chesscomGameUuid,
        set: { matchId: game.matchId, whitePlayerId, blackPlayerId, timeClass: game.timeClass, rated: game.rated, pgn: game.pgn, result: game.result, endTime: toDateOrNull(game.endTime), rawGame: game.rawGame },
      });
      gamesUpserted += 1;
    }

    const aggregates = aggregateMatchedGames(matchedGames);
    const missingPlayers = aggregates.filter((aggregate) => !playerIdByUsername.has(aggregate.username.toLowerCase()));
    if (missingPlayers.length) {
      const rows = await db.select({ id: players.id, username: players.username }).from(players).where(inArray(sql`lower(${players.username})`, missingPlayers.map((player) => player.username.toLowerCase())));
      for (const row of rows) playerIdByUsername.set(row.username.toLowerCase(), row.id);
    }

    const participationsByUsername = new Map<string, number>();
    for (const aggregate of aggregates) {
      const playerId = playerIdByUsername.get(aggregate.username.toLowerCase());
      if (!playerId) continue;
      await db.insert(matchParticipations).values({ matchId: aggregate.matchId, playerId, boardNumber: null, score: aggregate.score.toFixed(2), gamesPlayed: aggregate.gamesPlayed, wins: aggregate.wins, draws: aggregate.draws, losses: aggregate.losses, timeoutLosses: aggregate.timeoutLosses, avgOpponentRating: aggregate.avgOpponentRating, lastPlayedAt: toDateOrNull(aggregate.lastPlayedAt) }).onConflictDoUpdate({
        target: [matchParticipations.matchId, matchParticipations.playerId],
        set: { boardNumber: null, score: aggregate.score.toFixed(2), gamesPlayed: aggregate.gamesPlayed, wins: aggregate.wins, draws: aggregate.draws, losses: aggregate.losses, timeoutLosses: aggregate.timeoutLosses, avgOpponentRating: aggregate.avgOpponentRating, lastPlayedAt: toDateOrNull(aggregate.lastPlayedAt) },
      });
      participationsUpserted += 1;
      participationsByUsername.set(aggregate.username.toLowerCase(), (participationsByUsername.get(aggregate.username.toLowerCase()) ?? 0) + 1);
    }

    for (const [username, count] of participationsByUsername) {
      await db.update(playerArchiveSyncState).set({ participationsUpserted: count, updatedAt: new Date() }).where(and(sql`lower(${playerArchiveSyncState.username}) = ${username}`, eq(playerArchiveSyncState.year, target.year), eq(playerArchiveSyncState.month, target.month)));
    }

    await db.update(syncJobs).set({ status: errors.length ? "failed" : "success", message: `Scanned ${gamesScanned} player archive games`, finishedAt: new Date(), recordsProcessed: playersProcessed, errorMessage: errors.length ? errors.join("\n").slice(0, 2000) : null, payload: { archivesFetched, gamesScanned, gamesMatched, gamesUpserted, participationsUpserted, warnings: warnings.slice(0, 50) } }).where(eq(syncJobs.id, job.id));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown player archive sync error";
    errors.push(message);
    if (job) {
      try {
        await db.update(syncJobs).set({ status: "failed", message: "Chess.com player archive sync failed", finishedAt: new Date(), recordsProcessed: playersProcessed, errorMessage: message }).where(eq(syncJobs.id, job.id));
      } catch {
        // Preserve original failure for JSON-safe admin routes.
      }
    }
  }

  return { mode: options.mode, year: targetMonth.year, month: targetMonth.month, skipAlreadySynced: options.skipAlreadySynced, playersSelected: playersProcessed, playersProcessed, archivesFetched, gamesScanned, gamesMatched, gamesUpserted, participationsUpserted, warnings, errors };
}
