import { describe, expect, it } from "vitest";

import { groundAt, WORLD_RADIUS } from "@vila/shared/game/world";

import { groundColor, groundRuns } from "./groundRuns";

describe("ground runs (IMPL-0024)", () => {
  const radius = Math.ceil(WORLD_RADIUS) + 3;
  const runs = groundRuns(radius);

  it("covers every cell of the disc exactly once, with the colour of the cell", () => {
    let cells = 0;
    for (let x = -radius; x <= radius; x++) for (let z = -radius; z <= radius; z++) if (Math.hypot(x, z) <= radius) cells++;
    expect(runs.reduce((n, [x0, x1]) => n + (x1 - x0 + 1), 0)).toBe(cells);
    const seen = new Set<string>();
    for (const [x0, x1, z, c] of runs)
      for (let x = x0; x <= x1; x++) {
        expect(seen.has(`${x},${z}`)).toBe(false);
        seen.add(`${x},${z}`);
        expect(c).toBe(groundColor(groundAt(x, z), x, z));
      }
  });

  it("stays within its budget: under half a quad per cell, whatever the village paints", () => {
    // 23 000 cells; cobbles alternate cell by cell, snow and streets merge into long runs.
    expect(runs.length).toBeGreaterThan(3000);
    expect(runs.length).toBeLessThan(11500);
  });

  it("is deterministic", () => {
    expect(groundRuns(radius)).toEqual(runs);
  });
});
