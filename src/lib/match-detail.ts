import { isClearlyTimeoutResult } from "./player-profile";
import type { Match, MatchDetailGame } from "../types";

export type MatchResultStatus = Match["result"] | "unknown";

export function isMatchDetailDailyTimeClass(timeClass: string | null | undefined) {
  const normalized = timeClass?.trim().toLowerCase();
  return normalized === "daily" || normalized === "correspondence";
}

export function formatMatchResult(input: {
  status?: Match["status"] | null;
  result?: Match["result"] | null;
  teamScore?: number | null;
  opponentScore?: number | null;
}): MatchResultStatus {
  if (input.result && input.result !== "pending") return input.result;
  if (input.status !== "completed") return "pending";
  if (input.teamScore == null || input.opponentScore == null) return "unknown";
  if (input.teamScore > input.opponentScore) return "win";
  if (input.teamScore < input.opponentScore) return "loss";
  return "draw";
}

export function dataSourceLabel(source: MatchDetailGame["dataSource"]) {
  if (source === "old_sqlite") return "Old SQLite";
  if (source === "chesscom_api") return "Chess.com API";
  return "Unknown";
}

export function isOfficialDailyTimeoutLoss(input: {
  isOfficial: boolean;
  timeClass: string | null | undefined;
  teamPlayerResultText: string | null | undefined;
}) {
  return Boolean(
    input.isOfficial &&
      isMatchDetailDailyTimeClass(input.timeClass) &&
      isClearlyTimeoutResult(input.teamPlayerResultText),
  );
}

export function isOfficialDailyTimeoutWin(input: {
  isOfficial: boolean;
  timeClass: string | null | undefined;
  opponentResultText: string | null | undefined;
}) {
  return Boolean(
    input.isOfficial &&
      isMatchDetailDailyTimeClass(input.timeClass) &&
      isClearlyTimeoutResult(input.opponentResultText),
  );
}
