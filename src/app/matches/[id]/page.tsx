import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getMatchById, getMatchGames, getMatchParticipations } from "@/server/queries";
import type { Match } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function resultTone(result: Match["result"]) {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "draw") return "gold";
  return "slate";
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export default async function MatchDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) notFound();

  const [matchResult, participationResult, gameResult] = await Promise.all([getMatchById(id), getMatchParticipations(id), getMatchGames(id)]);
  const match = matchResult.data;
  if (!match) notFound();

  return (
    <>
      <PageHeader eyebrow={matchResult.source} title={match.name} description="Match metadata, synced player participation rows, and Chess.com games." />
      <div className="mb-6">
        <Link href="/matches" className="text-sm text-cyan-200 hover:text-cyan-100">← Back to matches</Link>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <h2 className="text-xl font-semibold text-white">Match metadata</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-slate-400">League</dt><dd className="text-white">{match.leagueName ?? match.leagueSlug ?? "—"}</dd></div>
            <div><dt className="text-slate-400">Opponent</dt><dd className="text-white">{match.opponent}</dd></div>
            <div><dt className="text-slate-400">Status</dt><dd><Badge>{match.status}</Badge></dd></div>
            <div><dt className="text-slate-400">Result</dt><dd><Badge tone={resultTone(match.result)}>{match.result}</Badge></dd></div>
            <div><dt className="text-slate-400">Score</dt><dd className="text-white">{match.teamScore ?? "—"} : {match.opponentScore ?? "—"}</dd></div>
            <div><dt className="text-slate-400">Boards</dt><dd className="text-white">{match.boardCount ?? "—"}</dd></div>
            <div><dt className="text-slate-400">Start</dt><dd className="text-white">{formatDateTime(match.startsAt)}</dd></div>
            <div><dt className="text-slate-400">End</dt><dd className="text-white">{formatDateTime(match.endsAt)}</dd></div>
          </dl>
        </Card>

        <Card className="overflow-x-auto lg:col-span-2">
          <h2 className="text-xl font-semibold text-white">Player participation</h2>
          {participationResult.data.length === 0 ? (
            <p className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-100">Details have not been synced for this match yet. Run Admin → Sync Match Details to populate board/player rows.</p>
          ) : (
            <table className="mt-4 w-full min-w-[720px] text-left text-sm">
              <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">Board</th><th>Player</th><th>Score</th><th>Games</th><th>W-D-L</th><th>Timeouts</th><th>Avg opp.</th><th>Last played</th></tr></thead>
              <tbody>{participationResult.data.map((row) => <tr key={row.playerId} className="border-b border-white/5 text-slate-200 last:border-0"><td className="py-4">{row.boardNumber ?? "—"}</td><td className="font-medium text-white">{row.title ? `${row.title} ` : ""}{row.username}</td><td>{row.score.toFixed(1)}</td><td>{row.gamesPlayed}</td><td>{row.wins}-{row.draws}-{row.losses}</td><td>{row.timeoutLosses}</td><td>{row.avgOpponentRating ?? "—"}</td><td>{formatDateTime(row.lastPlayedAt)}</td></tr>)}</tbody>
            </table>
          )}
        </Card>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Games</h2>
        {gameResult.data.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No games are stored for this match yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[720px] text-left text-sm">
            <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">White</th><th>Black</th><th>Result</th><th>Time class</th><th>Rated</th><th>Ended</th></tr></thead>
            <tbody>{gameResult.data.map((game) => <tr key={game.id} className="border-b border-white/5 text-slate-200 last:border-0"><td className="py-4">{game.whiteUsername ?? "—"}</td><td>{game.blackUsername ?? "—"}</td><td><Badge tone={game.result === "win" ? "green" : game.result === "loss" ? "red" : game.result === "draw" ? "gold" : "slate"}>{game.result}</Badge></td><td>{game.timeClass ?? "—"}</td><td>{game.rated ? "Yes" : "No"}</td><td>{formatDateTime(game.endTime)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </>
  );
}
