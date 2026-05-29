import { PlayersTable } from "@/components/tables";
import { PageHeader } from "@/components/ui";
import { getPlayers } from "@/server/queries";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PlayersPage() {
  const players = await getPlayers();
  return (
    <>
      <PageHeader eyebrow={players.source} title="Players" description="Roster view with Chess.com profile fields and MVP performance totals." />
      <PlayersTable rows={players.data} />
    </>
  );
}
