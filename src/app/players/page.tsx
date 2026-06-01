import { PlayersTable } from "@/components/tables";
import { Card, PageHeader } from "@/components/ui";
import { getPlayers, type PlayerFilters } from "@/server/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PlayersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseOfficial(
  value: string | undefined,
): NonNullable<PlayerFilters["official"]> {
  return value === "with" || value === "without" ? value : "all";
}

function parseTeam(
  value: string | undefined,
): NonNullable<PlayerFilters["team"]> {
  return value === "members" ? "members" : "all";
}

function parseSort(
  value: string | undefined,
): NonNullable<PlayerFilters["sort"]> {
  if (
    value === "rating" ||
    value === "official_games" ||
    value === "contribution" ||
    value === "last_played"
  )
    return value;
  return "username";
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const params = (await searchParams) ?? {};
  const q = first(params.q)?.trim() ?? "";
  const official = parseOfficial(first(params.official));
  const team = parseTeam(first(params.team));
  const sort = parseSort(first(params.sort));
  const players = await getPlayers({ q, official, team, sort });

  return (
    <>
      <PageHeader
        eyebrow={players.source}
        title="Players"
        description="Search Team Kazakhstan usernames and review profile fields alongside official contribution aggregates."
      />
      {players.source === "demo" ? (
        <div className="mb-6 rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-4 text-sm font-medium text-yellow-100">
          Demo player data is being shown because the database is not configured
          or demo mode is enabled.
        </div>
      ) : null}
      {players.readError ? (
        <div className="mb-6 rounded-2xl border border-red-400/30 bg-red-500/10 p-4 text-sm font-medium text-red-100">
          Database read failed. Check Vercel runtime logs.
        </div>
      ) : null}
      <Card className="mb-6">
        <form className="grid gap-4 md:grid-cols-[1.4fr_1fr_1fr_1fr_auto] md:items-end">
          <label className="text-sm text-slate-300">
            <span className="mb-2 block font-medium text-white">Username</span>
            <input
              name="q"
              type="search"
              defaultValue={q}
              placeholder="Search player username..."
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-600 focus:border-cyan-300"
            />
          </label>
          <label className="text-sm text-slate-300">
            <span className="mb-2 block font-medium text-white">
              Official games
            </span>
            <select
              name="official"
              defaultValue={official}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300"
            >
              <option value="all">All players</option>
              <option value="with">With official games</option>
              <option value="without">No official games</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            <span className="mb-2 block font-medium text-white">
              Membership
            </span>
            <select
              name="team"
              defaultValue={team}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300"
            >
              <option value="all">All players</option>
              <option value="members">Team members</option>
            </select>
          </label>
          <label className="text-sm text-slate-300">
            <span className="mb-2 block font-medium text-white">Sort by</span>
            <select
              name="sort"
              defaultValue={sort}
              className="w-full rounded-2xl border border-white/10 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-300"
            >
              <option value="username">Username</option>
              <option value="rating">Rating</option>
              <option value="official_games">Official games</option>
              <option value="contribution">Contribution</option>
              <option value="last_played">Last played</option>
            </select>
          </label>
          <button
            className="rounded-2xl bg-cyan-300 px-5 py-3 font-semibold text-slate-950 transition hover:bg-cyan-200"
            type="submit"
          >
            Apply filters
          </button>
        </form>
      </Card>
      {players.readError ? null : <PlayersTable rows={players.data} />}
    </>
  );
}
