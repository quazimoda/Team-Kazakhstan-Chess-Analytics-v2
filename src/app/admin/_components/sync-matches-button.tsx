"use client";

import { useState } from "react";

type SyncSummary = {
  status: "success" | "failed";
  recordsProcessed: number;
  errorMessage: string | null;
  buckets: Record<string, number>;
};

export function SyncMatchesButton() {
  const [isSyncing, setIsSyncing] = useState(false);
  const [summary, setSummary] = useState<SyncSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function syncMatches() {
    setIsSyncing(true);
    setSummary(null);
    setError(null);

    const secret = window.prompt("ADMIN_SECRET");
    if (secret == null) {
      setIsSyncing(false);
      return;
    }

    try {
      const response = await fetch("/api/admin/sync/matches", {
        method: "POST",
        headers: { "x-admin-secret": secret },
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error ?? payload.errorMessage ?? "Sync failed");
      setSummary(payload);
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Sync failed");
    } finally {
      setIsSyncing(false);
    }
  }

  return (
    <div className="space-y-3">
      <button onClick={syncMatches} disabled={isSyncing} className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60">
        {isSyncing ? "Syncing…" : "Sync Matches"}
      </button>
      {summary ? (
        <div className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">
          <p className="font-semibold">Sync {summary.status}: {summary.recordsProcessed} matches processed.</p>
          <p className="mt-1 text-emerald-200/80">Registered: {summary.buckets.registered ?? 0}, active: {summary.buckets.in_progress ?? 0}, finished: {summary.buckets.finished ?? 0}</p>
        </div>
      ) : null}
      {error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</p> : null}
    </div>
  );
}
