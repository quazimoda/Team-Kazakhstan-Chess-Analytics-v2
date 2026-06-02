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
  bestLeagueName?: string | null;
  lastPlayedAt?: string | null;
  isTeamMember?: boolean;
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
  officialMatchCount?: number;
  gameCount?: number;
  participationCount?: number;
  contributionCount?: number;
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
  chesscomUrl?: string | null;
  opponentUrl?: string | null;
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


export type MatchDetailPlayer = {
  playerId: string;
  username: string;
  title: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  score: number;
  contributionScore: number | null;
  dailyTimeoutLosses: number;
  lastPlayedAt: string | null;
};

export type MatchDetailGame = {
  id: string;
  chesscomGameUuid: string;
  boardNumber: number | null;
  teamPlayerUsername: string | null;
  opponentUsername: string | null;
  color: "white" | "black" | "unknown";
  result: "win" | "draw" | "loss" | "unknown";
  timeClass: string | null;
  endedAt: string | null;
  dataSource: "old_sqlite" | "chesscom_api" | "unknown";
  chesscomUrl: string | null;
  isDailyTimeoutLoss: boolean;
};

export type MatchDetailCoverage = {
  storedGamesCount: number;
  oldSqliteGamesCount: number;
  chesscomApiGamesCount: number;
  unknownResultGamesCount: number;
  unknownTimeClassGamesCount: number;
  gamesWithoutChesscomUrlCount: number;
  lastStoredGameDate: string | null;
};

export type MatchDetail = {
  match: Match & {
    isOfficial: boolean;
    timeClass: string | null;
    matchType: string | null;
  };
  summary: {
    teamScore: number | null;
    opponentScore: number | null;
    result: Match["result"] | "unknown";
    totalStoredGames: number;
    teamPlayersCount: number;
    opponentPlayersCount: number;
    dailyTimeoutLosses: number;
    dailyTimeoutWins: number;
    oldSqliteGames: number;
    chesscomApiGames: number;
  };
  players: MatchDetailPlayer[];
  games: MatchDetailGame[];
  coverage: MatchDetailCoverage;
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


export type PlayerProfileLeagueBreakdown = {
  leagueName: string | null;
  leagueSlug: string | null;
  gamesPlayed: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  winRate: number;
  contributionScore: number;
  lastPlayedAt: string | null;
  dailyGames: number;
  dailyTimeoutLosses: number;
  timeoutRate: number;
};

export type PlayerProfileGame = {
  id: string;
  endedAt: string | null;
  leagueName: string | null;
  leagueSlug: string | null;
  matchId: string | null;
  matchTitle: string | null;
  opponentUsername: string | null;
  color: "white" | "black" | "unknown";
  result: "win" | "draw" | "loss" | "unknown" | "pending";
  chesscomUrl: string | null;
  dataSource: "old_sqlite" | "chesscom_api" | "unknown";
  timeClass: string | null;
  isDailyTimeoutLoss: boolean;
};

export type PlayerProfileMatch = {
  id: string;
  opponentTeam: string;
  leagueName: string | null;
  leagueSlug: string | null;
  status: Match["status"];
  teamResult: Match["result"];
  playerScore: number;
  gamesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  lastPlayedAt: string | null;
};

export type PlayerProfile = {
  player: Player;
  summary: {
    officialGames: number;
    wins: number;
    draws: number;
    losses: number;
    winRate: number;
    contributionScore: number;
    matchesPlayed: number;
    bestLeague: string | null;
  };
  timeoutStats: {
    dailyOfficialGames: number;
    dailyTimeoutLosses: number;
    dailyTimeoutWins: number;
    dailyTimeoutRate: number;
    lastDailyTimeoutDate: string | null;
  };
  leagueBreakdown: PlayerProfileLeagueBreakdown[];
  recentGames: PlayerProfileGame[];
  recentMatches: PlayerProfileMatch[];
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
  oldArchiveGames: number;
  officialMatches: number;
  contributionRows: number;
  earliestGameDate: string | null;
  latestGameDate: string | null;
  lastSync: SyncJob | null;
};

export type ApiResponse<T> = {
  data: T;
  source: "database" | "demo";
  readError?: {
    code?: string;
    message: string;
  };
};
