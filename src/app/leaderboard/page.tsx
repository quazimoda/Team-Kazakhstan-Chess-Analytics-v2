import { LeaderboardTable } from "@/components/tables";
import { Card, PageHeader } from "@/components/ui";
import { getLeaderboard, getLeagues, type LeaderboardSort } from "@/server/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const sortOptions = new Set(["contribution_score", "points", "win_rate", "games"]);

type LeaderboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseMinGames(value: string | undefined) {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseSort(value: string | undefined): LeaderboardSort {
  return value && sortOptions.has(value) ? (value as LeaderboardSort) : "contribution_score";
}

export default async function LeaderboardPage({ searchParams }: LeaderboardPageProps) {
  const params = (await searchParams) ?? {};
  const league = first(params.league) ?? "all";
  const period = first(params.period) ?? "all";
  const minGames = parseMinGames(first(params.minGames));
  const sort = parseSort(first(params.sort));
  const [leaderboard, leagues] = await Promise.all([getLeaderboard({ league, period, minGames, sort }), getLeagues()]);

  const sortHref = (nextSort: string) => {
    const next = new URLSearchParams();
    if (league !== "all") next.set("league", league);
    if (period !== "all") next.set("period", period);
    if (minGames > 0) next.set("minGames", String(minGames));
    next.set("sort", nextSort);
    return `/leaderboard?${next.toString()}`;
  };

  return (
    <>
      <PageHeader eyebrow={leaderboard.source} title="Player Contribution Leaderboard" description="MVP ranking for Team Kazakhstan players based on official match participation, chess points, and contribution score." />
      <Card className="mb-6">
        <form className="grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <input type="hidden" name="sort" value={sort} />
          <input type="hidden" name="period" value={period} />
          <label className="text-sm text-slate-300">
            <span className="mb-2 block font-medium text-white">League</span>
            <select name="league" defaultValue={league} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300">
              <option value="all">All official leagues</option>
              {leagues.data.map((item) => <option key={item.slug} value={item.slug}>{item.name}</option>)}
            </select>
          </label>
          <label className="text-sm text-slate-300">
            <span className="mb-2 block font-medium text-white">Minimum games</span>
            <input name="minGames" type="number" min="0" defaultValue={minGames} className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300" />
          </label>
          <button className="rounded-2xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200" type="submit">Apply filters</button>
        </form>
      </Card>
      <LeaderboardTable rows={leaderboard.data} sort={sort} sortHref={sortHref} />
    </>
  );
}
