import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";

export const matchStatusEnum = pgEnum("match_status", ["scheduled", "registration", "active", "completed", "cancelled"]);
export const matchResultEnum = pgEnum("match_result", ["win", "draw", "loss", "pending"]);
export const leagueStatusEnum = pgEnum("league_status", ["draft", "active", "completed", "archived"]);
export const syncJobTypeEnum = pgEnum("sync_job_type", ["matches", "players", "games", "leaderboards"]);
export const syncJobStatusEnum = pgEnum("sync_job_status", ["queued", "running", "success", "failed"]);
export const gameResultEnum = pgEnum("game_result", ["win", "draw", "loss", "unknown"]);

export const players = pgTable(
  "players",
  {
    id: serial("id").primaryKey(),
    username: varchar("username", { length: 80 }).notNull(),
    name: text("name"),
    title: varchar("title", { length: 16 }),
    country: varchar("country", { length: 120 }),
    avatarUrl: text("avatar_url"),
    chesscomUrl: text("chesscom_url"),
    currentRating: integer("current_rating"),
    matchesPlayed: integer("matches_played").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    contributionScore: numeric("contribution_score", { precision: 10, scale: 2 }).notNull().default("0"),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    rawProfile: jsonb("raw_profile"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ usernameIdx: uniqueIndex("players_username_idx").on(sql`lower(${table.username})`) }),
);

export const leagues = pgTable(
  "leagues",
  {
    id: serial("id").primaryKey(),
    name: varchar("name", { length: 180 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull().unique(),
    season: varchar("season", { length: 80 }),
    status: leagueStatusEnum("status").notNull().default("draft"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ statusIdx: index("leagues_status_idx").on(table.status) }),
);

export const matches = pgTable(
  "matches",
  {
    id: serial("id").primaryKey(),
    chesscomMatchId: integer("chesscom_match_id").unique(),
    leagueId: integer("league_id").references(() => leagues.id, { onDelete: "set null" }),
    name: varchar("name", { length: 240 }).notNull(),
    opponent: varchar("opponent", { length: 180 }).notNull(),
    status: matchStatusEnum("status").notNull().default("scheduled"),
    result: matchResultEnum("result").notNull().default("pending"),
    teamScore: numeric("team_score", { precision: 6, scale: 2 }),
    opponentScore: numeric("opponent_score", { precision: 6, scale: 2 }),
    boardCount: integer("board_count"),
    startsAt: timestamp("starts_at", { withTimezone: true }),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    chesscomUrl: text("chesscom_url"),
    rawMatch: jsonb("raw_match"),
    isOfficial: integer("is_official").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ statusIdx: index("matches_status_idx").on(table.status), leagueIdx: index("matches_league_idx").on(table.leagueId), officialIdx: index("matches_official_idx").on(table.isOfficial) }),
);

export const games = pgTable(
  "games",
  {
    id: serial("id").primaryKey(),
    chesscomGameUuid: varchar("chesscom_game_uuid", { length: 120 }).notNull().unique(),
    matchId: integer("match_id").references(() => matches.id, { onDelete: "cascade" }),
    whitePlayerId: integer("white_player_id").references(() => players.id, { onDelete: "set null" }),
    blackPlayerId: integer("black_player_id").references(() => players.id, { onDelete: "set null" }),
    timeClass: varchar("time_class", { length: 40 }),
    rated: integer("rated").notNull().default(1),
    pgn: text("pgn"),
    result: gameResultEnum("result").notNull().default("unknown"),
    endTime: timestamp("end_time", { withTimezone: true }),
    rawGame: jsonb("raw_game"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ matchIdx: index("games_match_idx").on(table.matchId), endTimeIdx: index("games_end_time_idx").on(table.endTime) }),
);

export const matchParticipations = pgTable(
  "match_participations",
  {
    matchId: integer("match_id").notNull().references(() => matches.id, { onDelete: "cascade" }),
    playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    boardNumber: integer("board_number"),
    score: numeric("score", { precision: 5, scale: 2 }).notNull().default("0"),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    timeoutLosses: integer("timeout_losses").notNull().default(0),
    upsetWins: integer("upset_wins").notNull().default(0),
    avgOpponentRating: integer("avg_opponent_rating"),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ pk: primaryKey({ columns: [table.matchId, table.playerId] }) }),
);

export const playerContributions = pgTable(
  "player_contributions",
  {
    id: serial("id").primaryKey(),
    playerId: integer("player_id").notNull().references(() => players.id, { onDelete: "cascade" }),
    leagueId: integer("league_id").references(() => leagues.id, { onDelete: "cascade" }),
    period: varchar("period", { length: 32 }).notNull(),
    matchesPlayed: integer("matches_played").notNull().default(0),
    gamesPlayed: integer("games_played").notNull().default(0),
    wins: integer("wins").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    timeoutLosses: integer("timeout_losses").notNull().default(0),
    upsetWins: integer("upset_wins").notNull().default(0),
    points: numeric("points", { precision: 8, scale: 2 }).notNull().default("0"),
    score: numeric("score", { precision: 8, scale: 2 }).notNull().default("0"),
    winRate: numeric("win_rate", { precision: 6, scale: 2 }).notNull().default("0"),
    avgOpponentRating: integer("avg_opponent_rating"),
    lastPlayedAt: timestamp("last_played_at", { withTimezone: true }),
    contributionScore: numeric("contribution_score", { precision: 10, scale: 2 }).notNull().default("0"),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ playerPeriodIdx: uniqueIndex("player_contributions_player_period_idx").on(table.playerId, table.leagueId, table.period) }),
);

export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: serial("id").primaryKey(),
    type: syncJobTypeEnum("type").notNull(),
    status: syncJobStatusEnum("status").notNull().default("queued"),
    message: text("message"),
    payload: jsonb("payload"),
    recordsProcessed: integer("records_processed").notNull().default(0),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ typeStatusIdx: index("sync_jobs_type_status_idx").on(table.type, table.status), createdAtIdx: index("sync_jobs_created_at_idx").on(table.createdAt) }),
);

export const playersRelations = relations(players, ({ many }) => ({ participations: many(matchParticipations), contributions: many(playerContributions) }));
export const leaguesRelations = relations(leagues, ({ many }) => ({ matches: many(matches), contributions: many(playerContributions) }));
export const matchesRelations = relations(matches, ({ one, many }) => ({ league: one(leagues, { fields: [matches.leagueId], references: [leagues.id] }), games: many(games), participations: many(matchParticipations) }));
