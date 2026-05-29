export type Player = {
  id: string;
  username: string;
  name: string | null;
  title: string | null;
  country: string | null;
  avatarUrl: string | null;
  chesscomUrl: string | null;
  currentRating: number | null;
  matchesPlayed: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  contributionScore: number;
  lastSeenAt: string | null;
};

export type League = {
  id: string;
  name: string;
  slug: string;
  season: string | null;
  status: "draft" | "active" | "completed" | "archived";
  startsAt: string | null;
  endsAt: string | null;
  matchCount?: number;
};

export type Match = {
  id: string;
  chesscomMatchId: number | null;
  leagueId: string | null;
  name: string;
  opponent: string;
  status: "scheduled" | "registration" | "active" | "completed" | "cancelled";
  result: "win" | "draw" | "loss" | "pending";
  teamScore: number | null;
  opponentScore: number | null;
  boardCount: number | null;
  startsAt: string | null;
  endsAt: string | null;
  leagueSlug?: string | null;
  leagueName?: string | null;
  isOfficialCandidate?: boolean;
};

export type MatchParticipation = {
  matchId: string;
  playerId: string;
  username: string;
  title: string | null;
  boardNumber: number | null;
  score: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  timeoutLosses: number;
  upsetWins: number;
  avgOpponentRating: number | null;
  lastPlayedAt: string | null;
};

export type MatchGame = {
  id: string;
  chesscomGameUuid: string;
  matchId: string | null;
  whiteUsername: string | null;
  blackUsername: string | null;
  timeClass: string | null;
  rated: boolean;
  result: "win" | "draw" | "loss" | "unknown";
  endTime: string | null;
};

export type LeaderboardRow = {
  rank: number;
  username: string;
  title: string | null;
  matches: number;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
  winRate: number;
  contributionScore: number;
  avgOpponentRating: number | null;
  lastPlayedAt: string | null;
};

export type SyncJob = {
  id: string;
  type: "matches" | "players" | "games" | "leaderboards";
  status: "queued" | "running" | "success" | "failed";
  message: string | null;
  recordsProcessed?: number;
  errorMessage?: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type TeamSummary = {
  players: number;
  matches: number;
  activeLeagues: number;
  games: number;
  lastSync: SyncJob | null;
};

export type ApiResponse<T> = {
  data: T;
  source: "database" | "demo";
};
