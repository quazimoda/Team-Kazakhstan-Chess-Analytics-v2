export type OfficialMatchMonth = {
  year: number;
  month: number;
  matchCount: number;
};

export type BackfillMonthProgress = {
  year: number;
  month: number;
  officialMatchCount: number;
  teamMembersTotal: number;
  syncedTeamMembers: number;
  failedTeamMembers: number;
  runningTeamMembers: number;
  skippedTeamMembers: number;
  progressPercent: number;
  gamesImportedForMonth: number;
  participationsForMonth: number;
};

export type MatchMonthRow = { year: number | string; month: number | string; matchCount: number | string };
export type StatusCountRow = { status: string; value: number | string };

export function toBackfillNumber(value: number | string | bigint | null | undefined) {
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value);
  return 0;
}

export function buildOfficialMatchMonths(rows: MatchMonthRow[]): OfficialMatchMonth[] {
  return rows
    .map((row) => ({ year: toBackfillNumber(row.year), month: toBackfillNumber(row.month), matchCount: toBackfillNumber(row.matchCount) }))
    .filter((row) => Number.isInteger(row.year) && Number.isInteger(row.month) && row.month >= 1 && row.month <= 12)
    .sort((left, right) => right.year - left.year || right.month - left.month);
}

export function calculateBackfillProgressPercent(syncedTeamMembers: number, teamMembersTotal: number) {
  if (teamMembersTotal <= 0) return 0;
  return Math.min(100, Math.round((syncedTeamMembers / teamMembersTotal) * 1000) / 10);
}

export function buildBackfillMonthProgress(input: {
  year: number;
  month: number;
  officialMatchCount: number;
  teamMembersTotal: number;
  statusCounts: StatusCountRow[];
  gamesImportedForMonth: number;
  participationsForMonth: number;
}): BackfillMonthProgress {
  const counts = new Map(input.statusCounts.map((row) => [row.status, toBackfillNumber(row.value)]));
  const syncedTeamMembers = counts.get("success") ?? 0;
  const failedTeamMembers = counts.get("failed") ?? 0;
  const runningTeamMembers = counts.get("running") ?? 0;
  const skippedTeamMembers = counts.get("skipped") ?? 0;

  return {
    year: input.year,
    month: input.month,
    officialMatchCount: input.officialMatchCount,
    teamMembersTotal: input.teamMembersTotal,
    syncedTeamMembers,
    failedTeamMembers,
    runningTeamMembers,
    skippedTeamMembers,
    progressPercent: calculateBackfillProgressPercent(syncedTeamMembers, input.teamMembersTotal),
    gamesImportedForMonth: input.gamesImportedForMonth,
    participationsForMonth: input.participationsForMonth,
  };
}
