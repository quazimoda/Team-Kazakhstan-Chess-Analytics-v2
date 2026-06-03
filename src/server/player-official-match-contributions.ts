import { normalizeProfileUsername } from "../lib/player-profile";

export type PlayerOfficialMatchContributionLookup =
  | { type: "id"; playerId: number }
  | { type: "username"; normalizedUsername: string };

export function resolvePlayerOfficialMatchContributionLookup(
  usernameOrPlayerId: string | number,
): PlayerOfficialMatchContributionLookup | null {
  if (typeof usernameOrPlayerId === "number") {
    return Number.isFinite(usernameOrPlayerId)
      ? { type: "id", playerId: usernameOrPlayerId }
      : null;
  }

  const normalizedUsername = normalizeProfileUsername(usernameOrPlayerId);
  return normalizedUsername
    ? { type: "username", normalizedUsername }
    : null;
}
