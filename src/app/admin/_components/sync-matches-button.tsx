"use client";

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
  archiveSyncedPlayers: number;
  gamesImported: number;
  participationRows: number;
  contributionRows: number;
  officialMatchesWithParticipations: number;
  unknownMatchesCount: number;
  warnings: string[];
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

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function DataQualityCards({ data }: { data: DataQualitySummary | null }) {
  const cards = [
    ["Players total", data?.playersTotal],
    ["Archive synced players", data?.archiveSyncedPlayers],
    ["Games imported", data?.gamesImported],
    ["Participation rows", data?.participationRows],
    ["Contribution rows", data?.contributionRows],
    ["Official matches with participations", data?.officialMatchesWithParticipations],
    ["Unknown matches", data?.unknownMatchesCount],
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
  const [quality, setQuality] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const isBusy = sync.isRunning || details.isRunning || players.isRunning || archives.isRunning || recalculate.isRunning || reclassify.isRunning || quality.isRunning;

  useEffect(() => {
    const savedSecret = window.sessionStorage.getItem("adminSecret");
    if (!savedSecret) return;
    getAdminAction<DataQualitySummary>("/api/admin/data-quality", savedSecret)
      .then(setDataQuality)
      .catch(() => undefined);
  }, []);

  async function runAction<T>(endpoint: string, onSuccess: (payload: T) => string, setState: (state: ActionState) => void) {
    setState({ isRunning: true, message: null, error: null });

    const secret = window.prompt("ADMIN_SECRET", window.sessionStorage.getItem("adminSecret") ?? "");
    if (secret == null) {
      setState({ isRunning: false, message: null, error: null });
      return;
    }

    try {
      window.sessionStorage.setItem("adminSecret", secret);
      const payload = await postAdminAction<T>(endpoint, secret);
      setState({ isRunning: false, message: onSuccess(payload), error: null });
    } catch (actionError) {
      setState({ isRunning: false, message: null, error: actionError instanceof Error ? actionError.message : "Admin action failed" });
    }
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
      const payload = await getAdminAction<DataQualitySummary>("/api/admin/data-quality", secret);
      setDataQuality(payload);
      setQuality({ isRunning: false, message: `Data quality refreshed from ${payload.source}.`, error: null });
    } catch (actionError) {
      setQuality({ isRunning: false, message: null, error: actionError instanceof Error ? actionError.message : "Data quality refresh failed" });
    }
  }

  return (
    <div className="space-y-3">
      <DataQualityCards data={dataQuality} />
      {dataQuality?.warnings.length ? <p className="rounded-2xl border border-yellow-300/20 bg-yellow-300/10 p-4 text-sm text-yellow-100">{dataQuality.warnings.slice(0, 4).join(" ")}</p> : null}
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
        }, setArchives)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-violet-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-violet-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {archives.isRunning ? "Syncing archives…" : "Sync next 10 players"}
      </button>

      <button
        onClick={() => runAction<PlayerArchivesSummary>("/api/admin/sync/player-archives?mode=next&limitPlayers=25", (summary) => `Player archives: ${summary.playersProcessed} players processed, ${summary.gamesScanned} games scanned, ${summary.gamesMatched} games matched, ${summary.gamesUpserted} games upserted.`, setArchives)}
        disabled={isBusy}
        className="w-full rounded-2xl bg-purple-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-purple-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {archives.isRunning ? "Syncing archives…" : "Sync next 25 players"}
      </button>
      <button
        onClick={() => runAction<PlayerArchivesSummary>("/api/admin/sync/player-archives?mode=retry-failed&limitPlayers=25", (summary) => `Retry failed archives: ${summary.playersProcessed} players processed, ${summary.errors.length} errors.`, setArchives)}
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
