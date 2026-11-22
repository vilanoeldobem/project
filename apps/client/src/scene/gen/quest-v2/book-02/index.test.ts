/** Book II prop contract: deterministic, inside the per-object budget, varied and grounded. */
import { describe, expect, it } from "vitest";

import { measure } from "../../budget";
import { byCategory } from "../../catalog";
import { seedOf } from "../../rng";
import { PROPS } from "./index";

const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const GALLERY = Array.from({ length: 8 }, (_, i) => `gallery-${i}`);
const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const BUDGET = {
  nameplate: [60, 160],
  "toy-reindeer": [70, 180],
  rose: [30, 90],
  "watering-can": [45, 120],
} as const;

describe("book II props", () => {
  it("has exactly the four new generators", () => {
    expect(PROPS.map((p) => p.id)).toEqual(["nameplate", "toy-reindeer", "rose", "watering-can"]);
    expect(PROPS.map((p) => p.category)).toEqual(["world_prop", "quest_item", "quest_item", "quest_item"]);
    expect(PROPS.map((p) => p.name)).toEqual(["Placa de Alba", "Rena de madeira", "Roseira de Alba", "Regador"]);
  });

  it.each(PROPS.map((p) => [p.id, p] as const))("%s stays inside its budget and is grounded", (id, prop) => {
    const [maxVoxels, maxFaces] = BUDGET[id as keyof typeof BUDGET];
    for (const seed of SEEDS) {
      const voxels = prop.generate(seed).voxels;
      expect(voxels.length).toBeGreaterThan(0);
      expect(voxels.every(([x, y, z]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z))).toBe(true);
      expect(Math.min(...voxels.map((v) => v[1]))).toBe(0);
      expect(new Set(voxels.map(([x, y, z]) => `${x},${y},${z}`)).size).toBe(voxels.length);
      const m = measure(voxels);
      expect(m.voxels, `${id} ${seed} voxels`).toBeLessThanOrEqual(maxVoxels);
      expect(m.faces, `${id} ${seed} faces`).toBeLessThanOrEqual(maxFaces);
    }
  });

  it.each(PROPS.map((p) => [p.id, p] as const))("%s is deterministic and varies across seeds", (id, prop) => {
    for (const seed of SEEDS.slice(0, 4)) expect(prop.generate(seed)).toEqual(prop.generate(seed));
    expect(new Set(SEEDS.map((s) => fingerprint(prop.generate(s).voxels))).size, id).toBeGreaterThanOrEqual(6);
  });

  it.each(PROPS.map((p) => [p.id, p] as const))("%s keeps the gallery seeds stable", (id, prop) => {
    expect(GALLERY.map((s) => fingerprint(prop.generate(s).voxels)), id).toMatchSnapshot();
  });

  it("registers the four generators in the props category", () => {
    const ids = byCategory("props").map((g) => g.id);
    for (const prop of PROPS) expect(ids).toContain(prop.id);
  });

  it("never uses Math.random in the generators", () => {
    const files = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [path, src] of Object.entries(files)) expect(/Math\.random\s*\(/.test(src), path).toBe(false);
  });
});
