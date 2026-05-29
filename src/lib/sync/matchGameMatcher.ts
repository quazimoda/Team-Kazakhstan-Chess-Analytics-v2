type ImportedMatch = {
  id: number;
  chesscomMatchId: number | null;
  name: string | null;
  chesscomUrl: string | null;
  rawMatch: unknown;
};

type ChessComGameLike = {
  url?: string | null;
  pgn?: string | null;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function getString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function extractChesscomMatchIdsFromText(text: string | null | undefined): number[] {
  if (!text) return [];
  const ids = new Set<number>();
  const patterns = [
    /(?:api\.chess\.com\/pub)?\/match\/live\/(\d+)/gi,
    /(?:api\.chess\.com\/pub)?\/match\/(\d+)/gi,
    /(?:chess\.com\/)?club\/matches?\/(?:live\/)?(\d+)/gi,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const id = Number(match[1]);
      if (Number.isSafeInteger(id)) ids.add(id);
    }
  }

  return Array.from(ids);
}

function importedMatchIds(match: ImportedMatch) {
  const ids = new Set<number>();
  if (match.chesscomMatchId != null) ids.add(match.chesscomMatchId);
  for (const text of [match.chesscomUrl, getString(asRecord(match.rawMatch), ["@id", "url", "chesscom_url"])]) {
    for (const id of extractChesscomMatchIdsFromText(text)) ids.add(id);
  }
  return ids;
}

export function gameBelongsToMatch(game: ChessComGameLike, match: ImportedMatch): boolean {
  const url = game.url ?? "";
  const pgn = game.pgn ?? "";
  const combined = `${url}\n${pgn}`;
  const detectedIds = new Set(extractChesscomMatchIdsFromText(combined));

  for (const id of importedMatchIds(match)) {
    if (detectedIds.has(id)) return true;
    if (combined.includes(String(id))) return true;
  }

  const rawMatch = asRecord(match.rawMatch);
  const rawId = getString(rawMatch, ["@id", "url"]);
  if (rawId && combined.toLowerCase().includes(rawId.toLowerCase())) return true;

  const name = match.name?.trim() || getString(rawMatch, ["name"]);
  return Boolean(name && combined.toLowerCase().includes(name.toLowerCase()));
}

export function findMatchingImportedMatch<T extends ImportedMatch>(game: ChessComGameLike, importedMatches: T[]): T | null {
  return importedMatches.find((match) => gameBelongsToMatch(game, match)) ?? null;
}
