CREATE TYPE "public"."archive_sync_status" AS ENUM('running', 'success', 'failed', 'skipped');--> statement-breakpoint
CREATE TABLE "player_archive_sync_state" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" varchar(80) NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"status" "archive_sync_status" DEFAULT 'running' NOT NULL,
	"games_scanned" integer DEFAULT 0 NOT NULL,
	"games_matched" integer DEFAULT 0 NOT NULL,
	"games_upserted" integer DEFAULT 0 NOT NULL,
	"participations_upserted" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "player_archive_sync_state_username_month_idx" ON "player_archive_sync_state" USING btree ("username","year","month");--> statement-breakpoint
CREATE INDEX "player_archive_sync_state_status_idx" ON "player_archive_sync_state" USING btree ("status");
