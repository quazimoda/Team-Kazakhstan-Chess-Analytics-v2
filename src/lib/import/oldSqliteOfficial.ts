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
