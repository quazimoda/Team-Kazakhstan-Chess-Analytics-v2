import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { normalizeArchiveSyncOptions } from "./playerArchiveSyncOptions";

describe("player archive sync options", () => {
  it("defaults to next mode and skipAlreadySynced with a Vercel-safe cap", () => {
    const options = normalizeArchiveSyncOptions({ limitPlayers: 1378 });

    assert.equal(options.mode, "next");
    assert.equal(options.skipAlreadySynced, true);
    assert.equal(options.limitPlayers, 25);
  });

  it("uses specific mode when explicit usernames are provided", () => {
    const options = normalizeArchiveSyncOptions({ usernames: ["KazPlayer"], skipAlreadySynced: false });

    assert.equal(options.mode, "specific");
    assert.equal(options.skipAlreadySynced, false);
    assert.deepEqual(options.usernames, ["KazPlayer"]);
  });
});
