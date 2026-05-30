"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SyncSummary = {
  status: "success" | "failed";
  recordsProcessed: number;
  errorMessage: string | null;
  buckets: Record<string, number>;
};

type MatchDetailsSummary = {
  status: "success" | "failed";
  matchesProcessed: number;
  playersUpserted: number;
  gamesUpserted: number;
  participationsUpserted: number;
  warnings: string[];
  errors: string[];
};

type SyncPlayersSummary = {
  status: "success" | "failed";
  membersFetched: number;
  playersUpserted: number;
  warnings: string[];
  errors: string[];
};

type PlayerArchivesSummary = {
  playersProcessed: number;
  archivesFetched: number;
  gamesScanned: number;
  gamesMatched: number;
  gamesUpserted: number;
  participationsUpserted: number;
  warnings: string[];
  errors: string[];
};

type RecalculateSummary = {
  source: "database" | "demo";
  period: "all";
  leagueId: number | null;
  rowsWritten: number;
};

type ReclassifySummary = {
  processed: number;
  updated: number;
  countsByLeague: Record<string, number>;
};

type DataQualitySummary = {
  source: "database" | "demo";
  playersTotal: number;
  teamMembersTotal: number;
  opponentPlayersTotal: number;
  archiveSyncedPlayers: number;
  archiveSyncedTeamMembers: number;
  archiveBackfillProgressPercent: number;
  teamMembersWithParticipations: number;
  gamesImported: number;
  participationRows: number;
  contributionRows: number;
  officialMatchesWithParticipations: number;
  unknownMatchesCount: number;
  officialLeaguesWithMatchesButNoGames: string[];
  officialMonthsWithZeroArchiveProgress: string[];
  lcalOfficialMatches: number;
  lcalParticipations: number;
  warnings: string[];
};

type BackfillMonthProgress = {
  year: number;
  month: number;
  officialMatchCount: number;
  teamMembersTotal: number;
  syncedTeamMembers: number;
  failedTeamMembers: number;
  runningTeamMembers: number;
  skippedTeamMembers: number;
  progressPercent: number;
  gamesImportedForMonth: number;
  participationsForMonth: number;
};

type BackfillMonthsResponse = { data: BackfillMonthProgress[] };

type UnknownMatchReview = {
  data: Array<{
    id: number;
    chesscomMatchId: number | null;
    name: string;
    status: string;
    chesscomUrl: string | null;
    suggestedClassification: { leagueSlug: string; confidence: number; isOfficialCandidate: boolean; reasons: string[] };
  }>;
  limit: number;
};

type ActionState = {
  isRunning: boolean;
  message: string | null;
  error: string | null;
};

function getPayloadError(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;

  const error = "error" in payload ? payload.error : null;
  if (typeof error === "string" && error.trim()) return error;

  const errorMessage = "errorMessage" in payload ? payload.errorMessage : null;
  if (typeof errorMessage === "string" && errorMessage.trim()) return errorMessage;

  const errors = "errors" in payload ? payload.errors : null;
  if (Array.isArray(errors) && errors.length > 0) return errors.join("; ");

  return null;
}

async function requestAdminAction<T>(endpoint: string, secret: string, method: "GET" | "POST"): Promise<T> {
  const response = await fetch(endpoint, {
    method,
    headers: { "x-admin-secret": secret },
  });

  const text = await response.text();
  const contentType = response.headers.get("content-type") ?? "";
  const isJson = contentType.toLowerCase().includes("application/json");
  let payload: unknown = null;

  if (text.trim() && isJson) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const payloadError = getPayloadError(payload);
    const textError = text.trim().slice(0, 300);
    throw new Error(payloadError ?? (textError || `Request failed with status ${response.status}`));
  }

  if (!text.trim()) {
    throw new Error("Empty response from admin endpoint");
  }

  if (!isJson || payload == null) {
    throw new Error("Invalid JSON response from admin endpoint");
  }

  return payload as T;
}

async function postAdminAction<T>(endpoint: string, secret: string): Promise<T> {
  return requestAdminAction<T>(endpoint, secret, "POST");
}

async function getAdminAction<T>(endpoint: string, secret: string): Promise<T> {
  return requestAdminAction<T>(endpoint, secret, "GET");
}

function formatNumber(value: number | string) {
  return typeof value === "string" ? value : new Intl.NumberFormat().format(value);
}

function formatMonth(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function archiveSummaryMessage(prefix: string, summary: PlayerArchivesSummary) {
  const problems = [...summary.warnings, ...summary.errors];
  return `${prefix}: ${summary.playersProcessed} players processed, ${summary.gamesScanned} games scanned, ${summary.gamesMatched} games matched, ${summary.gamesUpserted} games upserted, ${summary.participationsUpserted} participations upserted.${problems.length ? ` Warnings/errors: ${problems.slice(0, 5).join("; ")}` : ""}`;
}

function DataQualityCards({ data }: { data: DataQualitySummary | null }) {
  const cards = [
    ["Team members", data?.teamMembersTotal],
    ["Archive synced team members", data?.archiveSyncedTeamMembers],
    ["Opponent players", data?.opponentPlayersTotal],
    ["Games imported", data?.gamesImported],
    ["Participation rows", data?.participationRows],
    ["Contribution rows", data?.contributionRows],
    ["Team members with participations", data?.teamMembersWithParticipations],
    ["Official matches with participations", data?.officialMatchesWithParticipations],
    ["LCAL participations", data?.lcalParticipations],
    ["Unknown matches", data?.unknownMatchesCount],
    ["Archive backfill progress", data?.archiveBackfillProgressPercent == null ? undefined : `${data.archiveBackfillProgressPercent}%`],
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {cards.map(([label, value]) => (
        <div key={label} className="rounded-2xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-white">{value == null ? "—" : formatNumber(value)}</p>
        </div>
      ))}
    </div>
  );
}

export function SyncMatchesButton() {
  const [sync, setSync] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [details, setDetails] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [players, setPlayers] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [archives, setArchives] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [recalculate, setRecalculate] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [reclassify, setReclassify] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [dataQuality, setDataQuality] = useState<DataQualitySummary | null>(null);
  const [backfillMonths, setBackfillMonths] = useState<BackfillMonthProgress[]>([]);
  const [unknownMatches, setUnknownMatches] = useState<UnknownMatchReview["data"]>([]);
  const [quality, setQuality] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const isBusy = sync.isRunning || details.isRunning || players.isRunning || archives.isRunning || recalculate.isRunning || reclassify.isRunning || quality.isRunning;

  useEffect(() => {
    const savedSecret = window.sessionStorage.getItem("adminSecret");
    if (!savedSecret) return;
    getAdminAction<DataQualitySummary>("/api/admin/data-quality", savedSecret)
      .then(setDataQuality)
      .catch(() => undefined);
    getAdminAction<UnknownMatchReview>("/api/admin/unknown-matches?limit=25", savedSecret)
      .then((payload) => setUnknownMatches(payload.data))
      .catch(() => undefined);
    getAdminAction<BackfillMonthsResponse>("/api/admin/backfill/months", savedSecret)
      .then((payload) => setBackfillMonths(payload.data))
      .catch(() => undefined);
  }, []);

  async function runAction<T>(endpoint: string, onSuccess: (payload: T) => string, setState: (state: ActionState) => void, afterSuccess?: (secret: string) => Promise<void>) {
    setState({ isRunning: true, message: null, error: null });

    const secret = window.prompt("ADMIN_SECRET", window.sessionStorage.getItem("adminSecret") ?? "");
    if (secret == null) {
      setState({ isRunning: false, message: null, error: null });
      return;
    }

    try {
      window.sessionStorage.setItem("adminSecret", secret);
      const payload = await postAdminAction<T>(endpoint, secret);
      if (afterSuccess) await afterSuccess(secret);
      setState({ isRunning: false, message: onSuccess(payload), error: null });
    } catch (actionError) {
      setState({ isRunning: false, message: null, error: actionError instanceof Error ? actionError.message : "Admin action failed" });
    }
  }

  async function refreshBackfillMonths(secret: string) {
    const payload = await getAdminAction<BackfillMonthsResponse>("/api/admin/backfill/months", secret);
    setBackfillMonths(payload.data);
  }

  async function syncBackfillMonth(month: BackfillMonthProgress, mode: "next" | "retry-failed") {
    const label = formatMonth(month.year, month.month);
    await runAction<PlayerArchivesSummary>(`/api/admin/sync/player-archives?mode=${mode}&limitPlayers=25&year=${month.year}&month=${month.month}`, (summary) => archiveSummaryMessage(`${mode === "retry-failed" ? "Retry failed" : "Player archives"} ${label}`, summary), setArchives, refreshBackfillMonths);
  }

  async function syncNextIncompleteMonth() {
    const month = backfillMonths.find((item) => item.progressPercent < 100);
    if (!month) {
      setArchives({ isRunning: false, message: "All official match months are fully synced.", error: null });
      return;
    }
    await syncBackfillMonth(month, "next");
  }

  async function refreshDataQuality() {
    setQuality({ isRunning: true, message: null, error: null });
    const secret = window.prompt("ADMIN_SECRET", window.sessionStorage.getItem("adminSecret") ?? "");
    if (secret == null) {
      setQuality({ isRunning: false, message: null, error: null });
      return;
    }
    try {
      window.sessionStorage.setItem("adminSecret", secret);
      const [payload, unknownPayload, backfillPayload] = await Promise.all([
        getAdminAction<DataQualitySummary>("/api/admin/data-quality", secret),
        getAdminAction<UnknownMatchReview>("/api/admin/unknown-matches?limit=25", secret),
        getAdminAction<BackfillMonthsResponse>("/api/admin/backfill/months", secret),
      ]);
      setDataQuality(payload);
      setUnknownMatches(unknownPayload.data);
      setBackfillMonths(backfillPayload.data);
      setQuality({ isRunning: false, message: `Data quality refreshed from ${payload.source}.`, error: null });
    } catch (actionError) {
      setQuality({ isRunning: false, message: null, error: actionError instanceof Error ? actionError.message : "Data quality refresh failed" });
    }
  }

  return (
    <div className="space-y-3">
      <DataQualityCards data={dataQuality} />
      {dataQuality ? <p className="rounded-2xl border border-cyan-300/20 bg-cyan-400/10 p-4 text-sm text-cyan-100">Next action: keep syncing player archives until archive synced team members reaches 100%, then review unknown matches and recalculate contributions.</p> : null}
      {dataQuality?.warnings.length ? <p className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-100">{dataQuality.warnings.slice(0, 4).join(" ")}</p> : null}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Historical Backfill by Month</h3>
            <p className="mt-1 text-sm text-slate-400">Progress is calculated against players.is_team_member = 1 for each official match month.</p>
          </div>
          <button
            onClick={syncNextIncompleteMonth}
            disabled={isBusy || backfillMonths.length === 0}
            className="rounded-xl bg-purple-400 px-3 py-2 text-sm font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {archives.isRunning ? "Syncing…" : "Sync next incomplete month"}
          </button>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Month</th>
                <th>Official matches</th>
                <th>Synced team members</th>
                <th>Failed</th>
                <th>Progress %</th>
                <th>Games</th>
                <th>Participations</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {backfillMonths.length === 0 ? (
                <tr><td colSpan={8} className="py-4 text-slate-500">Refresh data quality to load official match months.</td></tr>
              ) : backfillMonths.map((month) => {
                const label = formatMonth(month.year, month.month);
                return (
                  <tr key={label} className="border-b border-white/5 text-slate-200 last:border-0">
                    <td className="py-4 font-medium text-white">{label}</td>
                    <td>{formatNumber(month.officialMatchCount)}</td>
                    <td>{formatNumber(month.syncedTeamMembers)} / {formatNumber(month.teamMembersTotal)}</td>
                    <td>{formatNumber(month.failedTeamMembers)}</td>
                    <td>{month.progressPercent}%</td>
                    <td>{formatNumber(month.gamesImportedForMonth)}</td>
                    <td>{formatNumber(month.participationsForMonth)}</td>
                    <td>
                      <div className="flex flex-wrap gap-2">
                        <button onClick={() => syncBackfillMonth(month, "next")} disabled={isBusy} className="rounded-lg border border-purple-300/30 px-2 py-1 text-xs font-semibold text-purple-100 disabled:cursor-not-allowed disabled:opacity-60">Sync next 25</button>
                        <button onClick={() => syncBackfillMonth(month, "retry-failed")} disabled={isBusy} className="rounded-lg border border-violet-300/30 px-2 py-1 text-xs font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-60">Retry failed</button>
                        <Link href={`/matches?official=official&month=${label}`} className="rounded-lg border border-cyan-300/30 px-2 py-1 text-xs font-semibold text-cyan-100 hover:bg-cyan-400/10">Open related matches</Link>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="font-semibold text-white">Unknown Match Review</h3>
            <p className="mt-1 text-sm text-slate-400">First 25 unknown matches with suggested classifications.</p>
          </div>
          <button
            onClick={() => runAction<ReclassifySummary>("/api/admin/reclassify-matches", (summary) => `Reclassified ${summary.processed} matches; updated ${summary.updated}.`, setReclassify)}
            disabled={isBusy}
            className="rounded-xl border border-orange-300/30 px-3 py-2 text-sm font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reclassify Matches
          </button>
        </div>
        <div className="mt-3 max-h-72 space-y-2 overflow-auto">
          {unknownMatches.length === 0 ? <p className="text-sm text-slate-500">Refresh data quality to load unknown matches.</p> : unknownMatches.map((match) => (
            <div key={match.id} className="rounded-xl border border-white/10 p-3 text-sm">
              <p className="font-medium text-slate-100">{match.name}</p>
              <p className="mt-1 text-slate-400">Suggested: {match.suggestedClassification.leagueSlug} ({Math.round(match.suggestedClassification.confidence * 100)}% confidence) · {match.status}</p>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={() => runAction<SyncSummary>("/api/admin/sync/matches", (summary) => `Sync ${summary.status}: ${summary.recordsProcessed} matches processed. Registered: ${summary.buckets.registered ?? 0}, active: ${summary.buckets.in_progress ?? 0}, finished: ${summary.buckets.finished ?? 0}.`, setSync)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sync.isRunning ? "Syncing…" : "Sync Matches"}
      </button>
      <button
        onClick={() => runAction<MatchDetailsSummary>("/api/admin/sync/match-details?limit=10&onlyOfficial=true", (summary) => {
          const problems = [...summary.warnings, ...summary.errors];
          return `Match details ${summary.status}: ${summary.matchesProcessed} matches processed, ${summary.playersUpserted} players upserted, ${summary.gamesUpserted} games upserted, ${summary.participationsUpserted} participations upserted.${problems.length ? ` Warnings/errors: ${problems.slice(0, 5).join("; ")}` : ""}`;
        }, setDetails)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-emerald-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {details.isRunning ? "Syncing details…" : "Sync Match Details"}
      </button>

      <button
        onClick={() => runAction<SyncPlayersSummary>("/api/admin/sync/players", (summary) => {
          const problems = [...summary.warnings, ...summary.errors];
          return `Player sync ${summary.status}: ${summary.membersFetched} members fetched, ${summary.playersUpserted} players upserted.${problems.length ? ` Warnings/errors: ${problems.slice(0, 5).join("; ")}` : ""}`;
        }, setPlayers)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-sky-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-sky-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {players.isRunning ? "Syncing players…" : "Sync Players"}
      </button>
      <button
        onClick={() => runAction<PlayerArchivesSummary>("/api/admin/sync/player-archives?mode=next&limitPlayers=10", (summary) => {
          const problems = [...summary.warnings, ...summary.errors];
          return `Player archives: ${summary.playersProcessed} players processed, ${summary.gamesScanned} games scanned, ${summary.gamesMatched} games matched, ${summary.gamesUpserted} games upserted, ${summary.participationsUpserted} participations upserted.${problems.length ? ` Warnings/errors: ${problems.slice(0, 5).join("; ")}` : ""}`;
        }, setArchives, refreshBackfillMonths)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-violet-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {archives.isRunning ? "Syncing archives…" : "Sync next 10 players"}
      </button>

      <button
        onClick={() => runAction<PlayerArchivesSummary>("/api/admin/sync/player-archives?mode=next&limitPlayers=25", (summary) => `Player archives: ${summary.playersProcessed} players processed, ${summary.gamesScanned} games scanned, ${summary.gamesMatched} games matched, ${summary.gamesUpserted} games upserted.`, setArchives, refreshBackfillMonths)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-purple-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {archives.isRunning ? "Syncing archives…" : "Sync next 25 players"}
      </button>
      <button
        onClick={() => runAction<PlayerArchivesSummary>("/api/admin/sync/player-archives?mode=retry-failed&limitPlayers=25", (summary) => `Retry failed archives: ${summary.playersProcessed} players processed, ${summary.errors.length} errors.`, setArchives, refreshBackfillMonths)}
        disabled={isBusy}
        className="w-full rounded-2xl border border-violet-300/30 px-4 py-3 font-semibold text-violet-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {archives.isRunning ? "Retrying…" : "Retry failed"}
      </button>
      <button
        onClick={refreshDataQuality}
        disabled={isBusy}
        className="w-full rounded-2xl border border-cyan-300/30 px-4 py-3 font-semibold text-cyan-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {quality.isRunning ? "Refreshing…" : "Refresh data quality"}
      </button>

      <button
        onClick={() => runAction<ReclassifySummary>("/api/admin/reclassify-matches", (summary) => {
          const counts = Object.entries(summary.countsByLeague).sort(([left], [right]) => left.localeCompare(right)).map(([league, count]) => `${league}: ${count}`).join(", ");
          return `Reclassified ${summary.processed} matches; updated ${summary.updated}.${counts ? ` Counts: ${counts}.` : ""}`;
        }, setReclassify)}
        disabled={isBusy}
        className="w-full rounded-2xl border border-orange-300/30 px-4 py-3 font-semibold text-orange-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {reclassify.isRunning ? "Reclassifying…" : "Reclassify Matches"}
      </button>
      <button
        onClick={() => runAction<RecalculateSummary>("/api/admin/recalculate", (summary) => `Recalculated ${summary.rowsWritten} contribution rows from ${summary.source} data for period ${summary.period}.`, setRecalculate)}
        disabled={isBusy}
        className="w-full rounded-2xl border border-yellow-300/30 px-4 py-3 font-semibold text-yellow-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {recalculate.isRunning ? "Recalculating…" : "Recalculate"}
      </button>
      {sync.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{sync.message}</p> : null}
      {details.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{details.message}</p> : null}
      {players.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{players.message}</p> : null}
      {archives.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{archives.message}</p> : null}
      {quality.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{quality.message}</p> : null}
      {reclassify.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{reclassify.message}</p> : null}
      {recalculate.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{recalculate.message}</p> : null}
      {sync.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{sync.error}</p> : null}
      {details.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{details.error}</p> : null}
      {players.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{players.error}</p> : null}
      {archives.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{archives.error}</p> : null}
      {quality.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{quality.error}</p> : null}
      {reclassify.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{reclassify.error}</p> : null}
      {recalculate.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{recalculate.error}</p> : null}
    </div>
  );
}
