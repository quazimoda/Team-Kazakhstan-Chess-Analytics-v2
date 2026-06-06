export type DataCoverageMatchKind = "live" | "daily" | "daily960" | "unknown";
export type DataCoverageRecoveryHint =
  | "Needs live match importer"
  | "Try player archive backfill"
  | "Try old SQLite import"
  | "Needs match metadata refresh"
  | "Rebuild participations"
  | "Likely complete"
  | "Unknown";

export type DataCoverageMissingReason =
  | "No stored games"
  | "No participation rows"
  | "Missing score"
  | "Missing board count"
  | "Partial games"
  | "Complete enough";

export type DataCoverageLabelForDiagnostics = "No games" | "Likely complete" | "Partial" | "Has games" | "Unknown";

export type MatchKindInput = {
  name?: string | null;
  leagueName?: string | null;
  leagueSlug?: string | null;
  chesscomUrl?: string | null;
  rawDiagnosticText?: string | null;
};

function normalizedDiagnosticText(input: MatchKindInput) {
  return [input.name, input.leagueName, input.leagueSlug, input.chesscomUrl, input.rawDiagnosticText]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();
}

export function inferDataCoverageMatchKind(input: MatchKindInput): DataCoverageMatchKind {
  const text = normalizedDiagnosticText(input);
  if (!text.trim()) return "unknown";

  const hasChess960 = /(?:chess\s*960|\b960\b|fischer\s+random|live960)/i.test(text);
  const hasDaily = /(?:\bdaily\b|correspondence|turn[-\s]?based|team\s+match|club\s+match|daily\s+chess|world\s+league|asian\s+league|european\s+league)/i.test(text);
  const hasLive = /(?:\blive\b|live960|rapid|blitz|bullet|\b3\+|\b5\+|\b10\+|live\s+chess|\/live\/|club-match\/live)/i.test(text);

  if (hasLive) return "live";
  if (hasChess960 && hasDaily) return "daily960";
  if (hasDaily) return "daily";
  return "unknown";
}

export type CoverageDiagnosticsInput = {
  storedGames: number;
  participationRows: number;
  boardCount: number | null;
  teamScore: number | null;
  opponentScore: number | null;
  estimatedCoverageLabel: DataCoverageLabelForDiagnostics;
  matchKind: DataCoverageMatchKind;
  hasRawMatch: boolean;
};

export function inferDataCoverageMissingReason(input: CoverageDiagnosticsInput): DataCoverageMissingReason {
  if (input.estimatedCoverageLabel === "Likely complete") return "Complete enough";
  if (input.storedGames === 0) return "No stored games";
  if (input.participationRows === 0) return "No participation rows";
  if (input.teamScore == null || input.opponentScore == null) return "Missing score";
  if (input.boardCount == null) return "Missing board count";
  if (input.estimatedCoverageLabel === "Partial") return "Partial games";
  return "Complete enough";
}

export function inferDataCoverageRecoveryHint(input: CoverageDiagnosticsInput): DataCoverageRecoveryHint {
  if (input.estimatedCoverageLabel === "Likely complete") return "Likely complete";
  if (input.storedGames === 0 && input.matchKind === "live") return "Needs live match importer";
  if (input.storedGames === 0 && (input.matchKind === "daily" || input.matchKind === "daily960")) return "Try player archive backfill";
  if (input.storedGames > 0 && input.participationRows === 0) return "Rebuild participations";
  if ((input.teamScore == null || input.opponentScore == null || input.boardCount == null) && input.hasRawMatch) return "Needs match metadata refresh";
  return "Unknown";
}
