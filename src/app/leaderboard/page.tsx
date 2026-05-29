import { LeaderboardTable } from "@/components/tables";
import { PageHeader } from "@/components/ui";
import { getLeaderboard } from "@/server/queries";

export default async function LeaderboardPage() {
  const leaderboard = await getLeaderboard();
  return (
    <>
      <PageHeader eyebrow={leaderboard.source} title="Leaderboard" description="Contribution-first ranking for Team Kazakhstan players across tracked matches." />
      <LeaderboardTable rows={leaderboard.data} />
    </>
  );
}
