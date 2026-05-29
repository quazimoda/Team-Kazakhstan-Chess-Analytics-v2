export type LeagueSlug =
  | "world-league"
  | "world-league-960"
  | "asian-league"
  | "asian-league-960"
  | "european-league"
  | "lcwl"
  | "lcal"
  | "lcel"
  | "friendly"
  | "unknown";

export type LeagueClassification = {
  leagueSlug: LeagueSlug;
  confidence: number;
  isOfficialCandidate: boolean;
  reasons: string[];
};

export const officialLeagueSlugs = new Set<LeagueSlug>([
  "world-league",
  "world-league-960",
  "asian-league",
  "asian-league-960",
  "european-league",
  "lcwl",
  "lcal",
  "lcel",
]);

const unknownClassification: LeagueClassification = {
  leagueSlug: "unknown",
  confidence: 0,
  isOfficialCandidate: false,
  reasons: ["No known league marker found in match name"],
};

function official(leagueSlug: LeagueSlug, confidence: number, reasons: string[]): LeagueClassification {
  return { leagueSlug, confidence, isOfficialCandidate: true, reasons };
}

function nonOfficial(leagueSlug: LeagueSlug, confidence: number, reasons: string[]): LeagueClassification {
  return { leagueSlug, confidence, isOfficialCandidate: false, reasons };
}

export function isOfficialLeagueSlug(leagueSlug: LeagueSlug) {
  return officialLeagueSlugs.has(leagueSlug);
}

export function classifyLeague(matchName: string): LeagueClassification {
  const reasons: string[] = [];
  const name = matchName.trim();

  if (!name) return unknownClassification;

  const has960 = /(?:chess\s*960|\b960\b)/i.test(name);
  if (has960) reasons.push("Match name contains a Chess960 marker");

  if (/Friendly/i.test(name) || /Frendly/i.test(name) || /\bU-1[6-9]00\b/i.test(name) || /friendly\s+(?:3\|2|5\|2)/i.test(name)) {
    return nonOfficial("friendly", 0.96, [...reasons, "Matched friendly/non-league marker"]);
  }

  if (/\bLCEL(?:\b|20\d{2})/i.test(name) || /Live Chess European League/i.test(name)) {
    return official("lcel", 0.98, [...reasons, "Matched Live Chess European League marker"]);
  }

  if (/\bLCWL(?:\b|20\d{2})/i.test(name) || /\bLWCL(?:\b|20\d{2})/i.test(name) || /Live Chess World League/i.test(name)) {
    return official("lcwl", 0.98, [...reasons, "Matched Live Chess World League marker"]);
  }

  if (/\bLCAL(?:\b|20\d{2})/i.test(name) || /Live Chess Asian League/i.test(name)) {
    return official("lcal", 0.98, [...reasons, "Matched Live Chess Asian League marker"]);
  }

  const hasWorldLeague = /\bWL\s*20\d{2}\b/i.test(name) || /\bWL20\d{2}\b/i.test(name) || /World League/i.test(name);
  if (hasWorldLeague) {
    if (has960) return official("world-league-960", 0.98, [...reasons, "Matched World League with Chess960 marker"]);
    return official("world-league", 0.96, [...reasons, "Matched World League marker"]);
  }

  const hasAsianLeague = /\bAL\s*20\d{2}\b/i.test(name) || /\bAL20\d{2}\b/i.test(name) || /Asian League/i.test(name);
  if (hasAsianLeague) {
    if (has960) return official("asian-league-960", 0.98, [...reasons, "Matched Asian League with Chess960 marker"]);
    return official("asian-league", 0.96, [...reasons, "Matched Asian League marker"]);
  }

  if (/\bEL\s*20\d{2}\b/i.test(name) || /\bEL20\d{2}\b/i.test(name) || /European League/i.test(name)) {
    return official("european-league", 0.96, [...reasons, "Matched European League marker"]);
  }

  return { ...unknownClassification };
}
