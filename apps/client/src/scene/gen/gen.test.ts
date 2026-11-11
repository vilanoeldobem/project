/**
 * Contract for every generator (IMPL-0010): deterministic per seed, inside its category budget, varied
 * across seeds, integer voxels with the base on y = 0, and a stable output hash per fixed seed (an art
 * change shows up as a snapshot diff to review, never silently).
 */
import { describe, expect, it } from "vitest";

import { BUDGETS, measure } from "./budget";
import { GENERATORS } from "./catalog";
import { seedOf } from "./rng";

const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);

describe.each(GENERATORS.map((g) => [g.id, g] as const))("generator %s", (_, g) => {
  it("is deterministic for a seed", () => {
    for (const s of SEEDS.slice(0, 4)) expect(g.generate(s)).toEqual(g.generate(s));
  });

  it("stays within the category budget", () => {
    const budget = BUDGETS[g.category];
    for (const s of SEEDS) {
      const m = measure(g.generate(s).voxels);
      expect(m.voxels, `${g.id} ${s} voxels`).toBeLessThanOrEqual(budget.voxels);
      expect(m.faces, `${g.id} ${s} faces`).toBeLessThanOrEqual(budget.faces);
    }
  });

  it("produces at least 6 distinct variants over 12 seeds", () => {
    expect(new Set(SEEDS.map((s) => fingerprint(g.generate(s).voxels))).size).toBeGreaterThanOrEqual(6);
  });

  it("uses integer coordinates with the base on y = 0", () => {
    for (const s of SEEDS) {
      const { voxels } = g.generate(s);
      expect(voxels.length).toBeGreaterThan(0);
      expect(voxels.every(([x, y, z]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z))).toBe(true);
      expect(Math.min(...voxels.map((v) => v[1]))).toBe(0);
    }
  });
});

describe("generator snapshots", () => {
  it.each(GENERATORS.map((g) => [g.id, g] as const))("%s keeps the output of fixed seeds stable", (_, g) => {
    expect(["a", "b", 7].map((s) => fingerprint(g.generate(s).voxels))).toMatchSnapshot();
  });
});

describe("determinism guard", () => {
  it("never uses Math.random in generator code", () => {
    const files = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(3);
    for (const [path, src] of Object.entries(files)) expect(/Math\.random\s*\(/.test(src), path).toBe(false);
  });
});
