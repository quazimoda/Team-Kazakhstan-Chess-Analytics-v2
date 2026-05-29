import { Badge, Card, PageHeader } from "@/components/ui";
import { formatDateTime } from "@/lib/utils";
import { getLeagues } from "@/server/queries";

export default async function LeaguesPage() {
  const leagues = await getLeagues();
  return (
    <>
      <PageHeader eyebrow={leagues.source} title="Leagues" description="League and season containers that group matches and contribution calculations." />
      <div className="grid gap-4 md:grid-cols-2">
        {leagues.data.map((league) => (
          <Card key={league.id}>
            <div className="flex items-start justify-between gap-3">
              <div><h3 className="text-xl font-semibold text-white">{league.name}</h3><p className="mt-1 text-sm text-slate-400">{league.slug}</p></div>
              <Badge tone={league.status === "active" ? "green" : "slate"}>{league.status}</Badge>
            </div>
            <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
              <div><dt className="text-slate-500">Season</dt><dd className="mt-1 text-slate-200">{league.season ?? "—"}</dd></div>
              <div><dt className="text-slate-500">Starts</dt><dd className="mt-1 text-slate-200">{formatDateTime(league.startsAt)}</dd></div>
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
