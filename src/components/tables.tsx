import Link from "next/link";
import type { LeaderboardRow, Match, Player } from "@/types";
import {
  formatDateTime,
  publicChesscomUrl,
  readableOpponentName,
} from "@/lib/utils";
import { Badge, Card } from "./ui";

function resultTone(result: Match["result"]) {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "draw") return "gold";
  return "slate";
}

function TopRankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <Badge tone="gold">🥇 #{rank}</Badge>;
  if (rank === 2) return <Badge tone="slate">🥈 #{rank}</Badge>;
  if (rank === 3) return <Badge tone="cyan">🥉 #{rank}</Badge>;
  return <span className="text-slate-400">#{rank}</span>;
}

function SortHeader({
  label,
  sort,
  sortHref,
  active,
}: {
  label: string;
  sort: string;
  sortHref?: (sort: string) => string;
  active?: boolean;
}) {
  if (!sortHref) return label;
  return (
    <Link
      className={active ? "text-yellow-200" : "transition hover:text-white"}
      href={sortHref(sort)}
    >
      {label}
      {active ? " ↓" : ""}
    </Link>
  );
}

export function LeaderboardTable({
  rows,
  sort = "contribution_score",
  sortHref,
}: {
  rows: LeaderboardRow[];
  sort?: string;
  sortHref?: (sort: string) => string;
}) {
  if (rows.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-lg font-semibold text-white">
          No leaderboard data yet
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Run the player contribution recalculation after official match
          participations are synced, or relax the current filters.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="text-slate-400">
          <tr className="border-b border-white/10">
            <th className="py-3">Rank</th>
            <th>Player</th>
            <th>Matches</th>
            <th>
              <SortHeader
                label="Games"
                sort="games"
                sortHref={sortHref}
                active={sort === "games"}
              />
            </th>
            <th>W-D-L</th>
            <th>
              <SortHeader
                label="Points"
                sort="points"
                sortHref={sortHref}
                active={sort === "points"}
              />
            </th>
            <th>
              <SortHeader
                label="Win rate"
                sort="win_rate"
                sortHref={sortHref}
                active={sort === "win_rate"}
              />
            </th>
            <th>
              <SortHeader
                label="Contribution"
                sort="contribution_score"
                sortHref={sortHref}
                active={sort === "contribution_score"}
              />
            </th>
            <th>Avg opp.</th>
            <th>Last played</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.username}
              className="border-b border-white/5 text-slate-200 last:border-0"
            >
              <td className="py-4">
                <TopRankBadge rank={row.rank} />
              </td>
              <td className="font-medium text-white">
                {row.title ? `${row.title} ` : ""}
                {row.username}
              </td>
              <td>{row.matches}</td>
              <td>{row.games}</td>
              <td>
                {row.wins}-{row.draws}-{row.losses}
              </td>
              <td>{row.points.toFixed(1)}</td>
              <td>{row.winRate.toFixed(1)}%</td>
              <td className="font-semibold text-yellow-100">
                {row.contributionScore.toFixed(2)}
              </td>
              <td>{row.avgOpponentRating ?? "—"}</td>
              <td>{formatDateTime(row.lastPlayedAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function MatchesTable({ rows }: { rows: Match[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-sm">
        <thead className="text-slate-400">
          <tr className="border-b border-white/10">
            <th className="py-3">Match</th>
            <th>League</th>
            <th>Opponent</th>
            <th>Match status</th>
            <th>Team result</th>
            <th>Score</th>
            <th>Boards</th>
            <th>Start</th>
            <th>Links</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const matchUrl = publicChesscomUrl(row.chesscomUrl);
            const opponentUrl = publicChesscomUrl(row.opponentUrl);
            return (
              <tr
                key={row.id}
                className="border-b border-white/5 text-slate-200 last:border-0"
              >
                <td className="py-4 font-medium text-white">
                  <Link
                    className="hover:text-cyan-200"
                    href={`/matches/${row.id}`}
                  >
                    {row.name}
                  </Link>
                </td>
                <td>{row.leagueName ?? row.leagueSlug ?? "—"}</td>
                <td>{readableOpponentName(row.opponent, row.name)}</td>
                <td>
                  <Badge>{row.status}</Badge>
                </td>
                <td>
                  <Badge tone={resultTone(row.result)}>{row.result}</Badge>
                </td>
                <td>
                  {row.teamScore ?? "—"} : {row.opponentScore ?? "—"}
                </td>
                <td>{row.boardCount ?? "—"}</td>
                <td>{formatDateTime(row.startsAt)}</td>
                <td className="space-x-3 whitespace-nowrap">
                  <Link
                    className="text-cyan-200 hover:text-cyan-100"
                    href={`/matches/${row.id}`}
                  >
                    Details
                  </Link>
                  {matchUrl ? (
                    <Link
                      className="text-cyan-200 hover:text-cyan-100"
                      href={matchUrl}
                    >
                      Open match
                    </Link>
                  ) : null}
                  {opponentUrl ? (
                    <Link
                      className="text-cyan-200 hover:text-cyan-100"
                      href={opponentUrl}
                    >
                      Open opponent
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Card>
  );
}

export function PlayersTable({ rows }: { rows: Player[] }) {
  if (rows.length === 0) {
    return (
      <Card className="text-center">
        <p className="text-lg font-semibold text-white">
          No players match these filters.
        </p>
        <p className="mt-2 text-sm text-slate-400">
          Try a broader username search or switch back to all players.
        </p>
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[1080px] text-left text-sm">
        <thead className="text-slate-400">
          <tr className="border-b border-white/10">
            <th className="py-3">Username</th>
            <th>Name</th>
            <th>Title</th>
            <th>Rating</th>
            <th>Official games</th>
            <th>W-D-L</th>
            <th>Contribution</th>
            <th>Best league</th>
            <th>Last played</th>
            <th>Profile synced</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-white/5 text-slate-200 last:border-0"
            >
              <td className="py-4 font-medium text-white">{row.username}</td>
              <td>{row.name ?? "—"}</td>
              <td>{row.title ?? "—"}</td>
              <td>{row.currentRating ?? "—"}</td>
              <td>{row.gamesPlayed}</td>
              <td>
                {row.wins}-{row.draws}-{row.losses}
              </td>
              <td className="font-semibold text-yellow-100">
                {row.contributionScore.toFixed(2)}
              </td>
              <td>{row.bestLeagueName ?? "—"}</td>
              <td>{formatDateTime(row.lastPlayedAt)}</td>
              <td>{formatDateTime(row.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
