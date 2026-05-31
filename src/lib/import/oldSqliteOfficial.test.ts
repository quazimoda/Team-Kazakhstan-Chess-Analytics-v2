import assert from "node:assert/strict";
import test from "node:test";
import {
  choosePythonCommand,
  collectImportCandidateUsernames,
  evaluateCandidateEligibility,
  executeImportPlan,
  extractPgnTags,
  isImportEnabled,
  isRecalculateEnabled,
  shouldRecalculateContributions,
  normalizedGameKeys,
  prepareImportPlayers,
  resultForColor,
  resultForTeamPlayer,
  validateImportCandidatePlayers,
  type CurrentMatchForImport,
  type ImportPlayerCandidate,
  type ImportPlayerRow,
  type OldSqliteGameRow,
  type PgnTags,
} from "./oldSqliteOfficial";

function row(overrides: Partial<OldSqliteGameRow> = {}): OldSqliteGameRow {
  return {
    game_url: "https://www.chess.com/game/daily/999",
    date: 20200101,
    time_class: "daily",
    time_control: "1/86400",
    rules: "chess",
    player: "KazPlayer",
    opponent: "Opponent",
    result: "win",
    pgn: '[Event "Team Match"]\n[Match "https://www.chess.com/club/matches/12345"]\n[White "KazPlayer"]\n[Black "Opponent"]\n[Result "1-0"]\n[Link "https://www.chess.com/game/daily/999"]',
    ...overrides,
  };
}

const officialMatch: CurrentMatchForImport = { id: 7, chesscomMatchId: 12345, isOfficial: true, leagueId: 3, leagueSlug: "lcwl" };

test("extractPgnTags extracts daily and live Chess.com club match ids", () => {
  assert.equal(extractPgnTags('[Match "https://www.chess.com/club/matches/12345"]')?.chesscomMatchId, 12345);
  assert.equal(extractPgnTags('[Match "https://www.chess.com/club/matches/live/67890"]')?.chesscomMatchId, 67890);
});

test("evaluateCandidateEligibility accepts only official league matches with importable rules and no duplicate", () => {
  const matches = new Map([[officialMatch.chesscomMatchId, officialMatch]]);
  assert.equal(evaluateCandidateEligibility(row(), matches, new Set()).reason, "candidate");
  assert.equal(evaluateCandidateEligibility(row({ rules: "crazyhouse" }), matches, new Set()).reason, "invalid_rules");
  assert.equal(evaluateCandidateEligibility(row(), new Map(), new Set()).reason, "unmatched");
  const nonOfficial = new Map([[officialMatch.chesscomMatchId, { ...officialMatch, isOfficial: false }]]);
  assert.equal(evaluateCandidateEligibility(row(), nonOfficial, new Set()).reason, "non_official");
});

test("evaluateCandidateEligibility detects duplicates from normalized raw_game URLs", () => {
  const matches = new Map([[officialMatch.chesscomMatchId, officialMatch]]);
  const existingKeys = new Set(normalizedGameKeys("https://www.chess.com/game/daily/999?move=12"));
  const evaluation = evaluateCandidateEligibility(row(), matches, existingKeys);
  assert.equal(evaluation.reason, "duplicate");
  assert.ok(evaluation.duplicateKeys.includes("999"));
});

test("resultForColor derives win draw loss from PGN result and player color", () => {
  assert.equal(resultForColor("1-0", "white"), "win");
  assert.equal(resultForColor("1-0", "black"), "loss");
  assert.equal(resultForColor("0-1", "black"), "win");
  assert.equal(resultForColor("1/2-1/2", "white"), "draw");
  assert.equal(resultForColor("*", "black"), "unknown");
});

test("resultForTeamPlayer stores imported game results from the Team Kazakhstan player perspective", () => {
  assert.equal(resultForTeamPlayer("1-0", { whiteIsTeamMember: true, blackIsTeamMember: false }), "win");
  assert.equal(resultForTeamPlayer("0-1", { whiteIsTeamMember: true, blackIsTeamMember: false }), "loss");
  assert.equal(resultForTeamPlayer("0-1", { whiteIsTeamMember: false, blackIsTeamMember: true }), "win");
  assert.equal(resultForTeamPlayer("1-0", { whiteIsTeamMember: false, blackIsTeamMember: true }), "loss");
  assert.equal(resultForTeamPlayer("1/2-1/2", { whiteIsTeamMember: true, blackIsTeamMember: false }), "draw");
  assert.equal(resultForTeamPlayer("1/2-1/2", { whiteIsTeamMember: false, blackIsTeamMember: true }), "draw");
});

test("executeImportPlan dry-run mode does not call writeCandidate", async () => {
  let writes = 0;
  const result = await executeImportPlan({ dryRun: true, candidates: [1, 2, 3], writeCandidate: async () => { writes += 1; } });
  assert.equal(result.written, 0);
  assert.equal(writes, 0);
});


test('isImportEnabled only allows the exact string "true"', () => {
  assert.equal(isImportEnabled("true"), true);
  assert.equal(isImportEnabled("TRUE"), false);
  assert.equal(isImportEnabled(" true"), false);
  assert.equal(isImportEnabled(undefined), false);
});

test("choosePythonCommand prefers python3, falls back to python, and errors clearly", () => {
  assert.equal(choosePythonCommand((command) => command === "python3"), "python3");
  assert.equal(choosePythonCommand((command) => command === "python"), "python");
  assert.throws(() => choosePythonCommand(() => false), /neither python3 nor python/);
});

test('isRecalculateEnabled only allows the exact string "true"', () => {
  assert.equal(isRecalculateEnabled("true"), true);
  assert.equal(isRecalculateEnabled("TRUE"), false);
  assert.equal(isRecalculateEnabled(" true"), false);
  assert.equal(isRecalculateEnabled(undefined), false);
});

test("shouldRecalculateContributions is disabled in dry-run and gated by RECALCULATE_AFTER_IMPORT", () => {
  assert.equal(shouldRecalculateContributions(true, "true"), false);
  assert.equal(shouldRecalculateContributions(false, "true"), true);
  assert.equal(shouldRecalculateContributions(false, "TRUE"), false);
  assert.equal(shouldRecalculateContributions(false, undefined), false);
});


type TestCandidate = { tags: PgnTags };

function candidateWithPlayers(white: string | null, black: string | null): TestCandidate {
  const tags = extractPgnTags(row({
    pgn: `[Event "Team Match"]\n[Match "https://www.chess.com/club/matches/12345"]\n[White "${white ?? ""}"]\n[Black "${black ?? ""}"]\n[Result "1-0"]\n[WhiteElo "2100"]\n[BlackElo "2000"]\n[Link "https://www.chess.com/game/daily/999"]`,
  }).pgn)!;
  return { tags: { ...tags, white, black } };
}

function memoryPlayerStore(initialPlayers: ImportPlayerRow[]) {
  const players = new Map(initialPlayers.map((player) => [player.username.toLowerCase(), player]));
  let nextId = 100;
  const insertedNames: string[] = [];
  return {
    insertedNames,
    loadByLowerUsernames: async (lowerUsernames: string[]) => lowerUsernames.flatMap((username) => players.get(username) ?? []),
    insertMissingPlayers: async (missingPlayers: ImportPlayerCandidate[]) => {
      for (const player of missingPlayers) {
        const key = player.username.toLowerCase();
        if (players.has(key)) continue;
        insertedNames.push(player.username);
        players.set(key, { id: nextId, username: player.username, is_team_member: 0 });
        nextId += 1;
      }
      return insertedNames.length;
    },
  };
}

test("old SQLite player preparation reuses existing players and preserves team-member metadata", async () => {
  const candidate = candidateWithPlayers("KazPlayer", "Opponent");
  const store = memoryPlayerStore([{ id: 42, username: "kazplayer", is_team_member: 1 }]);

  const prepared = await prepareImportPlayers(collectImportCandidateUsernames([candidate]), store);
  const validation = validateImportCandidatePlayers(candidate, prepared.playersByLowerUsername);

  assert.equal(prepared.playersLoaded, 2);
  assert.equal(prepared.playersInserted, 1);
  assert.deepEqual(store.insertedNames, ["Opponent"]);
  assert.equal(validation.ok, true);
  assert.equal(validation.white?.id, 42);
  assert.equal(validation.white?.is_team_member, 1);
});

test("old SQLite player preparation uses newly inserted player ids for games", async () => {
  const candidate = candidateWithPlayers("NewWhite", "NewBlack");
  const store = memoryPlayerStore([]);

  const prepared = await prepareImportPlayers(collectImportCandidateUsernames([candidate]), store);
  const validation = validateImportCandidatePlayers(candidate, prepared.playersByLowerUsername);

  assert.equal(prepared.playersLoaded, 2);
  assert.equal(prepared.playersInserted, 2);
  assert.equal(validation.ok, true);
  assert.equal(validation.white?.id, 101);
  assert.equal(validation.black?.id, 100);
});

test("old SQLite missing player candidate is skipped before game insertion", async () => {
  const candidate = candidateWithPlayers("KazPlayer", "MissingOpponent");
  const candidatesByUsername = collectImportCandidateUsernames([candidate]);
  const prepared = await prepareImportPlayers(candidatesByUsername, {
    loadByLowerUsernames: async (lowerUsernames) => lowerUsernames.includes("kazplayer") ? [{ id: 7, username: "KazPlayer", is_team_member: 1 }] : [],
    insertMissingPlayers: async () => 0,
  });
  const validation = validateImportCandidatePlayers(candidate, prepared.playersByLowerUsername);

  assert.equal(validation.ok, false);
  assert.deepEqual(validation.missing, ["black_player:MissingOpponent"]);
});

test("old SQLite missing player does not call game insertion or throw a foreign-key error", async () => {
  const candidate = candidateWithPlayers("KazPlayer", "MissingOpponent");
  const prepared = await prepareImportPlayers(collectImportCandidateUsernames([candidate]), {
    loadByLowerUsernames: async () => [{ id: 7, username: "KazPlayer", is_team_member: 1 }],
    insertMissingPlayers: async () => 0,
  });
  let gameInsertions = 0;

  await executeImportPlan({
    dryRun: false,
    candidates: [candidate],
    writeCandidate: async (importCandidate) => {
      const validation = validateImportCandidatePlayers(importCandidate, prepared.playersByLowerUsername);
      if (!validation.ok) return;
      gameInsertions += 1;
      throw new Error("foreign key violation should not be reachable");
    },
  });

  assert.equal(gameInsertions, 0);
});
