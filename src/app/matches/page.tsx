import { MatchesTable } from "@/components/tables";
import { PageHeader } from "@/components/ui";
import { getMatches } from "@/server/queries";

export default async function MatchesPage() {
  const matches = await getMatches();
  return (
    <>
      <PageHeader eyebrow={matches.source} title="Matches" description="Chess.com team match calendar, status, score, and board counts." />
      <MatchesTable rows={matches.data} />
    </>
  );
}
