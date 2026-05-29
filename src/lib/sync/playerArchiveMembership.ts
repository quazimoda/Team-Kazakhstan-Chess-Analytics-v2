export function archivePlayerFirstSeenSource(profileUsername: string, syncedUsername: string) {
  return profileUsername.toLowerCase() === syncedUsername.toLowerCase() ? "archive_game" : "opponent";
}
