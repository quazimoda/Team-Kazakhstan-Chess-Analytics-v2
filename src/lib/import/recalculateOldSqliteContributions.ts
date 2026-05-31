export const OLD_SQLITE_AFFECTED_LEAGUE_IDS = [1, 2, 3, 4, 5, 6, 7, 8] as const;

export type RecalculateOldSqliteMode = "dry-run" | "recalculate";

export type RecalculateOldSqliteSummary = {
  mode: RecalculateOldSqliteMode;
  target_league_ids: number[];
  existing_contribution_rows_before: number;
  rows_to_delete: number;
  rows_to_insert: number;
  inserted_rows: number;
  touched_player_count: number;
  touched_match_count: number;
  touched_participation_count: number;
  recalculation_required_after: boolean;
};

export function parseTargetLeagueIds(value: string | undefined, allowedLeagueIds: readonly number[] = OLD_SQLITE_AFFECTED_LEAGUE_IDS) {
  const leagueIds = value == null || value.trim() === "" ? [...allowedLeagueIds] : value.split(",").map((part) => Number(part.trim()));
  const uniqueLeagueIds = [...new Set(leagueIds)].sort((a, b) => a - b);
  if (uniqueLeagueIds.length === 0) throw new Error("target_league_ids must not be empty.");
  const invalidLeagueIds = uniqueLeagueIds.filter((leagueId) => !Number.isInteger(leagueId) || !allowedLeagueIds.includes(leagueId));
  if (invalidLeagueIds.length > 0) throw new Error(`target_league_ids can only contain old SQLite affected league ids ${allowedLeagueIds.join(",")}; invalid: ${invalidLeagueIds.join(",")}.`);
  return uniqueLeagueIds;
}

export function isOldSqliteRecalculationEnabled(value: string | undefined) {
  return value === "true";
}

export function createRecalculateOldSqliteSummary(input: Omit<RecalculateOldSqliteSummary, "mode" | "recalculation_required_after"> & { dryRun: boolean }): RecalculateOldSqliteSummary {
  return {
    mode: input.dryRun ? "dry-run" : "recalculate",
    target_league_ids: input.target_league_ids,
    existing_contribution_rows_before: input.existing_contribution_rows_before,
    rows_to_delete: input.rows_to_delete,
    rows_to_insert: input.rows_to_insert,
    inserted_rows: input.inserted_rows,
    touched_player_count: input.touched_player_count,
    touched_match_count: input.touched_match_count,
    touched_participation_count: input.touched_participation_count,
    recalculation_required_after: input.dryRun,
  };
}
