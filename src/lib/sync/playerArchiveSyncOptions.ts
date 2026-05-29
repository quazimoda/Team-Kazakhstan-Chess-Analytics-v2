export type SyncPlayerArchivesMode = "next" | "retry-failed" | "specific";

export type PlayerArchiveSyncOptionsInput = {
  usernames?: string[];
  limitPlayers?: number;
  mode?: SyncPlayerArchivesMode;
  skipAlreadySynced?: boolean;
};

export function normalizeArchiveSyncOptions<T extends PlayerArchiveSyncOptionsInput>(options: T = {} as T) {
  const mode: SyncPlayerArchivesMode = options.mode ?? (options.usernames?.length ? "specific" : "next");
  const limitPlayers = Math.min(Math.max(options.limitPlayers ?? 10, 1), 25);
  return { ...options, mode, limitPlayers, skipAlreadySynced: options.skipAlreadySynced ?? true };
}
