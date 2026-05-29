export type LeagueSlug =
  | "world-league"
  | "world-league-960"
  | "asian-league"
  | "asian-league-960"
  | "european-league"
  | "lcwl"
  | "lcal"
  | "lcel"
  | "unknown";

export type LeagueClassification = {
  leagueSlug: LeagueSlug;
  confidence: number;
  isOfficialCandidate: boolean;
  reasons: string[];
};

const unknownClassification: LeagueClassification = {
  leagueSlug: "unknown",
  confidence: 0,
  isOfficialCandidate: false,
  reasons: ["No known league marker found in match name"],
};

function normalizeName(matchName: string) {
  return matchName
    .toLowerCase()
    .replace(/chess\.com/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function hasPhrase(normalizedName: string, phrase: string) {
  return normalizedName.includes(normalizeName(phrase));
}

function official(leagueSlug: Exclude<LeagueSlug, "unknown">, confidence: number, reasons: string[]): LeagueClassification {
  return { leagueSlug, confidence, isOfficialCandidate: true, reasons };
}

export function classifyLeague(matchName: string): LeagueClassification {
  const normalizedName = normalizeName(matchName);
  const reasons: string[] = [];

  if (!normalizedName) return unknownClassification;

  const has960 = /(?:^|\s)(?:960|chess960|fischer random|fischerandom)(?:\s|$)/.test(normalizedName);
  if (has960) reasons.push("Match name contains a Chess960 marker");

  if (hasPhrase(normalizedName, "live chess asian league") || /(?:^|\s)lcal(?:\s|$)/.test(normalizedName)) {
    return official("lcal", 0.98, [...reasons, "Matched Live Chess Asian League marker"]);
  }

  if (hasPhrase(normalizedName, "live chess european league") || /(?:^|\s)lcel(?:\s|$)/.test(normalizedName)) {
    return official("lcel", 0.98, [...reasons, "Matched Live Chess European League marker"]);
  }

  if (hasPhrase(normalizedName, "live chess world league") || /(?:^|\s)lcwl(?:\s|$)/.test(normalizedName)) {
    return official("lcwl", 0.98, [...reasons, "Matched Live Chess World League marker"]);
  }

  if (hasPhrase(normalizedName, "world league")) {
    if (has960) return official("world-league-960", 0.96, [...reasons, "Matched World League with Chess960 marker"]);
    return official("world-league", 0.94, [...reasons, "Matched World League marker"]);
  }

  if (hasPhrase(normalizedName, "asian league")) {
    if (has960) return official("asian-league-960", 0.96, [...reasons, "Matched Asian League with Chess960 marker"]);
    return official("asian-league", 0.94, [...reasons, "Matched Asian League marker"]);
  }

  if (hasPhrase(normalizedName, "european league")) {
    return official("european-league", has960 ? 0.78 : 0.94, [
      ...reasons,
      has960 ? "Matched European League marker with currently untracked Chess960 variant" : "Matched European League marker",
    ]);
  }

  return { ...unknownClassification };
}
