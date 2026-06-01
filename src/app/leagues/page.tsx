import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getLeagues } from "@/server/queries";
import type { League } from "@/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function LeagueCard({ league }: { league: League }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-white">{league.name}</h3>
          <p className="mt-1 text-sm text-slate-400">{league.slug}</p>
        </div>
        <Badge tone={league.status === "active" ? "green" : "slate"}>
          {league.status}
        </Badge>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-slate-500">Season</dt>
          <dd className="mt-1 text-slate-200">{league.season ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Starts</dt>
          <dd className="mt-1 text-slate-200">
            {formatDateTime(league.startsAt)}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Matches</dt>
          <dd className="mt-1 text-slate-200">{league.matchCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Official matches</dt>
          <dd className="mt-1 text-slate-200">
            {league.officialMatchCount ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Games</dt>
          <dd className="mt-1 text-slate-200">{league.gameCount ?? 0}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Participations</dt>
          <dd className="mt-1 text-slate-200">
            {league.participationCount ?? 0}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Contribution rows</dt>
          <dd className="mt-1 text-slate-200">
            {league.contributionCount ?? 0}
          </dd>
        </div>
      </dl>
    </Card>
  );
}

export default async function LeaguesPage() {
  const leagues = await getLeagues();
  const officialLeagues = leagues.data.filter(
    (league) => league.slug !== "unknown" && league.slug !== "friendly",
  );
  const systemLeagues = leagues.data.filter(
    (league) => league.slug === "unknown" || league.slug === "friendly",
  );

  return (
    <>
      <PageHeader
        eyebrow={leagues.source}
        title="Leagues"
        description="Official league and season containers are shown first, with system categories kept separate for transparency."
      />
      {leagues.source === "demo" ? (
        <div className="mb-6 rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-4 text-sm font-medium text-yellow-100">
          Demo fallback is being shown. Database read failed or DATABASE_URL is
          not configured.
        </div>
      ) : null}
      {leagues.readError ? (
        <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-medium text-red-100">
          Database read failed. Check Vercel runtime logs.
        </div>
      ) : null}

      <section>
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h3 className="text-2xl font-semibold text-white">
              Official leagues
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Public competition groups used for official analytics.
            </p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {officialLeagues.map((league) => (
            <LeagueCard key={league.id} league={league} />
          ))}
        </div>
      </section>

      {systemLeagues.length > 0 ? (
        <section className="mt-10">
          <div className="mb-4">
            <h3 className="text-2xl font-semibold text-white">
              System / non-official categories
            </h3>
            <p className="mt-1 text-sm text-slate-400">
              Unknown and Friendly / Non-league records remain in the database
              but are separated from official league reporting.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {systemLeagues.map((league) => (
              <LeagueCard key={league.id} league={league} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
