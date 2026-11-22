import { describe, expect, it } from "vitest";

import { asNgoLevel, NGO_LEVEL_FROM_CENTS, NGO_LEVEL_MAX, NGO_LEVEL_MIN, ngoLevel } from "./ngo-level";

describe("level of an NGO's building (IMPL-0032, PROPOSTA)", () => {
  it("starts every house at level 1 and climbs at each threshold, exactly", () => {
    expect(ngoLevel(0)).toBe(1);
    NGO_LEVEL_FROM_CENTS.forEach((from, i) => {
      expect(ngoLevel(from), `at ${from}`).toBe(i + 1);
      if (i > 0) expect(ngoLevel(from - 1), `one cent short of ${from}`).toBe(i);
    });
    expect(ngoLevel(Number.MAX_SAFE_INTEGER)).toBe(NGO_LEVEL_MAX);
  });

  it("has five levels, thresholds that only grow, and the first at zero", () => {
    expect([NGO_LEVEL_MIN, NGO_LEVEL_MAX]).toEqual([1, 5]);
    expect(NGO_LEVEL_FROM_CENTS).toHaveLength(NGO_LEVEL_MAX);
    expect(NGO_LEVEL_FROM_CENTS[0]).toBe(0);
    for (let i = 1; i < NGO_LEVEL_FROM_CENTS.length; i++) expect(NGO_LEVEL_FROM_CENTS[i]).toBeGreaterThan(NGO_LEVEL_FROM_CENTS[i - 1]);
    // Whole reais: a threshold is an amount somebody can say out loud.
    for (const from of NGO_LEVEL_FROM_CENTS) expect(from % 100).toBe(0);
  });

  it("never invents a level from something that is not an amount", () => {
    for (const bad of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY, -1, -50_000]) expect(ngoLevel(bad as number), String(bad)).toBe(1);
    expect(ngoLevel("250000" as unknown as number)).toBe(1);
  });

  it("reads a level from the API as one of the five, and anything else as the first", () => {
    for (const level of [1, 2, 3, 4, 5]) expect(asNgoLevel(level)).toBe(level);
    for (const bad of [null, undefined, 0, 6, 2.5, "3", Number.NaN, {}]) expect(asNgoLevel(bad), String(bad)).toBe(1);
  });
});
