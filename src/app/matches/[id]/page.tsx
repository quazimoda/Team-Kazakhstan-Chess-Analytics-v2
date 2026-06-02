import Link from "next/link";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";
import { dataSourceLabel, formatMatchResult } from "@/lib/match-detail";
import {
  formatDateTime,
  publicChesscomUrl,
  readableOpponentName,
} from "@/lib/utils";
import { getMatchDetail } from "@/server/queries";
import type { Match } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function resultTone(result: Match["result"] | "unknown") {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "draw") return "gold";
  return "slate";
}

function scoreValue(value: number | null) {
  return value == null ? "—" : value.toFixed(1).replace(/\.0$/, "");
}

function NotFoundCard() {
  return (
    <Card className="text-center">
      <h1 className="text-2xl font-bold text-white">Match not found</h1>
      <p className="mt-2 text-sm text-slate-400">
        This match is not available in the current data set.
      </p>
      <Link className="mt-5 inline-flex text-cyan-200 hover:text-cyan-100" href="/matches">
        ← Back to matches
      </Link>
    </Card>
  );
}

export default async function MatchDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const detailResult = await getMatchDetail(id);

  if (detailResult.readError) {
    return (
      <>
        <PageHeader
          eyebrow="database error"
          title="Match detail"
          description="The database could not be read, so no match data is being shown."
        />
        <Card className="border-rose-400/30 bg-rose-950/40">
          <h1 className="text-2xl font-bold text-rose-100">Database read failed</h1>
          <p className="mt-3 text-sm text-rose-100/90">
            {detailResult.readError.message}
          </p>
          <Link className="mt-5 inline-flex text-cyan-200 hover:text-cyan-100" href="/matches">
            ← Back to matches
          </Link>
        </Card>
      </>
    );
  }

  const detail = detailResult.data;
  if (!detail) return <NotFoundCard />;

  const { match, coverage, players, games } = detail;
  const matchUrl = publicChesscomUrl(match.chesscomUrl);
  const opponent = readableOpponentName(match.opponent, match.name);

  return (
    <>
      <PageHeader
        eyebrow={detailResult.source}
        title={`Team Kazakhstan vs ${opponent}`}
        description="Read-only public match detail with full-match coverage metrics and the latest 200 stored games."
      />
      <div className="mb-6">
        <Link href="/matches" className="text-sm text-cyan-200 hover:text-cyan-100">
          ← Back to matches
        </Link>
      </div>

      <Card className="mb-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 flex flex-wrap gap-2">
              <Badge tone={match.isOfficialCandidate ? "green" : "slate"}>
                {match.isOfficialCandidate ? "Official" : "Not official"}
              </Badge>
              <Badge tone={resultTone(match.result)}>{formatMatchResult(match.result)}</Badge>
              <Badge>{match.status}</Badge>
            </div>
            <h1 className="text-2xl font-bold text-white">{match.name}</h1>
            <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-slate-400">League</dt>
                <dd className="text-white">{match.leagueName ?? match.leagueSlug ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">League slug</dt>
                <dd className="text-white">{match.leagueSlug ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-slate-400">Start</dt>
                <dd className="text-white">{formatDateTime(match.startsAt)}</dd>
              </div>
              <div>
                <dt className="text-slate-400">End</dt>
                <dd className="text-white">{formatDateTime(match.endsAt)}</dd>
              </div>
            </dl>
          </div>
          {matchUrl ? (
            <Link
              href={matchUrl}
              className="rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Open Chess.com match
            </Link>
          ) : null}
        </div>
      </Card>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Team Kazakhstan score" value={scoreValue(match.teamScore)} />
        <StatCard label="Opponent score" value={scoreValue(match.opponentScore)} />
        <StatCard label="Result" value={formatMatchResult(match.result)} />
        <StatCard label="Total stored games" value={coverage.totalStoredGames} detail="Full-match aggregate" />
        <StatCard label="Displayed games" value={coverage.displayedGamesCount} detail="Latest 200 max" />
        <StatCard label="Team KZ players" value={players.length} />
        <StatCard label="old_sqlite games" value={coverage.oldSqliteGames} />
        <StatCard label="chesscom_api games" value={coverage.chesscomApiGames} />
        <StatCard label="Daily timeout losses" value={coverage.dailyTimeoutLosses} detail="Official Daily only" />
        <StatCard label="Daily timeout wins" value={coverage.dailyTimeoutWins} detail="Official Daily only" />
      </div>

      <Card className="mb-6">
        <h2 className="text-xl font-semibold text-white">Coverage checks</h2>
        <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div><dt className="text-slate-400">Unknown source</dt><dd className="text-white">{coverage.unknownSourceGames}</dd></div>
          <div><dt className="text-slate-400">Unknown result</dt><dd className="text-white">{coverage.unknownResultGames}</dd></div>
          <div><dt className="text-slate-400">Unknown time class</dt><dd className="text-white">{coverage.unknownTimeClassGames}</dd></div>
          <div><dt className="text-slate-400">Without Chess.com URL</dt><dd className="text-white">{coverage.gamesWithoutChesscomUrl}</dd></div>
          <div><dt className="text-slate-400">Last stored game</dt><dd className="text-white">{formatDateTime(coverage.lastStoredGameDate)}</dd></div>
        </dl>
      </Card>

      <Card className="mb-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Player contributions</h2>
        {players.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No Team Kazakhstan player rows are stored for this match yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[840px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Player</th>
                <th>Games</th>
                <th>Wins</th>
                <th>Draws</th>
                <th>Losses</th>
                <th>Score</th>
                <th>Daily timeout losses</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => (
                <tr key={player.playerId} className="border-b border-white/5 text-slate-200 last:border-0">
                  <td className="py-4 font-medium text-white">
                    <Link className="text-cyan-200 hover:text-cyan-100" href={`/players/${encodeURIComponent(player.username)}`}>
                      {player.username}
                    </Link>
                  </td>
                  <td>{player.games}</td>
                  <td>{player.wins}</td>
                  <td>{player.draws}</td>
                  <td>{player.losses}</td>
                  <td>{player.score.toFixed(1).replace(/\.0$/, "")}</td>
                  <td>{player.dailyTimeoutLosses}</td>
                  <td>{formatDateTime(player.lastPlayedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Latest stored games</h2>
        <p className="mt-2 text-sm text-slate-400">
          Rendering is limited to the latest 200 games; summary and coverage totals above use an unbounded aggregate query.
        </p>
        {games.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No games are stored for this match yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[1120px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Team Kazakhstan player</th>
                <th>Opponent</th>
                <th>Color</th>
                <th>Result</th>
                <th>Time class</th>
                <th>Ended at</th>
                <th>Source</th>
                <th>Game</th>
              </tr>
            </thead>
            <tbody>
              {games.map((game) => {
                const gameUrl = publicChesscomUrl(game.chesscomUrl);
                return (
                  <tr key={game.id} className="border-b border-white/5 text-slate-200 last:border-0">
                    <td className="py-4 font-medium text-white">
                      {game.teamUsername ? (
                        <Link className="text-cyan-200 hover:text-cyan-100" href={`/players/${encodeURIComponent(game.teamUsername)}`}>
                          {game.teamUsername}
                        </Link>
                      ) : "—"}
                    </td>
                    <td>{game.opponentUsername ?? "—"}</td>
                    <td>{game.color}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <Badge tone={resultTone(game.result)}>{formatMatchResult(game.result)}</Badge>
                        {game.isDailyTimeoutLoss ? <Badge tone="red">Daily timeout</Badge> : null}
                      </div>
                    </td>
                    <td>{game.timeClass ?? "—"}</td>
                    <td>{formatDateTime(game.endedAt)}</td>
                    <td>{dataSourceLabel(game.dataSource)}</td>
                    <td>{gameUrl ? <Link className="text-cyan-200 hover:text-cyan-100" href={gameUrl}>Open game</Link> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
