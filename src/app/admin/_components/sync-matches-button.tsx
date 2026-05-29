"use client";

import { useState } from "react";

type SyncSummary = {
  status: "success" | "failed";
  recordsProcessed: number;
  errorMessage: string | null;
  buckets: Record<string, number>;
};

type RecalculateSummary = {
  source: "database" | "demo";
  period: "all";
  leagueId: number | null;
  rowsWritten: number;
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

  return null;
}

async function postAdminAction<T>(endpoint: string, secret: string): Promise<T> {
  const response = await fetch(endpoint, {
    method: "POST",
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

export function SyncMatchesButton() {
  const [sync, setSync] = useState<ActionState>({ isRunning: false, message: null, error: null });
  const [recalculate, setRecalculate] = useState<ActionState>({ isRunning: false, message: null, error: null });

  async function runAction<T>(endpoint: string, onSuccess: (payload: T) => string, setState: (state: ActionState) => void) {
    setState({ isRunning: true, message: null, error: null });

    const secret = window.prompt("ADMIN_SECRET");
    if (secret == null) {
      setState({ isRunning: false, message: null, error: null });
      return;
    }

    try {
      const payload = await postAdminAction<T>(endpoint, secret);
      setState({ isRunning: false, message: onSuccess(payload), error: null });
    } catch (actionError) {
      setState({ isRunning: false, message: null, error: actionError instanceof Error ? actionError.message : "Admin action failed" });
    }
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => runAction<SyncSummary>("/api/admin/sync/matches", (summary) => `Sync ${summary.status}: ${summary.recordsProcessed} matches processed. Registered: ${summary.buckets.registered ?? 0}, active: ${summary.buckets.in_progress ?? 0}, finished: ${summary.buckets.finished ?? 0}.`, setSync)}
        disabled={sync.isRunning || recalculate.isRunning}
        className="w-full rounded-2xl bg-cyan-400 px-4 py-3 font-semibold text-slate-950 shadow-lg shadow-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {sync.isRunning ? "Syncing…" : "Sync Matches"}
      </button>
      <button
        onClick={() => runAction<RecalculateSummary>("/api/admin/recalculate", (summary) => `Recalculated ${summary.rowsWritten} contribution rows from ${summary.source} data for period ${summary.period}.`, setRecalculate)}
        disabled={sync.isRunning || recalculate.isRunning}
        className="w-full rounded-2xl border border-yellow-300/30 px-4 py-3 font-semibold text-yellow-100 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {recalculate.isRunning ? "Recalculating…" : "Recalculate"}
      </button>
      {sync.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{sync.message}</p> : null}
      {recalculate.message ? <p className="rounded-2xl border border-emerald-300/20 bg-emerald-400/10 p-4 text-sm text-emerald-100">{recalculate.message}</p> : null}
      {sync.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{sync.error}</p> : null}
      {recalculate.error ? <p className="rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{recalculate.error}</p> : null}
    </div>
  );
}
