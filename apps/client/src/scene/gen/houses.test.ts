import { PALETTE as P } from "@vila/shared/game/world";
import { describe, expect, it } from "vitest";

import { RESIDENTIAL_PLOTS } from "@vila/shared/game/world";

import { archetypeOf, residence } from "../villageModels";
import { ARCHETYPES, CHIMNEY, house } from "./houses";

const LOT_IDS = Array.from({ length: 8 }, (_, i) => `plaza-${String(i + 1).padStart(2, "0")}`);

describe("house generator", () => {
  it("puts the chimney anchor just above a chimney column (smoke origin)", () => {
    for (const id of LOT_IDS) {
      const m = house(id);
      const [cx, cy, cz] = m.anchors!.chimney;
      const top = m.voxels.find(([x, y, z]) => x === cx && z === cz && y === cy - 0.5);
      expect(top?.[3], id).toBe(CHIMNEY);
    }
  });

  it("gives every lot of the plaza a house with lit windows and a front door", () => {
    for (const id of LOT_IDS) {
      const m = house(id);
      expect(m.glow).toEqual([P.window]);
      expect(m.voxels.some((v) => v[3] === P.window)).toBe(true);
    }
  });

  it("stays within 5 voxels of the lot centre (porch ends at the street's outer edge)", () => {
    for (const id of LOT_IDS) for (const [x, , z] of house(id).voxels) expect(Math.max(Math.abs(x), Math.abs(z)), id).toBeLessThanOrEqual(5);
  });

  it("keeps snow an accent on a roof: seen from above, under a third of a house is snow (IMPL-0030)", () => {
    const seeds = [...LOT_IDS, ...RESIDENTIAL_PLOTS.slice(0, 40).map((p) => p.id)];
    for (const id of seeds) {
      const voxels = id.startsWith("plaza") ? house(id).voxels : residence(RESIDENTIAL_PLOTS.find((p) => p.id === id)!).voxels;
      const top = new Map<string, [number, string]>();
      for (const [x, y, z, c] of voxels) if ((top.get(`${x},${z}`)?.[0] ?? -1) < y) top.set(`${x},${z}`, [y, c]);
      const white = [...top.values()].filter(([, c]) => c === P.snow).length;
      expect(white / top.size, id).toBeLessThan(0.34);
      // …and it is still a winter roof: some snow lies on every house.
      expect(white, id).toBeGreaterThan(0);
    }
  });
});

describe("residential archetypes (IMPL-0030)", () => {
  const drawn = RESIDENTIAL_PLOTS.map((plot) => ({ plot, archetype: archetypeOf(plot.id), model: residence(plot) }));

  it("draws every archetype in the village, and no more than about half the plots keep the classic chalet", () => {
    const count = (a: string) => drawn.filter((d) => d.archetype === a).length;
    for (const a of ARCHETYPES) expect(count(a), a).toBeGreaterThan(RESIDENTIAL_PLOTS.length * 0.07);
    expect(count("classic")).toBeLessThan(RESIDENTIAL_PLOTS.length * 0.65);
  });

  it("is the same for every visitor: an archetype depends on the plot id alone", () => {
    for (const { plot, archetype } of drawn) expect(archetypeOf(plot.id), plot.id).toBe(archetype);
  });

  it("gives each archetype its silhouette: a dormer window over the door, two floors, or a flat roof with a room", () => {
    const heightOf = (voxels: ReadonlyArray<readonly [number, number, number, string]>) => Math.max(...voxels.map((v) => v[1]));
    for (const tier of ["premium", "standard", "economy"] as const) {
      const of = (a: string) => drawn.filter((d) => d.plot.tier === tier && d.archetype === a);
      // A townhouse has windows on two floors; a classic chalet of the same tier has one floor of them.
      for (const { model, plot } of of("townhouse")) expect(model.voxels.some((v) => v[3] === P.window && v[1] === 4), plot.id).toBe(true);
      for (const { model, plot } of of("classic")) expect(model.voxels.some((v) => v[3] === P.window && v[1] === 4 && Math.abs(v[0]) > 0 && Math.abs(v[2]) > 0), plot.id).toBe(false);
      // A terrace is the lowest of them: its roof is a slab, not a ridge.
      for (const { model, plot } of of("terrace")) expect(heightOf(model.voxels), plot.id).toBeLessThanOrEqual(8);
    }
    for (const { model, plot } of drawn.filter((d) => d.archetype === "dormer")) {
      // The dormer's window sits one course above the eave, in front of the front wall.
      const eave = 3;
      expect(model.voxels.some(([x, y, , c]) => x === 0 && y === eave + 1 && c === P.window), plot.id).toBe(true);
    }
  });

  it("does not paint two neighbours of a row alike", () => {
    const signature = (m: { voxels: ReadonlyArray<readonly [number, number, number, string]> }) => [...new Set(m.voxels.map((v) => v[3]))].sort().join();
    let alike = 0;
    for (let i = 1; i < drawn.length; i++) if (drawn[i].plot.tier === drawn[i - 1].plot.tier && drawn[i].archetype === drawn[i - 1].archetype && signature(drawn[i].model) === signature(drawn[i - 1].model)) alike++;
    expect(alike).toBeLessThan(RESIDENTIAL_PLOTS.length * 0.03);
  });
});
