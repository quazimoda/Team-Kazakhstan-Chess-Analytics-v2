export type SuspiciousCountableRow = {
  check_type: string;
  occurrence_count: number;
};

export type GameKeySourceRow = {
  game_id: number;
  chesscom_game_uuid: string | null;
  raw_url: string | null;
  raw_game_url: string | null;
  raw_link: string | null;
};

export type NormalizedDuplicateGameKeyRow = {
  check_type: "normalized_duplicate_game_key";
  row_id: string;
  normalized_key: string;
  occurrence_count: number;
  league_id: null;
  match_id: null;
  player_id: null;
  chesscom_game_uuid: string | null;
  detail: string;
};

const keyFieldLabels = [
  ["chesscom_game_uuid", "chesscom_game_uuid"],
  ["raw_url", "raw_game.url"],
  ["raw_game_url", "raw_game.game_url"],
  ["raw_link", "raw_game.link"],
] as const;

export function csvEscape(value: unknown) {
  if (value == null) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  if (!/[",\n\r]/.test(text)) return text;
  return `"${text.replaceAll('"', '""')}"`;
}

export function formatCsv<T extends Record<string, unknown>>(rows: T[], columns: (keyof T)[]) {
  const lines = [`${columns.join(",")}`];
  for (const row of rows) lines.push(columns.map((column) => csvEscape(row[column])).join(","));
  return `${lines.join("\n")}\n`;
}

export function summarizeSuspiciousRows(rows: SuspiciousCountableRow[]) {
  return rows.reduce<Record<string, number>>((counts, row) => {
    counts[row.check_type] = (counts[row.check_type] ?? 0) + row.occurrence_count;
    return counts;
  }, {});
}

export function buildNormalizedDuplicateGameKeyRows(rows: GameKeySourceRow[], normalizeGameKeys: (...values: (string | null | undefined)[]) => string[]) {
  const gamesByKey = new Map<string, Map<number, { uuid: string | null; fields: Set<string> }>>();

  for (const row of rows) {
    for (const [fieldName, fieldLabel] of keyFieldLabels) {
      const value = row[fieldName]?.trim();
      if (!value) continue;
      for (const key of normalizeGameKeys(value)) {
        if (!/^\d+$/.test(key)) continue;
        const games = gamesByKey.get(key) ?? new Map<number, { uuid: string | null; fields: Set<string> }>();
        const game = games.get(row.game_id) ?? { uuid: row.chesscom_game_uuid, fields: new Set<string>() };
        game.fields.add(fieldLabel);
        games.set(row.game_id, game);
        gamesByKey.set(key, games);
      }
    }
  }

  return [...gamesByKey.entries()]
    .filter(([, games]) => games.size > 1)
    .map(([key, games]): NormalizedDuplicateGameKeyRow => {
      const samples = [...games.entries()]
        .sort(([leftId], [rightId]) => leftId - rightId)
        .slice(0, 10);
      const sampleGameIds = samples.map(([gameId]) => String(gameId)).join("|");
      const sampleUuids = samples.map(([, game]) => game.uuid).filter((uuid): uuid is string => Boolean(uuid)).join("|");
      const fieldDetails = samples
        .map(([gameId, game]) => `${gameId}:${[...game.fields].sort().join("+")}`)
        .join("|");

      return {
        check_type: "normalized_duplicate_game_key",
        row_id: key,
        normalized_key: key,
        occurrence_count: games.size,
        league_id: null,
        match_id: null,
        player_id: null,
        chesscom_game_uuid: sampleUuids || null,
        detail: `normalized duplicate game key; sample_game_ids=${sampleGameIds}; sample_chesscom_game_uuid=${sampleUuids || "none"}; fields=${fieldDetails}`,
      };
    })
    .sort((left, right) => left.normalized_key.localeCompare(right.normalized_key));
}
