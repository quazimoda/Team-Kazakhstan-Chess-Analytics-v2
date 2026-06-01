import { toDateOrNull } from "./dates";

export function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function formatDateTime(value: unknown) {
  const date = toDateOrNull(value);
  if (!date) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat("en").format(value ?? 0);
}

function isUrl(value: string | null | undefined) {
  return Boolean(value && /^https?:\/\//i.test(value));
}

function cleanApiUrl(value: string) {
  return value
    .replace(/^https?:\/\/api\.chess\.com\/pub\//i, "https://www.chess.com/")
    .replace(/\/pub\//i, "/");
}

export function publicChesscomUrl(value: string | null | undefined) {
  if (!value || !isUrl(value)) return null;
  const cleaned = cleanApiUrl(value);
  return cleaned
    .replace(/\/match\/live\//i, "/club/matches/live/")
    .replace(/\/match\//i, "/club/matches/");
}

export function readableOpponentName(
  opponent: string | null | undefined,
  matchName?: string | null,
) {
  const candidate = opponent?.trim();
  if (candidate && !isUrl(candidate)) return candidate;

  const name = matchName?.trim();
  if (name) {
    const parts = name
      .split(/\s+(?:vs\.?|versus|-|–|—)\s+/i)
      .map((part) => part.trim())
      .filter(Boolean);
    const opponentPart = parts.find((part) => !/kazakhstan/i.test(part));
    if (opponentPart) return opponentPart;
  }

  return "Unknown opponent";
}
