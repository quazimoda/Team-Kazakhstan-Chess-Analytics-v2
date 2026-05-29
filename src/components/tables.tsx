import type { LeaderboardRow, Match, Player } from "@/types";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card } from "./ui";

function resultTone(result: Match["result"]) {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "draw") return "gold";
  return "slate";
}

export function LeaderboardTable({ rows }: { rows: LeaderboardRow[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">#</th><th>Player</th><th>Games</th><th>W-D-L</th><th>Score</th><th>Contribution</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.username} className="border-b border-white/5 text-slate-200 last:border-0"><td className="py-4 text-yellow-300">{row.rank}</td><td className="font-medium text-white">{row.title ? `${row.title} ` : ""}{row.username}</td><td>{row.gamesPlayed}</td><td>{row.wins}-{row.draws}-{row.losses}</td><td>{row.score}</td><td>{row.contributionScore.toFixed(2)}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function MatchesTable({ rows }: { rows: Match[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[860px] text-left text-sm">
        <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">Match</th><th>Opponent</th><th>Status</th><th>Result</th><th>Score</th><th>Boards</th><th>Start</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-white/5 text-slate-200 last:border-0"><td className="py-4 font-medium text-white">{row.name}</td><td>{row.opponent}</td><td><Badge>{row.status}</Badge></td><td><Badge tone={resultTone(row.result)}>{row.result}</Badge></td><td>{row.teamScore ?? "—"} : {row.opponentScore ?? "—"}</td><td>{row.boardCount ?? "—"}</td><td>{formatDateTime(row.startsAt)}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

export function PlayersTable({ rows }: { rows: Player[] }) {
  return (
    <Card className="overflow-x-auto">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">Username</th><th>Name</th><th>Title</th><th>Rating</th><th>Games</th><th>W-D-L</th><th>Contribution</th><th>Last seen</th></tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-white/5 text-slate-200 last:border-0"><td className="py-4 font-medium text-white">{row.username}</td><td>{row.name ?? "—"}</td><td>{row.title ?? "—"}</td><td>{row.currentRating ?? "—"}</td><td>{row.gamesPlayed}</td><td>{row.wins}-{row.draws}-{row.losses}</td><td>{row.contributionScore.toFixed(2)}</td><td>{formatDateTime(row.lastSeenAt)}</td></tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}
