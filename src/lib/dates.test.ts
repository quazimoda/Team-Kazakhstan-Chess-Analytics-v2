import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { toDateOrNull, toIsoOrNull } from "./dates";

describe("date normalization", () => {
  it("returns valid Date objects unchanged", () => {
    const date = new Date("2026-05-29T12:00:00.000Z");
    assert.equal(toDateOrNull(date), date);
  });

  it("converts ISO strings to Date objects", () => {
    const date = toDateOrNull("2026-05-29T12:00:00.000Z");
    assert.ok(date instanceof Date);
    assert.equal(date.toISOString(), "2026-05-29T12:00:00.000Z");
  });

  it("converts timestamp numbers to Date objects", () => {
    const timestamp = Date.parse("2026-05-29T12:00:00.000Z");
    const date = toDateOrNull(timestamp);
    assert.ok(date instanceof Date);
    assert.equal(date.toISOString(), "2026-05-29T12:00:00.000Z");
  });

  it("returns null for invalid strings", () => {
    assert.equal(toDateOrNull("not a date"), null);
  });

  it("returns null for null", () => {
    assert.equal(toDateOrNull(null), null);
  });

  it("returns null for undefined", () => {
    assert.equal(toDateOrNull(undefined), null);
  });

  it("serializes normalized dates to ISO strings", () => {
    assert.equal(toIsoOrNull("2026-05-29T12:00:00.000Z"), "2026-05-29T12:00:00.000Z");
    assert.equal(toIsoOrNull("not a date"), null);
  });
});
