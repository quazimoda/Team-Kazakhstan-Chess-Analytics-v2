CREATE INDEX IF NOT EXISTS "matches_league_id_idx" ON "matches" ("league_id");
CREATE INDEX IF NOT EXISTS "matches_league_official_idx" ON "matches" ("league_id", "is_official");
CREATE INDEX IF NOT EXISTS "games_match_id_idx" ON "games" ("match_id");
CREATE INDEX IF NOT EXISTS "match_participations_match_id_idx" ON "match_participations" ("match_id");
CREATE INDEX IF NOT EXISTS "player_contributions_league_id_idx" ON "player_contributions" ("league_id");
