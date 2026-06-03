import Link from "next/link";
import { Badge, Card, PageHeader, StatCard } from "@/components/ui";
import { getPlayerProfile } from "@/server/queries";
import { formatDateTime, publicChesscomUrl, readableOpponentName } from "@/lib/utils";
import { formatTimeoutRate, formatWinRate } from "@/lib/player-profile";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayerProfilePageProps = {
  params: Promise<{ username: string }>;
};

function resultTone(result: "win" | "draw" | "loss" | "unknown" | "pending") {
  if (result === "win") return "green";
  if (result === "loss") return "red";
  if (result === "draw") return "gold";
  return "slate";
}


function formatScore(value: number | null | undefined) {
  if (value == null) return "—";
  return value.toFixed(1).replace(/\.0$/, "");
}

function formatTeamResult(
  result: "win" | "draw" | "loss" | "unknown" | "pending",
  teamScore: number | null,
  opponentScore: number | null,
) {
  const label = result === "unknown" ? "unknown" : result;
  if (teamScore == null || opponentScore == null) return label;
  return `${label} (${formatScore(teamScore)}-${formatScore(opponentScore)})`;
}

function DataLabel({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-sm text-slate-400">{label}</dt>
      <dd className="mt-1 text-white">{value}</dd>
    </div>
  );
}

export default async function PlayerProfilePage({ params }: PlayerProfilePageProps) {
  const { username } = await params;
  const profileResult = await getPlayerProfile(decodeURIComponent(username));
  const profile = profileResult.data;

  if (!profile) {
    return (
      <>
        <PageHeader
          eyebrow={profileResult.source}
          title="Player not found"
          description="This username was not found in the Team Kazakhstan player database."
        />
        <Card>
          <Link className="text-cyan-200 transition hover:text-cyan-100" href="/players">
            ← Back to players
          </Link>
        </Card>
      </>
    );
  }

  const { player, summary, timeoutStats } = profile;
  const profileUrl = publicChesscomUrl(player.chesscomUrl) ?? player.chesscomUrl;

  return (
    <>
      <PageHeader
        eyebrow={profileResult.source}
        title={player.username}
        description="Official Team Kazakhstan contribution profile with league breakdowns, recent official games, and Daily-only timeout analytics."
      />

      {profileResult.readError ? (
        <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-medium text-red-100">
          Database read failed. Check runtime logs for details.
        </div>
      ) : null}

      <Card className="mb-6">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              {player.title ? <Badge tone="gold">{player.title}</Badge> : null}
              {player.isTeamMember ? <Badge tone="green">Team member</Badge> : <Badge tone="slate">Former / archived player</Badge>}
            </div>
            {player.name ? <p className="mt-4 text-2xl font-semibold text-white">{player.name}</p> : null}
            <dl className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <DataLabel label="Country" value={player.country ?? "—"} />
              <DataLabel label="Current rating" value={player.currentRating ?? "—"} />
              <DataLabel label="Profile synced / last seen" value={formatDateTime(player.lastSeenAt)} />
              <DataLabel label="Last official game" value={formatDateTime(player.lastPlayedAt)} />
              <DataLabel label="Best league" value={summary.bestLeague ?? "—"} />
              <DataLabel
                label="Chess.com"
                value={
                  profileUrl ? (
                    <Link className="text-cyan-200 transition hover:text-cyan-100" href={profileUrl}>
                      Open profile
                    </Link>
                  ) : (
                    "—"
                  )
                }
              />
            </dl>
          </div>
          <Link className="rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-white/10" href="/players">
            Back to players
          </Link>
        </div>
      </Card>

      <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Official games" value={summary.officialGames} />
        <StatCard label="Wins" value={summary.wins} detail={`${summary.draws} draws · ${summary.losses} losses`} />
        <StatCard label="Win rate" value={formatWinRate(summary.wins, summary.officialGames)} />
        <StatCard label="Contribution score" value={summary.contributionScore.toFixed(2)} />
        <StatCard label="Matches played" value={summary.matchesPlayed} />
        <StatCard label="Best league" value={summary.bestLeague ?? "—"} />
        <StatCard label="Daily official games" value={timeoutStats.dailyOfficialGames} />
        <StatCard label="Daily timeout rate" value={formatTimeoutRate(timeoutStats.dailyTimeoutLosses, timeoutStats.dailyOfficialGames)} detail={`${timeoutStats.dailyTimeoutLosses} losses · ${timeoutStats.dailyTimeoutWins} wins`} />
      </div>

      <Card className="mb-6">
        <h2 className="text-xl font-semibold text-white">Daily timeout analytics</h2>
        <p className="mt-3 text-sm text-slate-300">
          Timeouts are counted only for official Daily games. Live games are excluded from timeout statistics.
        </p>
        <dl className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DataLabel label="Daily official games" value={timeoutStats.dailyOfficialGames} />
          <DataLabel label="Daily timeout losses" value={timeoutStats.dailyTimeoutLosses} />
          <DataLabel label="Daily timeout wins" value={timeoutStats.dailyTimeoutWins} />
          <DataLabel label="Last daily timeout" value={formatDateTime(timeoutStats.lastDailyTimeoutDate)} />
        </dl>
      </Card>

      {summary.officialGames === 0 ? (
        <Card className="mb-6 text-center">
          <p className="text-lg font-semibold text-white">No official Team Kazakhstan games found for this player yet.</p>
          <p className="mt-2 text-sm text-slate-400">Profile fields are still shown when available.</p>
        </Card>
      ) : null}

      <Card className="mb-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Official match contributions</h2>
        <p className="mt-2 text-sm text-slate-400">
          All official Team Kazakhstan matches where this player has a stored participation row. Daily timeout losses are counted only from official Daily/correspondence games; Live games remain included as contributions but are not counted as timeouts.
        </p>
        {profile.officialMatchContributions.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No official match contributions are available for this player yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[1240px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Date</th>
                <th>League</th>
                <th>Opponent</th>
                <th>Match status</th>
                <th>Team result</th>
                <th>Player score</th>
                <th>Games</th>
                <th>W-D-L</th>
                <th>Daily timeout losses</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {profile.officialMatchContributions.map((match) => {
                const matchUrl = publicChesscomUrl(match.chesscomUrl);
                return (
                  <tr key={match.id} className="border-b border-white/5 text-slate-200 last:border-0">
                    <td className="py-4">{formatDateTime(match.lastPlayedAt ?? match.endsAt ?? match.startsAt)}</td>
                    <td>{match.leagueName ?? match.leagueSlug ?? "—"}</td>
                    <td className="font-medium text-white">{readableOpponentName(match.opponent, match.name)}</td>
                    <td><Badge>{match.status}</Badge></td>
                    <td><Badge tone={resultTone(match.result)}>{formatTeamResult(match.result, match.teamScore, match.opponentScore)}</Badge></td>
                    <td>{formatScore(match.playerScore)}</td>
                    <td>{match.gamesPlayed}</td>
                    <td>{match.wins}-{match.draws}-{match.losses}</td>
                    <td>{match.dailyTimeoutLosses}</td>
                    <td>
                      <div className="flex flex-wrap gap-3">
                        <Link className="text-cyan-200 transition hover:text-cyan-100" href={`/matches/${match.id}`}>Details</Link>
                        {matchUrl ? <Link className="text-cyan-200 transition hover:text-cyan-100" href={matchUrl}>Open match</Link> : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mb-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">League breakdown</h2>
        {profile.leagueBreakdown.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No official contribution rows are available yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[1120px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">League</th>
                <th>Slug</th>
                <th>Games</th>
                <th>Matches</th>
                <th>W-D-L</th>
                <th>Win rate</th>
                <th>Contribution</th>
                <th>Last played</th>
                <th>Daily games</th>
                <th>Daily timeout losses</th>
                <th>Timeout rate</th>
              </tr>
            </thead>
            <tbody>
              {profile.leagueBreakdown.map((row) => (
                <tr key={row.leagueSlug ?? row.leagueName ?? "unknown"} className="border-b border-white/5 text-slate-200 last:border-0">
                  <td className="py-4 font-medium text-white">{row.leagueName ?? "—"}</td>
                  <td>{row.leagueSlug ?? "—"}</td>
                  <td>{row.gamesPlayed}</td>
                  <td>{row.matchesPlayed}</td>
                  <td>{row.wins}-{row.draws}-{row.losses}</td>
                  <td>{formatWinRate(row.wins, row.gamesPlayed)}</td>
                  <td className="font-semibold text-yellow-100">{row.contributionScore.toFixed(2)}</td>
                  <td>{formatDateTime(row.lastPlayedAt)}</td>
                  <td>{row.dailyGames}</td>
                  <td>{row.dailyTimeoutLosses}</td>
                  <td>{formatTimeoutRate(row.dailyTimeoutLosses, row.dailyGames)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mb-6 overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Recent official games</h2>
        {profile.recentGames.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No official games are stored for this player yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[1120px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Ended</th>
                <th>League</th>
                <th>Match</th>
                <th>Opponent</th>
                <th>Color</th>
                <th>Result</th>
                <th>Source</th>
                <th>Game</th>
              </tr>
            </thead>
            <tbody>
              {profile.recentGames.map((game) => {
                const gameUrl = publicChesscomUrl(game.chesscomUrl);
                return (
                  <tr key={game.id} className="border-b border-white/5 text-slate-200 last:border-0">
                    <td className="py-4">{formatDateTime(game.endedAt)}</td>
                    <td>{game.leagueName ?? game.leagueSlug ?? "—"}</td>
                    <td>{game.matchId ? <Link className="text-cyan-200 transition hover:text-cyan-100" href={`/matches/${game.matchId}`}>{game.matchTitle ?? `Match #${game.matchId}`}</Link> : game.matchTitle ?? "—"}</td>
                    <td>{game.opponentUsername ?? "—"}</td>
                    <td>{game.color}</td>
                    <td>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={resultTone(game.result)}>{game.result}</Badge>
                        {game.isDailyTimeoutLoss ? <Badge tone="red">Timeout</Badge> : null}
                      </div>
                    </td>
                    <td>{game.dataSource}</td>
                    <td>{gameUrl ? <Link className="text-cyan-200 transition hover:text-cyan-100" href={gameUrl}>Open game</Link> : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="overflow-x-auto">
        <h2 className="text-xl font-semibold text-white">Recent matches</h2>
        {profile.recentMatches.length === 0 ? (
          <p className="mt-4 text-sm text-slate-400">No match participation rows are available yet.</p>
        ) : (
          <table className="mt-4 w-full min-w-[920px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Opponent team</th>
                <th>League</th>
                <th>Status</th>
                <th>Team result</th>
                <th>Player score</th>
                <th>W-D-L</th>
                <th>Last played</th>
              </tr>
            </thead>
            <tbody>
              {profile.recentMatches.map((match) => (
                <tr key={match.id} className="border-b border-white/5 text-slate-200 last:border-0">
                  <td className="py-4 font-medium text-white"><Link className="hover:text-cyan-200" href={`/matches/${match.id}`}>{readableOpponentName(match.opponentTeam)}</Link></td>
                  <td>{match.leagueName ?? match.leagueSlug ?? "—"}</td>
                  <td><Badge>{match.status}</Badge></td>
                  <td><Badge tone={resultTone(match.teamResult)}>{match.teamResult}</Badge></td>
                  <td>{match.playerScore.toFixed(1)} / {match.gamesPlayed}</td>
                  <td>{match.wins}-{match.draws}-{match.losses}</td>
                  <td>{formatDateTime(match.lastPlayedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  );
}
