import { describe, expect, it } from "vitest";

import { newlyCompletedXp } from "./story-xp";

const entries = [
  { id: "quest-a", kind: "main", xp: 20 },
  { id: "quest-b", kind: "regional", xp: 15 },
  { id: "quick-a", kind: "quick", xp: 30 },
];

describe("newlyCompletedXp", () => {
  it("sums only the entries completed between the snapshots", () => {
    expect(newlyCompletedXp({}, { "quest-a": true, "quick-a": true }, entries)).toEqual({
      total: 50,
      quick: [{ id: "quick-a", xp: 30 }],
      unknown: [],
    });
  });

  it("returns zero when a credit has no newly completed entry", () => {
    // A duplicated +15 XP credit compares against 0, not against a tolerated window.
    expect(newlyCompletedXp({ "quest-a": true }, { "quest-a": true }, entries)).toEqual({
      total: 0,
      quick: [],
      unknown: [],
    });
  });

  it("adds a newly completed narrative entry and does not call it quick", () => {
    expect(newlyCompletedXp({ "quest-a": true }, { "quest-a": true, "quest-b": true }, entries)).toEqual({
      total: 15,
      quick: [],
      unknown: [],
    });
  });

  it("reports completed ids missing from the manifest", () => {
    expect(newlyCompletedXp({}, { ghost: true }, entries)).toEqual({ total: 0, quick: [], unknown: ["ghost"] });
  });
});
