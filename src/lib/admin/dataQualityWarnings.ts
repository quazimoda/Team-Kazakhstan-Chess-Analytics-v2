export type DataQualityWarningCounts = {
  playersTotal: number;
  archiveSyncedPlayers: number;
  gamesImported: number;
  participationRows: number;
  contributionRows: number;
  officialMatchesWithParticipations: number;
  unknownMatchesCount: number;
};

export function buildDataQualityWarnings(summary: DataQualityWarningCounts) {
  const warnings: string[] = [];
  if (summary.playersTotal > 0 && summary.archiveSyncedPlayers === 0) warnings.push("No players have a successful archive sync state yet.");
  if (summary.gamesImported > 0 && summary.participationRows === 0) warnings.push("Games exist but no participation rows are available for contribution calculations.");
  if (summary.contributionRows === 0 && summary.participationRows > 0) warnings.push("Participation rows exist but contribution rows are empty. Run Recalculate.");
  if (summary.unknownMatchesCount > summary.officialMatchesWithParticipations) warnings.push("Unknown matches outnumber official matches with participations; league classification/backfill needs attention.");
  return warnings;
}
