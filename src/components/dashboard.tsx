import { getMatches, getTeamSummary } from "@/server/queries";
import { formatDateTime } from "@/lib/utils";
import { Badge, Card, StatCard } from "./ui";

export async function Dashboard() {
  const [summary, matches] = await Promise.all([getTeamSummary(), getMatches()]);
  const nextMatch = matches.data.find((match) => match.status === "registration" || match.status === "scheduled" || match.status === "active");

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Tracked players" value={summary.data.players} detail={`${summary.source} source`} />
        <StatCard label="Matches" value={summary.data.matches} detail="Chess.com team matches" />
        <StatCard label="Active leagues" value={summary.data.activeLeagues} detail="Current campaigns" />
        <StatCard label="Games indexed" value={summary.data.games} detail="Ready for Stage 2 scoring" />
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-sm text-slate-400">Operational status</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Foundation is ready for live Chess.com sync</h3>
            </div>
            <Badge tone="gold">MVP</Badge>
          </div>
          <p className="mt-4 text-slate-300">Stage 1 establishes the App Router UI, typed API boundaries, Drizzle schema, demo fallbacks, and an admin sync shell. Add real ingestion and contribution formulas in Stage 2.</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-400">Next match</p>
          <h3 className="mt-2 text-xl font-semibold text-white">{nextMatch?.name ?? "No upcoming match"}</h3>
          <p className="mt-2 text-sm text-slate-300">{nextMatch?.opponent ?? "Configure sync to discover matches"}</p>
          <p className="mt-4 text-sm text-cyan-200">{formatDateTime(nextMatch?.startsAt)}</p>
        </Card>
      </div>
    </div>
  );
}
