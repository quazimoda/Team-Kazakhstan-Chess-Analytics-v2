CREATE TYPE "public"."game_result" AS ENUM('win', 'draw', 'loss', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."league_status" AS ENUM('draft', 'active', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "public"."match_result" AS ENUM('win', 'draw', 'loss', 'pending');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('scheduled', 'registration', 'active', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."sync_job_status" AS ENUM('queued', 'running', 'success', 'failed');--> statement-breakpoint
CREATE TYPE "public"."sync_job_type" AS ENUM('matches', 'players', 'games', 'leaderboards');--> statement-breakpoint
CREATE TABLE "games" (
	"id" serial PRIMARY KEY NOT NULL,
	"chesscom_game_uuid" varchar(120) NOT NULL,
	"match_id" integer,
	"white_player_id" integer,
	"black_player_id" integer,
	"time_class" varchar(40),
	"rated" integer DEFAULT 1 NOT NULL,
	"pgn" text,
	"result" "game_result" DEFAULT 'unknown' NOT NULL,
	"end_time" timestamp with time zone,
	"raw_game" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "games_chesscom_game_uuid_unique" UNIQUE("chesscom_game_uuid")
);
--> statement-breakpoint
CREATE TABLE "leagues" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(180) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"season" varchar(80),
	"status" "league_status" DEFAULT 'draft' NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leagues_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "match_participations" (
	"match_id" integer NOT NULL,
	"player_id" integer NOT NULL,
	"board_number" integer,
	"score" numeric(5, 2) DEFAULT '0' NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"timeout_losses" integer DEFAULT 0 NOT NULL,
	"upset_wins" integer DEFAULT 0 NOT NULL,
	"avg_opponent_rating" integer,
	"last_played_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_participations_match_id_player_id_pk" PRIMARY KEY("match_id","player_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" serial PRIMARY KEY NOT NULL,
	"chesscom_match_id" integer,
	"league_id" integer,
	"name" varchar(240) NOT NULL,
	"opponent" varchar(180) NOT NULL,
	"status" "match_status" DEFAULT 'scheduled' NOT NULL,
	"result" "match_result" DEFAULT 'pending' NOT NULL,
	"team_score" numeric(6, 2),
	"opponent_score" numeric(6, 2),
	"board_count" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"chesscom_url" text,
	"raw_match" jsonb,
	"is_official" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "matches_chesscom_match_id_unique" UNIQUE("chesscom_match_id")
);
--> statement-breakpoint
CREATE TABLE "player_contributions" (
	"id" serial PRIMARY KEY NOT NULL,
	"player_id" integer NOT NULL,
	"league_id" integer,
	"period" varchar(32) NOT NULL,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"timeout_losses" integer DEFAULT 0 NOT NULL,
	"upset_wins" integer DEFAULT 0 NOT NULL,
	"points" numeric(8, 2) DEFAULT '0' NOT NULL,
	"score" numeric(8, 2) DEFAULT '0' NOT NULL,
	"win_rate" numeric(6, 2) DEFAULT '0' NOT NULL,
	"avg_opponent_rating" integer,
	"last_played_at" timestamp with time zone,
	"contribution_score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "players" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(80) NOT NULL,
	"name" text,
	"title" varchar(16),
	"country" varchar(120),
	"avatar_url" text,
	"chesscom_url" text,
	"current_rating" integer,
	"matches_played" integer DEFAULT 0 NOT NULL,
	"games_played" integer DEFAULT 0 NOT NULL,
	"wins" integer DEFAULT 0 NOT NULL,
	"draws" integer DEFAULT 0 NOT NULL,
	"losses" integer DEFAULT 0 NOT NULL,
	"contribution_score" numeric(10, 2) DEFAULT '0' NOT NULL,
	"last_seen_at" timestamp with time zone,
	"raw_profile" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"type" "sync_job_type" NOT NULL,
	"status" "sync_job_status" DEFAULT 'queued' NOT NULL,
	"message" text,
	"payload" jsonb,
	"records_processed" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_white_player_id_players_id_fk" FOREIGN KEY ("white_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "games" ADD CONSTRAINT "games_black_player_id_players_id_fk" FOREIGN KEY ("black_player_id") REFERENCES "public"."players"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participations" ADD CONSTRAINT "match_participations_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_participations" ADD CONSTRAINT "match_participations_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_contributions" ADD CONSTRAINT "player_contributions_player_id_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "player_contributions" ADD CONSTRAINT "player_contributions_league_id_leagues_id_fk" FOREIGN KEY ("league_id") REFERENCES "public"."leagues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "games_match_idx" ON "games" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "games_end_time_idx" ON "games" USING btree ("end_time");--> statement-breakpoint
CREATE INDEX "leagues_status_idx" ON "leagues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_league_idx" ON "matches" USING btree ("league_id");--> statement-breakpoint
CREATE INDEX "matches_official_idx" ON "matches" USING btree ("is_official");--> statement-breakpoint
CREATE UNIQUE INDEX "player_contributions_player_period_idx" ON "player_contributions" USING btree ("player_id","league_id","period");--> statement-breakpoint
CREATE UNIQUE INDEX "players_username_idx" ON "players" USING btree (lower("username"));--> statement-breakpoint
CREATE INDEX "sync_jobs_type_status_idx" ON "sync_jobs" USING btree ("type","status");--> statement-breakpoint
CREATE INDEX "sync_jobs_created_at_idx" ON "sync_jobs" USING btree ("created_at");
--> statement-breakpoint
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
