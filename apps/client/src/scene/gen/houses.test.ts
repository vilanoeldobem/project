import { PALETTE as P } from "@vila/shared/game/world";
import { describe, expect, it } from "vitest";

import { RESIDENTIAL_PLOTS } from "@vila/shared/game/world";

import { archetypeOf, residence } from "../villageModels";
import { ARCHETYPES, CHIMNEY, house } from "./houses";
import { ngoBuilding } from "./ngoBuilding";

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

describe("the five levels of an NGO's building (IMPL-0032, PROPOSTA)", () => {
  const LEVELS = [1, 2, 3, 4, 5] as const;
  const lots = [...LOT_IDS, "ring1-01", "ring2-07", "ring3-17", "ring4-30"];
  const height = (m: { voxels: ReadonlyArray<readonly [number, number, number, string]> }) => Math.max(...m.voxels.map((v) => v[1])) + 1;

  it("grows with the level: never lower, taller from the second to the third and from the fourth to the fifth", () => {
    for (const id of lots) {
      const h = LEVELS.map((level) => height(ngoBuilding(id, level)));
      for (let i = 1; i < h.length; i++) expect(h[i], `${id} level ${i + 1}`).toBeGreaterThanOrEqual(h[i - 1]);
      expect(h[2], id).toBeGreaterThan(h[1]);
      expect(h[4], id).toBeGreaterThan(h[3]);
      // Each level is its own building: no two levels of a lot draw the same voxels.
      const prints = LEVELS.map((level) => ngoBuilding(id, level).voxels.map((v) => v.join()).sort().join("|"));
      expect(new Set(prints).size, id).toBe(5);
    }
  });

  it("keeps the NGO's own colours, roof and chimney side from one level to the next", () => {
    for (const id of lots) {
      const models = LEVELS.map((level) => ngoBuilding(id, level));
      const side = models.map((m) => Math.sign(m.anchors!.chimney[0]));
      expect(new Set(side).size, `${id} chimney side`).toBe(1);
      // The door (in the middle of the front wall, two or three voxels from the centre) keeps the seed's colour.
      const door = models.map((m, i) => m.voxels.find(([x, y, z]) => x === 0 && y === 0 && z === (i < 2 ? 2 : 3))?.[3]);
      expect(new Set(door).size, `${id} door ${door.join()}`).toBe(1);
      expect(door[0], id).toBeDefined();
    }
  });

  it("stays on the pad of a lot at every level: 5 voxels from its centre, the chimney on its column, windows lit", () => {
    for (const id of lots)
      for (const level of LEVELS) {
        const m = ngoBuilding(id, level);
        for (const [x, , z] of m.voxels) expect(Math.max(Math.abs(x), Math.abs(z)), `${id} level ${level}`).toBeLessThanOrEqual(5);
        const [cx, cy, cz] = m.anchors!.chimney;
        expect(m.voxels.find(([x, y, z]) => x === cx && z === cz && y === cy - 0.5)?.[3], `${id} level ${level} chimney`).toBe(CHIMNEY);
        expect(m.voxels.some((v) => v[3] === P.window), `${id} level ${level}`).toBe(true);
        expect(m.glow).toEqual([P.window]);
      }
  });

  it("puts a turret and lights on the fourth level and a star on the fifth, and none of them before", () => {
    for (const id of lots) {
      const lit = LEVELS.map((level) => ngoBuilding(id, level).emissive ?? []);
      expect(lit.slice(0, 3).every((e) => e.length === 0), id).toBe(true);
      expect(lit[3].length, id).toBeGreaterThan(0);
      const stone = (level: number) => ngoBuilding(id, level).voxels.filter((v) => v[3] === P.stone).length;
      expect(stone(4), `${id} turret`).toBeGreaterThan(stone(3) + 20);
      const star = (level: number) => ngoBuilding(id, level).voxels.filter((v) => v[3] === P.gold && v[1] >= 12).length;
      expect([star(4), star(5)], `${id} star`).toEqual([0, 1]);
    }
  });

  it("draws level 1 for anything that is not a level: the feature off, an older API, a value out of range", () => {
    const print = (m: { voxels: ReadonlyArray<readonly [number, number, number, string]> }) => m.voxels.map((v) => v.join()).sort().join("|");
    const first = print(ngoBuilding("plaza-03", 1));
    for (const level of [null, undefined, 0, 6, 2.5, Number.NaN]) expect(print(ngoBuilding("plaza-03", level as number)), String(level)).toBe(first);
    // The same building for every visitor.
    expect(print(ngoBuilding("plaza-03", 4))).toBe(print(ngoBuilding("plaza-03", 4)));
  });
});

