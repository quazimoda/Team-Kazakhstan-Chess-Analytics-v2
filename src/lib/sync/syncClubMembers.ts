import { eq, sql } from "drizzle-orm";
import { getClubMembers } from "@/lib/chesscom/client";
import { db } from "@/server/db";
import { players, syncJobs } from "@/server/db/schema";

const defaultClubSlug = "team-kazakhstan";

type MemberRecord = Record<string, unknown>;

export type SyncClubMembersSummary = {
  source: "database" | "demo";
  jobId: string | null;
  status: "success" | "failed";
  clubSlug: string;
  membersFetched: number;
  playersUpserted: number;
  groups: Record<string, number>;
  warnings: string[];
  errors: string[];
};

function asRecord(value: unknown): MemberRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as MemberRecord) : {};
}

function getString(record: MemberRecord, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function chesscomUrlForUsername(username: string) {
  return `https://www.chess.com/member/${encodeURIComponent(username)}`;
}

export function flattenClubMembers(payload: unknown) {
  const record = asRecord(payload);
  const byUsername = new Map<string, { username: string; payload: MemberRecord }>();
  const groups: Record<string, number> = {};

  for (const [group, value] of Object.entries(record)) {
    if (!Array.isArray(value)) continue;
    groups[group] = value.length;
    for (const item of value) {
      const member = asRecord(item);
      const username = getString(member, ["username"]);
      if (!username) continue;
      const key = username.toLowerCase();
      const existing = byUsername.get(key)?.payload ?? {};
      byUsername.set(key, { username, payload: { ...existing, ...member, membershipGroups: [...new Set([...(Array.isArray(existing.membershipGroups) ? existing.membershipGroups.filter((entry): entry is string => typeof entry === "string") : []), group])] } });
    }
  }

  return { members: Array.from(byUsername.values()), groups };
}

async function upsertMember(member: { username: string; payload: MemberRecord }) {
  if (!db) throw new Error("DATABASE_URL is not configured; player sync requires PostgreSQL");
  const values = {
    username: member.username,
    name: getString(member.payload, ["name"]),
    title: getString(member.payload, ["title"]),
    country: getString(member.payload, ["country"]),
    avatarUrl: getString(member.payload, ["avatar", "avatar_url", "avatarUrl"]),
    chesscomUrl: getString(member.payload, ["url", "@id"]) ?? chesscomUrlForUsername(member.username),
    rawProfile: member.payload,
    isTeamMember: 1,
    firstSeenSource: sql`coalesce(${players.firstSeenSource}, ${"club_members"})`,
    lastSeenAt: new Date(),
    updatedAt: new Date(),
  };
  const [existing] = await db.select().from(players).where(sql`lower(${players.username}) = ${member.username.toLowerCase()}`).limit(1);
  if (existing) {
    await db.update(players).set(values).where(eq(players.id, existing.id));
    return existing.id;
  }
  const [row] = await db.insert(players).values({ ...values, firstSeenSource: "club_members" }).returning({ id: players.id });
  return row.id;
}

export async function syncClubMembers(clubSlug = defaultClubSlug): Promise<SyncClubMembersSummary> {
  if (!db) return { source: "demo", jobId: null, status: "failed", clubSlug, membersFetched: 0, playersUpserted: 0, groups: {}, warnings: [], errors: ["DATABASE_URL is not configured; player sync requires PostgreSQL"] };

  let job: typeof syncJobs.$inferSelect | null = null;
  const warnings: string[] = [];
  const errors: string[] = [];
  let playersUpserted = 0;
  let groups: Record<string, number> = {};
  let membersFetched = 0;

  try {
    [job] = await db.insert(syncJobs).values({ type: "players", status: "running", message: `Syncing Chess.com club members for ${clubSlug}`, startedAt: new Date(), recordsProcessed: 0, payload: { clubSlug } }).returning();
    const response = await getClubMembers(clubSlug);
    if (!response.ok) throw new Error(response.error);

    const flattened = flattenClubMembers(response.data);
    groups = flattened.groups;
    membersFetched = flattened.members.length;
    if (membersFetched === 0) warnings.push("Chess.com club members response did not include any recognized member arrays.");

    for (const member of flattened.members) {
      await upsertMember(member);
      playersUpserted += 1;
    }

    await db.update(syncJobs).set({ status: "success", message: `Synced ${playersUpserted} club members`, finishedAt: new Date(), recordsProcessed: membersFetched, payload: { clubSlug, groups, warnings } }).where(eq(syncJobs.id, job.id));
    return { source: "database", jobId: String(job.id), status: "success", clubSlug, membersFetched, playersUpserted, groups, warnings, errors };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown club member sync error";
    errors.push(message);
    if (job) {
      try {
        await db.update(syncJobs).set({ status: "failed", message: "Chess.com club member sync failed", finishedAt: new Date(), recordsProcessed: membersFetched, errorMessage: message }).where(eq(syncJobs.id, job.id));
      } catch {
        // Keep write endpoints JSON-safe by returning the original error below.
      }
    }
    return { source: "database", jobId: job ? String(job.id) : null, status: "failed", clubSlug, membersFetched, playersUpserted, groups, warnings, errors };
  }
}
