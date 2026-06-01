import Link from "next/link";
import { MatchesTable } from "@/components/tables";
import { Card, PageHeader } from "@/components/ui";
import { getLeagues, getMatches } from "@/server/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function filterHref(official: string, league: string, month?: string) {
  const params = new URLSearchParams();
  if (official === "all") params.set("official", "all");
  if (league !== "all") params.set("league", league);
  if (month) params.set("month", month);
  const query = params.toString();
  return query ? `/matches?${query}` : "/matches";
}

function FilterLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: string;
}) {
  return (
    <Link
      href={href}
      className={`rounded-full border px-3 py-1.5 text-sm ${active ? "border-cyan-300/40 bg-cyan-400/20 text-cyan-100" : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10"}`}
    >
      {children}
    </Link>
  );
}

export default async function MatchesPage({
  searchParams,
}: {
  searchParams: Promise<{ official?: string; league?: string; month?: string }>;
}) {
  const params = await searchParams;
  const official = params.official === "all" ? "all" : "official";
  const league = params.league ?? "all";
  const month =
    params.month && /^\d{4}-\d{2}$/.test(params.month)
      ? params.month
      : undefined;
  const [matches, leagues] = await Promise.all([
    getMatches({ official, league, month }),
    getLeagues(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow={matches.source}
        title="Matches"
        description="Chess.com team match calendar, status, score, and board counts."
      />
      <Card className="mb-6 space-y-4">
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">
            Official filter
          </p>
          <div className="flex flex-wrap gap-2">
            <FilterLink
              href={filterHref("official", league, month)}
              active={official === "official"}
            >
              Official matches
            </FilterLink>
            <FilterLink
              href={filterHref("all", league, month)}
              active={official === "all"}
            >
              All including Friendly / Non-league
            </FilterLink>
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium text-slate-300">League</p>
          <div className="flex flex-wrap gap-2">
            <FilterLink
              href={filterHref(official, "all", month)}
              active={league === "all"}
            >
              All leagues
            </FilterLink>
            {leagues.data
              .filter(
                (item) =>
                  official === "all" ||
                  (item.slug !== "unknown" && item.slug !== "friendly"),
              )
              .map((item) => (
                <FilterLink
                  key={item.slug}
                  href={filterHref(official, item.slug, month)}
                  active={league === item.slug}
                >{`${item.name}${item.matchCount === 0 ? " (no data yet)" : item.matchCount == null ? "" : ` (${item.matchCount})`}`}</FilterLink>
              ))}
          </div>
        </div>
        {month ? (
          <p className="text-sm text-slate-400">
            Showing matches for {month}.{" "}
            <Link
              href={filterHref(official, league)}
              className="text-cyan-200 hover:text-cyan-100"
            >
              Clear month filter
            </Link>
          </p>
        ) : null}
      </Card>
      <MatchesTable rows={matches.data} />
    </>
  );
}
