/** Book VIII prop contract: deterministic, inside the per-object budget, varied and grounded. */
import { describe, expect, it } from "vitest";

import { measure } from "../../budget";
import { byCategory } from "../../catalog";
import { seedOf } from "../../rng";
import { PROPS } from "./index";

const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const GALLERY = Array.from({ length: 8 }, (_, i) => `gallery-${i}`);
const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const BUDGET = {
  "sun-seed": [80, 200],
  "glass-flower": [80, 200],
  "season-spice": [80, 200],
  "summer-flower": [220, 600],
} as const;

describe("book VIII props", () => {
  it("has exactly the four new generators", () => {
    expect(PROPS.map((p) => p.id)).toEqual(["sun-seed", "glass-flower", "season-spice", "summer-flower"]);
    expect(PROPS.map((p) => p.category)).toEqual(["quest_item", "quest_item", "quest_item", "world_prop"]);
    expect(PROPS.map((p) => p.name)).toEqual(["Semente de sol", "Flor de vidro", "Aroma da estação", "Flor de verão"]);
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
});
