import type { LeaderboardRow, League, Match, Player, SyncJob, TeamSummary } from "@/types";

const now = new Date("2026-05-29T07:00:00.000Z").toISOString();

export const demoPlayers: Player[] = [
  { id: "1", username: "kazakh_knight", name: "Aruzhan S.", title: "WFM", country: "Kazakhstan", avatarUrl: null, chesscomUrl: "https://www.chess.com/member/kazakh_knight", currentRating: 2180, matchesPlayed: 21, gamesPlayed: 42, wins: 24, draws: 10, losses: 8, contributionScore: 87.5, lastSeenAt: now },
  { id: "2", username: "steppe_rook", name: "Daniyar K.", title: "FM", country: "Kazakhstan", avatarUrl: null, chesscomUrl: "https://www.chess.com/member/steppe_rook", currentRating: 2312, matchesPlayed: 19, gamesPlayed: 37, wins: 22, draws: 7, losses: 8, contributionScore: 82, lastSeenAt: now },
  { id: "3", username: "almaty_bishop", name: "Miras T.", title: null, country: "Kazakhstan", avatarUrl: null, chesscomUrl: "https://www.chess.com/member/almaty_bishop", currentRating: 2054, matchesPlayed: 16, gamesPlayed: 31, wins: 16, draws: 9, losses: 6, contributionScore: 71.25, lastSeenAt: now },
];

export const demoLeagues: League[] = [
  { id: "1", name: "World League", slug: "world-league-2026", season: "2026", status: "active", startsAt: "2026-01-15T00:00:00.000Z", endsAt: null, matchCount: 2, officialMatchCount: 2, gameCount: 79, participationCount: 3, contributionCount: 3 },
  { id: "2", name: "Asian Clubs Cup", slug: "asian-clubs-cup-2026", season: "Spring 2026", status: "active", startsAt: "2026-03-01T00:00:00.000Z", endsAt: null, matchCount: 1, officialMatchCount: 1, gameCount: 0, participationCount: 0, contributionCount: 0 },
];

export const demoMatches: Match[] = [
  { id: "1", chesscomMatchId: 10101, leagueId: "1", name: "Kazakhstan vs Türkiye", opponent: "Team Türkiye", status: "completed", result: "win", teamScore: 43.5, opponentScore: 36.5, boardCount: 40, startsAt: "2026-05-10T15:00:00.000Z", endsAt: "2026-05-17T15:00:00.000Z" },
  { id: "2", chesscomMatchId: 10102, leagueId: "1", name: "Kazakhstan vs Poland", opponent: "Team Poland", status: "active", result: "pending", teamScore: 18, opponentScore: 17, boardCount: 35, startsAt: "2026-05-24T15:00:00.000Z", endsAt: null },
  { id: "3", chesscomMatchId: 10103, leagueId: "2", name: "Kazakhstan vs India", opponent: "Team India", status: "registration", result: "pending", teamScore: null, opponentScore: null, boardCount: 50, startsAt: "2026-06-02T15:00:00.000Z", endsAt: null },
];

export const demoSyncJobs: SyncJob[] = [
  { id: "1", type: "matches", status: "success", message: "Demo sync completed", startedAt: "2026-05-29T06:58:00.000Z", finishedAt: now, createdAt: "2026-05-29T06:58:00.000Z" },
  { id: "2", type: "leaderboards", status: "success", message: "Demo leaderboard recalculated", startedAt: "2026-05-28T18:00:00.000Z", finishedAt: "2026-05-28T18:01:00.000Z", createdAt: "2026-05-28T18:00:00.000Z" },
];

export const demoLeaderboard: LeaderboardRow[] = demoPlayers
  .map((player, index) => ({
    rank: index + 1,
    username: player.username,
    title: player.title,
    matches: player.matchesPlayed,
    games: player.gamesPlayed,
    wins: player.wins,
    draws: player.draws,
    losses: player.losses,
    points: player.wins + player.draws * 0.5,
    winRate: player.gamesPlayed > 0 ? (player.wins / player.gamesPlayed) * 100 : 0,
    contributionScore: player.contributionScore,
    avgOpponentRating: player.currentRating ? player.currentRating - 35 : null,
    lastPlayedAt: player.lastSeenAt,
  }))
  .sort((a, b) => b.contributionScore - a.contributionScore)
  .map((row, index) => ({ ...row, rank: index + 1 }));

export const demoSummary: TeamSummary = {
  players: demoPlayers.length,
  matches: demoMatches.length,
  activeLeagues: demoLeagues.filter((league) => league.status === "active").length,
  games: demoPlayers.reduce((sum, player) => sum + player.gamesPlayed, 0),
  lastSync: demoSyncJobs[0] ?? null,
};
