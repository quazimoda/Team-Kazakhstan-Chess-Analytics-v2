export type GameResult = "win" | "draw" | "loss" | "unknown";

export type ProfileSummaryInput = {
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  contributionScore: number;
  matchesPlayed: number;
  bestLeagueName: string | null;
};

export type ProfileSummary = ProfileSummaryInput & {
  winRate: number;
  formattedWinRate: string;
};

export function normalizeProfileUsername(username: string | null | undefined) {
  const trimmed = username?.trim();
  return trimmed ? trimmed.toLowerCase() : null;
}

export function formatWinRate(wins: number, games: number) {
  if (!Number.isFinite(wins) || !Number.isFinite(games) || games <= 0) {
    return "0.0%";
  }
  return `${((wins / games) * 100).toFixed(1)}%`;
}

export function mapProfileSummary(input: ProfileSummaryInput): ProfileSummary {
  const winRate = input.gamesPlayed > 0 ? (input.wins / input.gamesPlayed) * 100 : 0;
  return {
    ...input,
    winRate,
    formattedWinRate: formatWinRate(input.wins, input.gamesPlayed),
  };
}

export function invertGameResult(result: GameResult): GameResult {
  if (result === "win") return "loss";
  if (result === "loss") return "win";
  return result;
}

export function resultFromViewedPlayerPerspective(input: {
  storedTeamResult: GameResult;
  viewedPlayerIsTeamPlayer: boolean;
}) {
  return input.viewedPlayerIsTeamPlayer ? input.storedTeamResult : invertGameResult(input.storedTeamResult);
}

export function isDailyTimeClass(timeClass: string | null | undefined) {
  const normalized = timeClass?.trim().toLowerCase();
  return normalized === "daily" || normalized === "correspondence" || normalized === "daily960";
}

export function isClearlyTimeoutResult(result: string | null | undefined) {
  const normalized = result?.trim().toLowerCase().replace(/[\s_-]+/g, "");
  return normalized === "timeout" || normalized === "timedout" || normalized === "timeforfeit";
}

export function isOfficialMatchScope(input: {
  matchId: string | number | null | undefined;
  matchIsOfficial: boolean;
}) {
  return input.matchId != null && input.matchIsOfficial;
}

export function shouldCountOfficialDailyTimeoutLoss(input: {
  timeClass: string | null | undefined;
  playerResult: string | null | undefined;
  matchId: string | number | null | undefined;
  matchIsOfficial: boolean;
}) {
  return isOfficialMatchScope(input) && isDailyTimeClass(input.timeClass) && isClearlyTimeoutResult(input.playerResult);
}

export function isDailyTimeoutLoss(input: {
  timeClass: string | null | undefined;
  playerResult: string | null | undefined;
}) {
  return isDailyTimeClass(input.timeClass) && isClearlyTimeoutResult(input.playerResult);
}

export function isDailyTimeoutWin(input: {
  timeClass: string | null | undefined;
  opponentResult: string | null | undefined;
}) {
  return isDailyTimeClass(input.timeClass) && isClearlyTimeoutResult(input.opponentResult);
}

export function formatTimeoutRate(timeoutLosses: number, dailyGames: number) {
  return formatWinRate(timeoutLosses, dailyGames);
}

export function chesscomMemberUrl(username: string) {
  return `https://www.chess.com/member/${encodeURIComponent(username)}`;
}
