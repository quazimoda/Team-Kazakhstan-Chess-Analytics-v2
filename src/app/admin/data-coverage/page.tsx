import { PageHeader } from "@/components/ui";
import { DataCoverageDashboard } from "./data-coverage-dashboard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DataCoveragePage() {
  return (
    <>
      <PageHeader
        eyebrow="admin"
        title="Data coverage"
        description="Read-only coverage dashboard for official match, game, participation, and archive sync data before larger backfills."
      />
      <DataCoverageDashboard />
    </>
  );
}
