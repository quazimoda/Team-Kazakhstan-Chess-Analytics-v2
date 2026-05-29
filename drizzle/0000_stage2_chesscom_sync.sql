ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "records_processed" integer NOT NULL DEFAULT 0;
ALTER TABLE "sync_jobs" ADD COLUMN IF NOT EXISTS "error_message" text;

INSERT INTO "leagues" ("name", "slug", "status", "updated_at") VALUES
  ('World League', 'world-league', 'active', now()),
  ('World League 960', 'world-league-960', 'active', now()),
  ('Asian League', 'asian-league', 'active', now()),
  ('Asian League 960', 'asian-league-960', 'active', now()),
  ('European League', 'european-league', 'active', now()),
  ('Live Chess World League', 'lcwl', 'active', now()),
  ('Live Chess Asian League', 'lcal', 'active', now()),
  ('Live Chess European League', 'lcel', 'active', now()),
  ('Unknown', 'unknown', 'active', now())
ON CONFLICT ("slug") DO UPDATE SET
  "name" = excluded."name",
  "status" = excluded."status",
  "updated_at" = now();
