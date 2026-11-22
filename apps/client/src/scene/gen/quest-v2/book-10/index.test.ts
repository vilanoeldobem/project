/** Book X prop contract: deterministic, inside the per-object budget, varied and grounded. */
import { describe, expect, it } from "vitest";

import { measure } from "../../budget";
import { byCategory } from "../../catalog";
import { seedOf } from "../../rng";
import { PROPS } from "./index";

const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const GALLERY = Array.from({ length: 8 }, (_, i) => `gallery-${i}`);
const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);

describe("book X props", () => {
  it("has exactly the four new generators", () => {
    expect(PROPS.map((p) => p.id)).toEqual(["lost-hour", "time-gear", "short-candle", "small-notebook"]);
    expect(PROPS.map((p) => p.category)).toEqual(["quest_item", "quest_item", "quest_item", "quest_item"]);
    expect(PROPS.map((p) => p.name)).toEqual(["Hora perdida", "Engrenagem do tempo", "Vela curta", "Caderno pequeno"]);
  });

  it.each(PROPS.map((p) => [p.id, p] as const))("%s stays inside its budget and is grounded", (id, prop) => {
    for (const seed of SEEDS) {
      const voxels = prop.generate(seed).voxels;
      expect(voxels.length).toBeGreaterThan(0);
      expect(voxels.every(([x, y, z]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z))).toBe(true);
      expect(Math.min(...voxels.map((v) => v[1]))).toBe(0);
      expect(new Set(voxels.map(([x, y, z]) => `${x},${y},${z}`)).size).toBe(voxels.length);
      const m = measure(voxels);
      expect(m.voxels, `${id} ${seed} voxels`).toBeLessThanOrEqual(80);
      expect(m.faces, `${id} ${seed} faces`).toBeLessThanOrEqual(200);
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
