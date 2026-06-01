import Link from "next/link";
import { getMatches, getTeamSummary } from "@/server/queries";
import {
  formatDateTime,
  formatNumber,
  publicChesscomUrl,
  readableOpponentName,
} from "@/lib/utils";
import { Badge, Card, StatCard } from "./ui";

export async function Dashboard() {
  const [summary, matches] = await Promise.all([
    getTeamSummary(),
    getMatches({ official: "official" }),
  ]);
  const nextMatch = matches.data.find(
    (match) =>
      match.status === "registration" ||
      match.status === "scheduled" ||
      match.status === "active",
  );
  const nextMatchUrl =
    publicChesscomUrl(nextMatch?.chesscomUrl) ??
    publicChesscomUrl(nextMatch?.opponentUrl) ??
    (nextMatch ? `/matches/${nextMatch.id}` : null);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <StatCard
          label="Total players"
          value={formatNumber(summary.data.players)}
          detail={`${summary.source} source`}
        />
        <StatCard
          label="Official matches"
          value={formatNumber(summary.data.officialMatches)}
          detail="Classified Team Kazakhstan matches"
        />
        <StatCard
          label="Games indexed"
          value={formatNumber(summary.data.games)}
          detail={`${formatNumber(summary.data.oldArchiveGames)} from old archive`}
        />
        <StatCard
          label="Old archive games"
          value={formatNumber(summary.data.oldArchiveGames)}
          detail="Historical SQLite import"
        />
        <StatCard
          label="Active official leagues"
          value={formatNumber(summary.data.activeLeagues)}
          detail="Public competition groups"
        />
        <StatCard
          label="Contribution rows"
          value={formatNumber(summary.data.contributionRows)}
          detail="Player analytics aggregates"
        />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Data coverage</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">
                Historical Team Kazakhstan archive is live
              </h3>
            </div>
            <Badge tone="green">Live archive</Badge>
          </div>
          <p className="mt-4 text-slate-300">
            This public dashboard tracks official Chess.com team matches,
            historical archive games, league activity, player contribution, win
            rate, and performance trends for Team Kazakhstan.
          </p>
          <dl className="mt-6 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <dt className="text-slate-500">Earliest game</dt>
              <dd className="mt-1 text-slate-200">
                {formatDateTime(summary.data.earliestGameDate)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Latest game</dt>
              <dd className="mt-1 text-slate-200">
                {formatDateTime(summary.data.latestGameDate)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Old SQLite games</dt>
              <dd className="mt-1 text-slate-200">
                {formatNumber(summary.data.oldArchiveGames)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Total indexed games</dt>
              <dd className="mt-1 text-slate-200">
                {formatNumber(summary.data.games)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Official matches</dt>
              <dd className="mt-1 text-slate-200">
                {formatNumber(summary.data.officialMatches)}
              </dd>
            </div>
          </dl>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Next match</p>
          <h3 className="mt-2 text-xl font-semibold text-white">
            {nextMatch?.name ?? "No upcoming match"}
          </h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div>
              <dt className="text-slate-500">Opponent</dt>
              <dd className="text-slate-200">
                {nextMatch
                  ? readableOpponentName(nextMatch.opponent, nextMatch.name)
                  : "Sync official matches to discover opponents"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">League</dt>
              <dd className="text-slate-200">
                {nextMatch?.leagueName ?? nextMatch?.leagueSlug ?? "—"}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Start</dt>
              <dd className="text-cyan-200">
                {formatDateTime(nextMatch?.startsAt)}
              </dd>
            </div>
            <div>
              <dt className="text-slate-500">Status</dt>
              <dd>
                <Badge>{nextMatch?.status ?? "pending"}</Badge>
              </dd>
            </div>
          </dl>
          {nextMatchUrl ? (
            <Link
              href={nextMatchUrl}
              className="mt-6 inline-flex rounded-2xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
            >
              Open match
            </Link>
          ) : null}
        </Card>
      </div>
    </div>
  );
}
