import Link from "next/link";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";
import { dataSourceLabel } from "@/lib/match-detail";
import {
  formatDateTime,
  publicChesscomUrl,
  readableOpponentName,
} from "@/lib/utils";
import { getMatchDetail } from "@/server/queries";
import type { Match, MatchDetailGame } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function resultTone(result: Match["result"] | "unknown") {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "draw") return "gold";
  return "slate";
}

function scoreValue(value: number | null) {
  return value == null ? "—" : value.toFixed(value % 1 === 0 ? 0 : 1);
}

function parseId(value: string) {
  const id = Number(value);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function ReadErrorBanner({ readError }: { readError?: { code?: string; message: string } }) {
  if (!readError) return null;
  return (
    <div className="mb-6 rounded-3xl border border-rose-300/30 bg-rose-500/10 p-4 text-sm text-rose-100">
      <p className="font-semibold">Database read error</p>
      <p className="mt-1">
        {readError.code ? `${readError.code}: ` : ""}{readError.message}
      </p>
      <p className="mt-2 text-rose-100/80">No demo match data is shown as database data.</p>
    </div>
  );
}

function EmptyState({ readError }: { readError?: { code?: string; message: string } }) {
  return (
    <>
      <PageHeader
        eyebrow="matches"
        title="Match not found"
        description="This public match detail page could not find a stored match for the requested id."
      />
      <ReadErrorBanner readError={readError} />
      <Card>
        <Link href="/matches" className="text-cyan-200 hover:text-cyan-100">
          ← Back to matches
        </Link>
      </Card>
    </>
  );
}

function GameLink({ game }: { game: MatchDetailGame }) {
  const gameUrl = publicChesscomUrl(game.chesscomUrl);
  if (!gameUrl) return <span className="text-slate-500">—</span>;
  return (
    <Link href={gameUrl} className="text-cyan-200 hover:text-cyan-100">
      Open game
    </Link>
  );
}

export default async function MatchDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return <EmptyState />;

  const detailResult = await getMatchDetail(id);
  const detail = detailResult.data;
  if (!detail) return <EmptyState readError={detailResult.readError} />;

  const { match, summary, coverage } = detail;
  const matchUrl = publicChesscomUrl(match.chesscomUrl);
  const opponentUrl = publicChesscomUrl(match.opponentUrl);

  return (
    <>
      <PageHeader
        eyebrow={detailResult.source}
        title={match.name}
        description="Read-only public detail page for one official Team Kazakhstan Chess.com match."
      />
      <ReadErrorBanner readError={detailResult.readError} />
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link href="/matches" className="text-sm text-cyan-200 hover:text-cyan-100">
          ← Back to matches
        </Link>
        {match.isOfficial ? <Badge tone="green">Official</Badge> : <Badge tone="slate">Not official</Badge>}
        {match.timeClass ? <Badge>{match.timeClass}</Badge> : null}
        {match.matchType ? <Badge tone="slate">{match.matchType}</Badge> : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <h2 className="text-xl font-semibold text-white">Match header</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div><dt className="text-slate-400">Internal match id</dt><dd className="text-white">{match.id}</dd></div>
            <div><dt className="text-slate-400">Chess.com match id</dt><dd className="text-white">{match.chesscomMatchId ?? "—"}</dd></div>
            <div><dt className="text-slate-400">Team Kazakhstan</dt><dd className="text-white">Team Kazakhstan</dd></div>
            <div><dt className="text-slate-400">Opponent team</dt><dd className="text-white">{readableOpponentName(match.opponent, match.name)}</dd></div>
            <div><dt className="text-slate-400">League</dt><dd className="text-white">{match.leagueName ?? "—"}</dd></div>
            <div><dt className="text-slate-400">League slug</dt><dd className="text-white">{match.leagueSlug ?? "—"}</dd></div>
            <div><dt className="text-slate-400">Status</dt><dd><Badge>{match.status}</Badge></dd></div>
            <div><dt className="text-slate-400">Team result</dt><dd><Badge tone={resultTone(summary.result)}>{summary.result}</Badge></dd></div>
            <div><dt className="text-slate-400">Start date</dt><dd className="text-white">{formatDateTime(match.startsAt)}</dd></div>
            <div><dt className="text-slate-400">End date</dt><dd className="text-white">{formatDateTime(match.endsAt)}</dd></div>
          </dl>
          <div className="mt-6 flex flex-wrap gap-3">
            {matchUrl ? <Link href={matchUrl} className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200">Open Chess.com match</Link> : null}
            {opponentUrl ? <Link href={opponentUrl} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-white/10">Open opponent</Link> : null}
          </div>
        </Card>

        <div className="grid gap-4 lg:col-span-2 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Team Kazakhstan score" value={scoreValue(summary.teamScore)} />
          <StatCard label="Opponent score" value={scoreValue(summary.opponentScore)} />
          <StatCard label="Result" value={summary.result} />
          <StatCard label="Total stored games" value={summary.totalStoredGames} detail="Latest 200 shown below" />
          <StatCard label="Team players" value={summary.teamPlayersCount} />
          <StatCard label="Opponent players" value={summary.opponentPlayersCount} />
          <StatCard label="Daily timeout losses" value={summary.dailyTimeoutLosses} detail="Official Daily only" />
          <StatCard label="Daily timeout wins" value={summary.dailyTimeoutWins} detail="Official Daily only" />
          <StatCard label="Old SQLite / API games" value={`${summary.oldSqliteGames} / ${summary.chesscomApiGames}`} />
        </div>
      </div>

      <Card className="mt-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Player contributions</h2>
        {detail.players.length === 0 ? (
          <p className="mt-4 rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-100">
            No Team Kazakhstan participation rows are stored for this match yet.
          </p>
        ) : (
          <table className="mt-4 w-full min-w-[900px] text-left text-sm">
            <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">Player</th><th>Games</th><th>Wins</th><th>Draws</th><th>Losses</th><th>Score</th><th>Contribution</th><th>Daily timeout losses</th><th>Last played</th></tr></thead>
            <tbody>
              {detail.players.map((player) => (
                <tr key={player.playerId} className="border-b border-white/5 text-slate-200 last:border-0">
                  <td className="py-4 font-medium text-white"><Link href={`/players/${encodeURIComponent(player.username)}`} className="hover:text-cyan-200">{player.title ? `${player.title} ` : ""}{player.username}</Link></td>
                  <td>{player.games}</td><td>{player.wins}</td><td>{player.draws}</td><td>{player.losses}</td><td>{player.score.toFixed(1)}</td><td>{player.contributionScore == null ? "—" : player.contributionScore.toFixed(2)}</td><td>{player.dailyTimeoutLosses}</td><td>{formatDateTime(player.lastPlayedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Games</h2>
        <p className="mt-2 text-sm text-slate-400">Showing the latest {detail.games.length} stored games. Pagination can be added here later.</p>
        {detail.games.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No official games are stored for this match yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[1100px] text-left text-sm">
            <thead className="text-slate-400"><tr className="border-b border-white/10"><th className="py-3">Board / game</th><th>Team player</th><th>Opponent</th><th>Color</th><th>Result</th><th>Time class</th><th>Ended at</th><th>Data source</th><th>Chess.com</th><th>Timeout</th></tr></thead>
            <tbody>
              {detail.games.map((game) => (
                <tr key={game.id} className="border-b border-white/5 text-slate-200 last:border-0">
                  <td className="py-4">{game.boardNumber ?? "—"} / {game.id}</td>
                  <td className="font-medium text-white">{game.teamPlayerUsername ? <Link href={`/players/${encodeURIComponent(game.teamPlayerUsername)}`} className="hover:text-cyan-200">{game.teamPlayerUsername}</Link> : "—"}</td>
                  <td>{game.opponentUsername ?? "—"}</td><td>{game.color}</td><td><Badge tone={resultTone(game.result)}>{game.result}</Badge></td><td>{game.timeClass ?? "—"}</td><td>{formatDateTime(game.endedAt)}</td><td>{dataSourceLabel(game.dataSource)}</td><td><GameLink game={game} /></td><td>{game.isDailyTimeoutLoss ? <Badge tone="red">Daily timeout loss</Badge> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mt-6">
        <h2 className="text-xl font-semibold text-white">Data coverage</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div><dt className="text-slate-400">Stored games</dt><dd className="text-white">{coverage.storedGamesCount}</dd></div>
          <div><dt className="text-slate-400">Old SQLite games</dt><dd className="text-white">{coverage.oldSqliteGamesCount}</dd></div>
          <div><dt className="text-slate-400">Chess.com API games</dt><dd className="text-white">{coverage.chesscomApiGamesCount}</dd></div>
          <div><dt className="text-slate-400">Unknown source</dt><dd className="text-white">{coverage.unknownSourceGamesCount}</dd></div>
          <div><dt className="text-slate-400">Unknown result</dt><dd className="text-white">{coverage.unknownResultGamesCount}</dd></div>
          <div><dt className="text-slate-400">Unknown time class</dt><dd className="text-white">{coverage.unknownTimeClassGamesCount}</dd></div>
          <div><dt className="text-slate-400">Without Chess.com URL</dt><dd className="text-white">{coverage.gamesWithoutChesscomUrlCount}</dd></div>
          <div><dt className="text-slate-400">Last stored game date</dt><dd className="text-white">{formatDateTime(coverage.lastStoredGameDate)}</dd></div>
        </dl>
      </Card>
    </>
  );
}
