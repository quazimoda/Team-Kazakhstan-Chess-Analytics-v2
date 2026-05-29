ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "is_team_member" integer DEFAULT 0 NOT NULL;
ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "first_seen_source" text;
CREATE INDEX IF NOT EXISTS "players_team_member_idx" ON "players" ("is_team_member");
