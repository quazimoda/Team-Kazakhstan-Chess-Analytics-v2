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
  officialLeaguesWithMatchesButNoGames?: string[];
  officialMonthsWithZeroArchiveProgress?: string[];
  lcalOfficialMatches?: number;
  lcalParticipations?: number;
};

export function buildDataQualityWarnings(summary: DataQualityWarningCounts) {
  const warnings: string[] = [];
  const teamMembersTotal = summary.teamMembersTotal ?? summary.playersTotal;
  const archiveSyncedTeamMembers = summary.archiveSyncedTeamMembers ?? summary.archiveSyncedPlayers;
  if (teamMembersTotal > 0 && archiveSyncedTeamMembers === 0) warnings.push("No team members have a successful archive sync state yet.");
  if (summary.gamesImported > 0 && summary.participationRows === 0) warnings.push("Games exist but no participation rows are available for contribution calculations.");
  if (summary.contributionRows === 0 && summary.participationRows > 0) warnings.push("Participation rows exist but contribution rows are empty. Run Recalculate.");
  if (summary.unknownMatchesCount > summary.officialMatchesWithParticipations) warnings.push("Unknown matches outnumber official matches with participations; league classification/backfill needs attention.");
  if (summary.officialLeaguesWithMatchesButNoGames?.length) warnings.push(`Official leagues have matches but zero games: ${summary.officialLeaguesWithMatchesButNoGames.join(", ")}.`);
  if (summary.officialMonthsWithZeroArchiveProgress?.length) warnings.push(`Official match months have 0% archive backfill progress: ${summary.officialMonthsWithZeroArchiveProgress.join(", ")}.`);
  if ((summary.lcalOfficialMatches ?? 0) > 0 && (summary.lcalParticipations ?? 0) === 0) warnings.push("LCAL has official matches but zero participations.");
  return warnings;
}
