ALTER TABLE "players" ADD COLUMN IF NOT EXISTS "matches_played" integer NOT NULL DEFAULT 0;

ALTER TABLE "matches" ADD COLUMN IF NOT EXISTS "is_official" integer NOT NULL DEFAULT 0;
UPDATE "matches"
SET "is_official" = 1
WHERE "league_id" IS NOT NULL
  AND COALESCE("is_official", 0) = 0
  AND EXISTS (
    SELECT 1 FROM "leagues"
    WHERE "leagues"."id" = "matches"."league_id"
      AND "leagues"."slug" <> 'unknown'
  );
CREATE INDEX IF NOT EXISTS "matches_official_idx" ON "matches" ("is_official");

ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "wins" integer NOT NULL DEFAULT 0;
ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "draws" integer NOT NULL DEFAULT 0;
ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "losses" integer NOT NULL DEFAULT 0;
ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "timeout_losses" integer NOT NULL DEFAULT 0;
ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "upset_wins" integer NOT NULL DEFAULT 0;
ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "avg_opponent_rating" integer;
ALTER TABLE "match_participations" ADD COLUMN IF NOT EXISTS "last_played_at" timestamp with time zone;

ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "matches_played" integer NOT NULL DEFAULT 0;
ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "timeout_losses" integer NOT NULL DEFAULT 0;
ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "upset_wins" integer NOT NULL DEFAULT 0;
ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "points" numeric(8, 2) NOT NULL DEFAULT '0';
ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "win_rate" numeric(6, 2) NOT NULL DEFAULT '0';
ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "avg_opponent_rating" integer;
ALTER TABLE "player_contributions" ADD COLUMN IF NOT EXISTS "last_played_at" timestamp with time zone;

UPDATE "player_contributions"
SET "matches_played" = "games_played"
WHERE "matches_played" = 0;

UPDATE "player_contributions"
SET "points" = "score"
WHERE "points" = 0 AND "score" <> 0;
