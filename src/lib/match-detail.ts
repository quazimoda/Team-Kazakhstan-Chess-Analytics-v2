import type { Match } from "@/types";

export type GameResult = "win" | "draw" | "loss" | "unknown" | "pending";
export type DataSource = "old_sqlite" | "chesscom_api" | "unknown";

export function formatMatchResult(result: Match["result"] | GameResult | null | undefined) {
  if (result === "win") return "Win";
  if (result === "loss") return "Loss";
  if (result === "draw") return "Draw";
  if (result === "pending") return "Pending";
  return "Unknown";
}

export function dataSourceLabel(source: DataSource | null | undefined) {
  if (source === "old_sqlite") return "Old SQLite";
  if (source === "chesscom_api") return "Chess.com API";
  return "Unknown";
}

export function isDailyGame(timeClass: string | null | undefined) {
  const normalized = timeClass?.trim().toLowerCase();
  return normalized === "daily" || normalized === "correspondence" || normalized === "daily960";
}

function isTimeoutResult(result: string | null | undefined) {
  const normalized = result?.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "timeout" || normalized === "timedout" || normalized === "timeforfeit";
}

export function isDailyTimeoutLoss(input: {
  timeClass: string | null | undefined;
  playerResult: string | null | undefined;
}) {
  return isDailyGame(input.timeClass) && isTimeoutResult(input.playerResult);
}

export function isDailyTimeoutWin(input: {
  timeClass: string | null | undefined;
  opponentResult: string | null | undefined;
}) {
  return isDailyGame(input.timeClass) && isTimeoutResult(input.opponentResult);
}
