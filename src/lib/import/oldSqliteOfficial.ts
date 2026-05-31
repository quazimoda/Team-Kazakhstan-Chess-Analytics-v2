export type OldSqliteGameRow = {
  game_url: string | null;
  date: number | null;
  time_class: string | null;
  time_control: string | null;
  rules: string | null;
  player: string | null;
  opponent: string | null;
  result: string | null;
  pgn: string | null;
  is_tournament?: number | null;
  tournament_url?: string | null;
};

export type PgnTags = {
  chesscomMatchId: number;
  matchUrl: string;
  event: string | null;
  white: string | null;
  black: string | null;
  result: string | null;
  whiteElo: string | null;
  blackElo: string | null;
  link: string | null;
  endDate: string | null;
  endTime: string | null;
};

export type OldSqliteRawGame = {
  source: "old_sqlite";
  url: string;
  game_url: string | null;
  link: string | null;
  old_game_url: string | null;
  old_date: number | null;
  old_time_class: string | null;
  old_time_control: string | null;
  old_rules: string | null;
  old_player: string | null;
  old_opponent: string | null;
  old_result: string | null;
  is_tournament: number | null;
  tournament_url: string | null;
  pgn_tags: PgnTags;
};

export type CurrentMatchForImport = {
  id: number;
  chesscomMatchId: number;
  isOfficial: boolean;
  leagueId: number | null;
  leagueSlug?: string | null;
};

export type EligibilityReason = "candidate" | "unmatched" | "non_official" | "invalid_rules" | "duplicate" | "missing_match_tag";

export type CandidateEvaluation = {
  reason: EligibilityReason;
  tags: PgnTags | null;
  match: CurrentMatchForImport | null;
  duplicateKeys: string[];
  sourceId: string | null;
};

export type Color = "white" | "black";
export type GameResult = "win" | "draw" | "loss" | "unknown";

export type PythonCommand = "python3" | "python";

export type ImportPlayerRow = { id: number; username: string; is_team_member: number };

export type ImportPlayerCandidate = {
  username: string;
  rating: number | null;
  rawProfile: unknown;
};

export type PlayerPreparationStore = {
  loadByLowerUsernames: (lowerUsernames: string[]) => Promise<ImportPlayerRow[]>;
  insertMissingPlayers: (players: ImportPlayerCandidate[]) => Promise<number>;
};

export function normalizeImportUsername(username: string | null | undefined) {
  const normalized = username?.trim();
  return normalized ? normalized.toLowerCase() : null;
}

export function collectImportCandidateUsernames<T extends { tags: Pick<PgnTags, "white" | "black" | "whiteElo" | "blackElo"> }>(candidates: T[]) {
  const players = new Map<string, ImportPlayerCandidate>();
  for (const candidate of candidates) {
    const sides = [
      { username: candidate.tags.white, rating: parseRating(candidate.tags.whiteElo), color: "white" },
      { username: candidate.tags.black, rating: parseRating(candidate.tags.blackElo), color: "black" },
    ] as const;
    for (const side of sides) {
      const key = normalizeImportUsername(side.username);
      const username = side.username?.trim();
      if (!key || !username || players.has(key)) continue;
      players.set(key, {
        username,
        rating: side.rating,
        rawProfile: { username, source: "old_sqlite", color: side.color },
      });
    }
  }
  return players;
}

export async function prepareImportPlayers(candidatesByLowerUsername: Map<string, ImportPlayerCandidate>, store: PlayerPreparationStore) {
  const lowerUsernames = [...candidatesByLowerUsername.keys()].sort();
  const initialRows = await store.loadByLowerUsernames(lowerUsernames);
  const initialMap = new Map(initialRows.map((player) => [normalizeImportUsername(player.username), player] as const).filter((entry): entry is [string, ImportPlayerRow] => entry[0] != null));
  const missingPlayers = lowerUsernames.flatMap((username) => (initialMap.has(username) ? [] : [candidatesByLowerUsername.get(username)!]));
  const playersInserted = missingPlayers.length > 0 ? await store.insertMissingPlayers(missingPlayers) : 0;
  const finalRows = await store.loadByLowerUsernames(lowerUsernames);
  const playersByLowerUsername = new Map(finalRows.map((player) => [normalizeImportUsername(player.username), player] as const).filter((entry): entry is [string, ImportPlayerRow] => entry[0] != null));
  return {
    playersByLowerUsername,
    playersLoaded: finalRows.length,
    playersInserted,
  };
}

export function validateImportCandidatePlayers<T extends { tags: Pick<PgnTags, "white" | "black"> }>(candidate: T, playersByLowerUsername: Map<string, ImportPlayerRow>) {
  const whiteUsername = normalizeImportUsername(candidate.tags.white);
  const blackUsername = normalizeImportUsername(candidate.tags.black);
  const missing: string[] = [];
  const white = whiteUsername ? playersByLowerUsername.get(whiteUsername) ?? null : null;
  const black = blackUsername ? playersByLowerUsername.get(blackUsername) ?? null : null;
  if (!whiteUsername) missing.push("white_username");
  else if (!white?.id) missing.push(`white_player:${candidate.tags.white}`);
  if (!blackUsername) missing.push("black_username");
  else if (!black?.id) missing.push(`black_player:${candidate.tags.black}`);
  return missing.length === 0 ? { ok: true as const, white: white!, black: black!, missing } : { ok: false as const, white, black, missing };
}

export function choosePythonCommand(isCommandAvailable: (command: PythonCommand) => boolean): PythonCommand {
  if (isCommandAvailable("python3")) return "python3";
  if (isCommandAvailable("python")) return "python";
  throw new Error("Python is required to read OLD_SQLITE_PATH, but neither python3 nor python is available on PATH.");
}

export function isRecalculateEnabled(value: string | undefined) {
  return value === "true";
}

export function shouldRecalculateContributions(dryRun: boolean, value: string | undefined) {
  return !dryRun && isRecalculateEnabled(value);
}

const matchUrlPattern = /\[Match\s+"(https:\/\/www\.chess\.com\/club\/matches\/(?:live\/)?(\d+))"\]/;
const tags = {
  event: /\[Event\s+"([^"]+)"\]/,
  white: /\[White\s+"([^"]+)"\]/,
  black: /\[Black\s+"([^"]+)"\]/,
  result: /\[Result\s+"([^"]+)"\]/,
  whiteElo: /\[WhiteElo\s+"([^"]+)"\]/,
  blackElo: /\[BlackElo\s+"([^"]+)"\]/,
  link: /\[Link\s+"([^"]+)"\]/,
  endDate: /\[EndDate\s+"([^"]+)"\]/,
  endTime: /\[EndTime\s+"([^"]+)"\]/,
};

function extractTag(pgn: string, regex: RegExp) {
  return pgn.match(regex)?.[1] ?? null;
}

export function extractPgnTags(pgn: string | null | undefined): PgnTags | null {
  const text = pgn ?? "";
  const match = text.match(matchUrlPattern);
  if (!match) return null;
  return {
    matchUrl: match[1],
    chesscomMatchId: Number(match[2]),
    event: extractTag(text, tags.event),
    white: extractTag(text, tags.white),
    black: extractTag(text, tags.black),
    result: extractTag(text, tags.result),
    whiteElo: extractTag(text, tags.whiteElo),
    blackElo: extractTag(text, tags.blackElo),
    link: extractTag(text, tags.link),
    endDate: extractTag(text, tags.endDate),
    endTime: extractTag(text, tags.endTime),
  };
}

export function normalizedGameKeys(...values: (string | null | undefined)[]) {
  const keys = new Set<string>();
  for (const raw of values) {
    const value = raw?.trim();
    if (!value) continue;
    keys.add(value);
    keys.add(value.replace(/\/$/, ""));
    keys.add(value.replace(/[?#].*$/, ""));
    keys.add(value.replace(/[?#].*$/, "").replace(/\/$/, ""));
    const numericId = value.match(/\/game\/(?:live|daily|daily960)\/(\d+)/i)?.[1] ?? value.match(/\/(\d+)(?:[/?#].*)?$/)?.[1];
    if (numericId) keys.add(numericId);
  }
  return [...keys];
}

export function ruleIsImportable(rules: string | null | undefined) {
  const normalized = rules?.trim().toLowerCase();
  return normalized === "chess" || normalized === "chess960";
}

export function bestSourceId(row: Pick<OldSqliteGameRow, "game_url">, tags: Pick<PgnTags, "link">) {
  return tags.link?.trim() || row.game_url?.trim() || null;
}

export function buildOldSqliteRawGame(row: OldSqliteGameRow, tags: PgnTags, sourceId: string): OldSqliteRawGame {
  return {
    source: "old_sqlite",
    url: sourceId,
    game_url: row.game_url,
    link: tags.link,
    old_game_url: row.game_url,
    old_date: row.date,
    old_time_class: row.time_class,
    old_time_control: row.time_control,
    old_rules: row.rules,
    old_player: row.player,
    old_opponent: row.opponent,
    old_result: row.result,
    is_tournament: row.is_tournament ?? null,
    tournament_url: row.tournament_url ?? null,
    pgn_tags: tags,
  };
}

export function toOldSqliteRawGameJsonbParameter(rawGame: OldSqliteRawGame, jsonParameter: (value: OldSqliteRawGame) => unknown) {
  return jsonParameter(rawGame);
}

export function evaluateCandidateEligibility(row: OldSqliteGameRow, matchesByChesscomId: Map<number, CurrentMatchForImport>, existingGameKeys: Set<string>): CandidateEvaluation {
  const pgnTags = extractPgnTags(row.pgn);
  if (!pgnTags) return { reason: "missing_match_tag", tags: null, match: null, duplicateKeys: [], sourceId: null };

  const match = matchesByChesscomId.get(pgnTags.chesscomMatchId) ?? null;
  const duplicateKeys = normalizedGameKeys(row.game_url, pgnTags.link).filter((key) => existingGameKeys.has(key));
  const sourceId = bestSourceId(row, pgnTags);

  if (!match) return { reason: "unmatched", tags: pgnTags, match: null, duplicateKeys, sourceId };
  if (!match.isOfficial || match.leagueId == null) return { reason: "non_official", tags: pgnTags, match, duplicateKeys, sourceId };
  if (!ruleIsImportable(row.rules)) return { reason: "invalid_rules", tags: pgnTags, match, duplicateKeys, sourceId };
  if (duplicateKeys.length > 0) return { reason: "duplicate", tags: pgnTags, match, duplicateKeys, sourceId };
  return { reason: "candidate", tags: pgnTags, match, duplicateKeys, sourceId };
}

export function parseRating(value: string | null | undefined) {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseEndTime(tags: Pick<PgnTags, "endDate" | "endTime">) {
  if (!tags.endDate) return null;
  const date = tags.endDate.replaceAll(".", "-");
  const time = tags.endTime?.replaceAll(".", ":") ?? "00:00:00";
  const parsed = new Date(`${date}T${time}Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function resultForColor(result: string | null | undefined, color: Color): GameResult {
  const normalized = result?.trim();
  if (normalized === "1/2-1/2") return "draw";
  if (normalized === "1-0") return color === "white" ? "win" : "loss";
  if (normalized === "0-1") return color === "black" ? "win" : "loss";
  return "unknown";
}

export function resultForTeamPlayer(result: string | null | undefined, players: { whiteIsTeamMember: boolean; blackIsTeamMember: boolean }): GameResult {
  if (players.whiteIsTeamMember && !players.blackIsTeamMember) return resultForColor(result, "white");
  if (players.blackIsTeamMember && !players.whiteIsTeamMember) return resultForColor(result, "black");
  return "unknown";
}

export function scoreForResult(result: GameResult) {
  if (result === "win") return 1;
  if (result === "draw") return 0.5;
  return 0;
}

export function isImportEnabled(value: string | undefined) {
  return value === "true";
}

export async function executeImportPlan<T>(options: { dryRun: boolean; candidates: T[]; writeCandidate: (candidate: T) => Promise<void> }) {
  if (options.dryRun) return { written: 0 };
  let written = 0;
  for (const candidate of options.candidates) {
    await options.writeCandidate(candidate);
    written += 1;
  }
  return { written };
}
