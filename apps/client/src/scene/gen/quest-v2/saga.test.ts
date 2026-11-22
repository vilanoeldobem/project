/** The ten saga props: exact catalogue, category budgets, determinism, variation and solid footprints. */
import { describe, expect, it } from "vitest";

import { measure } from "../budget";
import { byCategory } from "../catalog";
import { seedOf } from "../rng";
import { storyProp } from "./catalog";
import { PROPS, SAGA_IDS } from "./saga";

const SEEDS = Array.from({ length: 12 }, (_, i) => `seed-${i}`);
const GALLERY = Array.from({ length: 8 }, (_, i) => `gallery-${i}`);
const SOLID = new Set(["star-guide", "great-bell", "loom", "time-tower", "foundation-stone", "snow-archive"]);
const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const budget = (category: string): [number, number] => (category === "world_prop" ? [220, 600] : [80, 200]);

describe("saga props", () => {
  it("has exactly the ten saga generators in order", () => {
    expect(PROPS.map((prop) => prop.id)).toEqual([
      "star-guide",
      "great-bell",
      "loom",
      "time-tower",
      "ice-bridge",
      "foundation-stone",
      "snow-archive",
      "aurora-crown",
      "dawn-thread",
      "hand-right-candle",
    ]);
    expect(PROPS.map((prop) => prop.category)).toEqual([
      "world_prop",
      "world_prop",
      "world_prop",
      "world_prop",
      "world_prop",
      "world_prop",
      "world_prop",
      "quest_item",
      "quest_item",
      "quest_item",
    ]);
    expect(PROPS.map((prop) => prop.name)).toEqual([
      "Estrela-Guia",
      "Sino-Mor",
      "Tear",
      "Torre do Tempo",
      "Ponte de Gelo",
      "Pedra Fundamental",
      "Arquivo das Neves",
      "Coroa de Aurora",
      "Fio do Amanhecer",
      "Vela da Vigília",
    ]);
    expect([...SAGA_IDS]).toEqual(PROPS.map((prop) => prop.id));
  });

  it.each(PROPS.map((prop) => [prop.id, prop] as const))("%s stays inside its budget and is grounded", (id, prop) => {
    const [maxVoxels, maxFaces] = budget(prop.category);
    for (const seed of SEEDS) {
      const model = prop.generate(seed);
      const voxels = model.voxels;
      expect(voxels.length).toBeGreaterThan(0);
      expect(voxels.every(([x, y, z]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z))).toBe(true);
      expect(Math.min(...voxels.map((v) => v[1]))).toBe(0);
      expect(new Set(voxels.map(([x, y, z]) => `${x},${y},${z}`)).size).toBe(voxels.length);
      const measured = measure(voxels);
      expect(measured.voxels, `${id} ${seed} voxels`).toBeLessThanOrEqual(maxVoxels);
      expect(measured.faces, `${id} ${seed} faces`).toBeLessThanOrEqual(maxFaces);
      expect(model.size).toBe(0.2);
    }
  });

  it.each(PROPS.map((prop) => [prop.id, prop] as const))("%s is deterministic and varies across seeds", (id, prop) => {
    for (const seed of SEEDS.slice(0, 4)) expect(prop.generate(seed)).toEqual(prop.generate(seed));
    expect(new Set(SEEDS.map((seed) => fingerprint(prop.generate(seed).voxels))).size, id).toBeGreaterThanOrEqual(6);
  });

  it.each(PROPS.map((prop) => [prop.id, prop] as const))("%s keeps the gallery seeds stable", (id, prop) => {
    expect(GALLERY.map((seed) => fingerprint(prop.generate(seed).voxels)), id).toMatchSnapshot();
  });

  it("exposes the six solid footprints and leaves the bridge and items walkable", () => {
    for (const prop of PROPS) {
      const model = prop.generate("seed-0");
      if (SOLID.has(prop.id)) {
        expect(model.solid, prop.id).toHaveLength(1);
        expect(model.solid?.[0], prop.id).toHaveLength(4);
      } else {
        expect(model.solid, prop.id).toBeUndefined();
      }
    }
  });

  it("registers the ten generators in the saga gallery category and resolves each by id", () => {
    expect(byCategory("saga").map((generator) => generator.id)).toEqual(PROPS.map((prop) => prop.id));
    for (const prop of PROPS) expect(storyProp(prop.id)?.voxels.length, prop.id).toBeGreaterThan(0);
  });
});
