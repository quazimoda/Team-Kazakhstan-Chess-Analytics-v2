"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, StatCard } from "@/components/ui";
import { formatDateTime, formatNumber, publicChesscomUrl } from "@/lib/utils";
import type { DataCoverageSummary } from "@/types";

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: DataCoverageSummary }
  | { status: "error"; message: string };

function formatScore(value: number | null) {
  return value == null ? "—" : value.toFixed(1).replace(/\.0$/, "");
}

function coverageTone(label: DataCoverageSummary["matches"][number]["estimatedCoverageLabel"]) {
  if (label === "Likely complete") return "green";
  if (label === "Partial" || label === "Has games") return "gold";
  if (label === "No games") return "red";
  return "slate";
}

async function fetchCoverage(secret: string) {
  const response = await fetch("/api/admin/data-coverage", {
    headers: secret ? { "x-admin-secret": secret } : undefined,
  });
  const payload = await response.json().catch(() => null) as { error?: string } | DataCoverageSummary | null;
  if (!response.ok) {
    throw new Error(payload && "error" in payload && payload.error ? payload.error : `Request failed (${response.status})`);
  }
  if (!payload || "error" in payload || !("global" in payload) || !("matches" in payload) || !("archiveSync" in payload)) throw new Error("Invalid data coverage response");
  return payload;
}

export function DataCoverageDashboard() {
  const [state, setState] = useState<LoadState>({ status: "idle" });

  async function loadCoverage(secretOverride?: string | null) {
    const secret = secretOverride ?? window.sessionStorage.getItem("adminSecret") ?? "";
    setState({ status: "loading" });
    try {
      if (secret) window.sessionStorage.setItem("adminSecret", secret);
      const data = await fetchCoverage(secret);
      setState({ status: "success", data });
    } catch (error) {
      setState({ status: "error", message: error instanceof Error ? error.message : "Unable to load data coverage" });
    }
  }

  function promptAndLoad() {
    const secret = window.prompt("ADMIN_SECRET", window.sessionStorage.getItem("adminSecret") ?? "");
    if (secret == null) return;
    void loadCoverage(secret);
  }

  useEffect(() => {
    const savedSecret = window.sessionStorage.getItem("adminSecret");
    if (savedSecret) void loadCoverage(savedSecret);
  }, []);

  if (state.status === "success") {
    const { global, matches, archiveSync } = state.data;
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-400">Operational read-only coverage report. Match rows are limited to 100; summary cards use unbounded aggregate queries.</p>
          <button onClick={promptAndLoad} className="rounded-2xl border border-cyan-300/30 px-4 py-2 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-300/10">
            Refresh with ADMIN_SECRET
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <StatCard label="Official matches" value={formatNumber(global.totalOfficialMatches)} detail={`${formatNumber(global.totalActiveRegistrationOfficialMatches)} active/registration`} />
          <StatCard label="Completed official matches" value={formatNumber(global.totalOfficialCompletedMatches)} />
          <StatCard label="Stored official games" value={formatNumber(global.totalStoredGamesLinkedToOfficialMatches)} />
          <StatCard label="Official participation rows" value={formatNumber(global.totalMatchParticipationsLinkedToOfficialMatches)} />
          <StatCard label="Players with official participations" value={formatNumber(global.totalPlayersWithOfficialParticipations)} detail={`${formatNumber(global.totalTeamMembers)} team members total`} />
          <StatCard label="Archive sync failures" value={formatNumber(global.failedArchiveSyncStates)} detail={`${formatNumber(global.successfulArchiveSyncStates)} successful of ${formatNumber(global.totalArchiveSyncStates)}`} />
        </div>

        <Card className="overflow-x-auto">
          <h2 className="text-xl font-semibold text-white">Official match coverage</h2>
          <table className="mt-4 w-full min-w-[1320px] text-left text-sm">
            <thead className="text-slate-400">
              <tr className="border-b border-white/10">
                <th className="py-3">Match</th>
                <th>League</th>
                <th>Status</th>
                <th>Result</th>
                <th>Score</th>
                <th>Boards</th>
                <th>Stored games</th>
                <th>Participation rows</th>
                <th>Sources</th>
                <th>Latest game</th>
                <th>Coverage</th>
                <th>Links</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((match) => {
                const matchUrl = publicChesscomUrl(match.chesscomUrl);
                return (
                  <tr key={match.matchId} className="border-b border-white/5 text-slate-200 last:border-0">
                    <td className="py-4">
                      <div className="font-medium text-white">{match.name}</div>
                      <div className="text-xs text-slate-400">vs {match.opponent}</div>
                    </td>
                    <td>{match.leagueName ?? match.leagueSlug ?? "—"}</td>
                    <td><Badge tone={match.status === "completed" ? "green" : match.status === "cancelled" ? "red" : "gold"}>{match.status}</Badge></td>
                    <td><Badge tone={match.result === "win" ? "green" : match.result === "loss" ? "red" : match.result === "draw" ? "gold" : "slate"}>{match.result}</Badge></td>
                    <td>{formatScore(match.teamScore)} - {formatScore(match.opponentScore)}</td>
                    <td>{match.boardCount ?? "—"}</td>
                    <td>{formatNumber(match.storedGames)}</td>
                    <td>{formatNumber(match.participationRows)} <span className="text-xs text-slate-500">({formatNumber(match.teamKzPlayers)} team)</span></td>
                    <td className="text-xs text-slate-300">
                      old_sqlite {formatNumber(match.oldSqliteGames)}<br />
                      chesscom_api {formatNumber(match.chesscomApiGames)}<br />
                      unknown {formatNumber(match.unknownSourceGames)}
                    </td>
                    <td>{formatDateTime(match.latestGameAt)}</td>
                    <td><Badge tone={coverageTone(match.estimatedCoverageLabel)}>{match.estimatedCoverageLabel}</Badge></td>
                    <td className="space-x-3 whitespace-nowrap">
                      <Link className="text-cyan-200 hover:text-cyan-100" href={`/matches/${match.matchId}`}>Details</Link>
                      {matchUrl ? <Link className="text-cyan-200 hover:text-cyan-100" href={matchUrl}>Open match</Link> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>

        <Card>
          <h2 className="text-xl font-semibold text-white">Archive sync status</h2>
          <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-slate-400">Total rows</dt><dd className="text-2xl font-bold text-white">{formatNumber(archiveSync.totalRows)}</dd></div>
            <div><dt className="text-slate-400">Success</dt><dd className="text-2xl font-bold text-emerald-200">{formatNumber(archiveSync.successCount)}</dd></div>
            <div><dt className="text-slate-400">Failed</dt><dd className="text-2xl font-bold text-rose-200">{formatNumber(archiveSync.failedCount)}</dd></div>
            <div><dt className="text-slate-400">Running / skipped</dt><dd className="text-2xl font-bold text-yellow-200">{formatNumber(archiveSync.runningCount)} / {formatNumber(archiveSync.skippedCount)}</dd></div>
            <div><dt className="text-slate-400">Latest started</dt><dd className="text-white">{formatDateTime(archiveSync.latestStartedAt)}</dd></div>
            <div><dt className="text-slate-400">Latest finished</dt><dd className="text-white">{formatDateTime(archiveSync.latestFinishedAt)}</dd></div>
          </dl>
        </Card>
      </div>
    );
  }

  return (
    <Card>
      <h2 className="text-xl font-semibold text-white">Load coverage report</h2>
      <p className="mt-3 text-sm text-slate-300">This read-only admin report uses the same ADMIN_SECRET-protected API pattern as the existing admin actions.</p>
      {state.status === "error" ? <p className="mt-4 rounded-2xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{state.message}</p> : null}
      <button disabled={state.status === "loading"} onClick={promptAndLoad} className="mt-5 rounded-2xl bg-cyan-300 px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-cyan-200 disabled:cursor-not-allowed disabled:opacity-60">
        {state.status === "loading" ? "Loading…" : "Enter ADMIN_SECRET"}
      </button>
    </Card>
  );
}
