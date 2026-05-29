export type DataQualityWarningCounts = {
  playersTotal: number;
  teamMembersTotal?: number;
  archiveSyncedPlayers: number;
  archiveSyncedTeamMembers?: number;
  gamesImported: number;
  participationRows: number;
  contributionRows: number;
  officialMatchesWithParticipations: number;
  unknownMatchesCount: number;
};

export function buildDataQualityWarnings(summary: DataQualityWarningCounts) {
  const warnings: string[] = [];
  const teamMembersTotal = summary.teamMembersTotal ?? summary.playersTotal;
  const archiveSyncedTeamMembers = summary.archiveSyncedTeamMembers ?? summary.archiveSyncedPlayers;
  if (teamMembersTotal > 0 && archiveSyncedTeamMembers === 0) warnings.push("No team members have a successful archive sync state yet.");
  if (summary.gamesImported > 0 && summary.participationRows === 0) warnings.push("Games exist but no participation rows are available for contribution calculations.");
  if (summary.contributionRows === 0 && summary.participationRows > 0) warnings.push("Participation rows exist but contribution rows are empty. Run Recalculate.");
  if (summary.unknownMatchesCount > summary.officialMatchesWithParticipations) warnings.push("Unknown matches outnumber official matches with participations; league classification/backfill needs attention.");
  return warnings;
}
