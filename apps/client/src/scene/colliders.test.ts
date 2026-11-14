/**
 * Collider audit (IMPL-0016): what is drawn against what blocks the avatar, both ways.
 *
 * - Nothing solid is walk-through: every voxel below the avatar's head lies inside a collider, give or take
 *   a brush (pine needles, a villager's arm, the tip of a tail).
 * - Nothing invisible blocks: every point on a collider's outline is next to a voxel the avatar could bump.
 *
 * The models come from the same generators and placements the scene uses, so an art or layout change that
 * leaves a collider behind fails here instead of in a play test.
 */
import { describe, expect, it } from "vitest";

import { type Collider, distanceTo } from "@vila/shared/game/collision";
import {
  BENCHES,
  DONATION_PANEL,
  HOUSE_ENVELOPE,
  LAMPS,
  lotColliders,
  LOTS,
  NPCS,
  OBSTACLES,
  pineAt,
  pineIsTall,
  PINES,
  PLACED_PROPS,
  plotColliders,
  QUEST_OBSTACLES,
  REINDEER,
  RESIDENTIAL_DRESSING,
  RESIDENTIAL_PLOTS,
  SHOP_SOLID,
  SHOPS,
  SLEIGH,
  SNOWMEN,
  STREET_LAMPS,
  WORLD_RADIUS,
} from "@vila/shared/game/world";

import { villager } from "./gen/characters";
import { house } from "./gen/houses";
import { fence, lantern, logPile, mailbox, marketStall, panettoneStand, signpost, sled } from "./gen/props";
import { donationPanel } from "./gen/quest-items";
import { shop } from "./gen/shops";
import { bench, lamp, lotMarker, pine, reindeer, sleigh, snowman, tree, type Voxel } from "./models";
import { HOME_COLLIDERS, sceneColliders } from "./sceneColliders";
import { billboardFrame, chimneyOf, dressingModel, residence } from "./villageModels";

/** A voxel whose underside is below this height is at the avatar's legs, body or face: it must block. */
const MUST_BLOCK = 2;
/** The avatar is 2.7 u tall: anything lower than this may block (boughs, awnings, sign boards). */
const MAY_BLOCK = 2.7;
/** How far a solid voxel's centre may stick out of its collider. */
const BRUSH = 0.3;
/** How far a collider's outline may be from the nearest voxel. */
const SLACK = 0.35;
/** The sleigh's box also closes the 1 u notch between its two runner tips (too narrow to stand in). */
const NOTCH: Record<string, number> = { sleigh: 1 };

interface Drawn {
  name: string;
  voxels: Voxel[];
  size: number;
  x: number;
  z: number;
  y?: number;
  rot?: number;
}

const PROP = { "market-stall": marketStall, "panettone-stand": panettoneStand, lantern, fence, mailbox, signpost, sled, "log-pile": logPile } as const;

/** Everything solid in the scene (gifts, quest items and the pond are walkable on purpose). */
const SCENERY: Drawn[] = [
  { name: "tree", voxels: tree(), size: 1, x: 0, z: 0 },
  ...PINES.map((p, i) => ({ name: `pine-${i}`, voxels: pine(pineIsTall(i)), size: 1, ...pineAt(p) })).filter((p) => Math.hypot(p.x, p.z) < WORLD_RADIUS + 1),
  ...[...LAMPS, ...STREET_LAMPS].map(([x, z], i) => ({ name: `lamp-${i}`, voxels: lamp(), size: 0.5, x, z })),
  ...BENCHES.map((b, i) => ({ name: `bench-${i}`, voxels: bench(), size: 0.5, ...b })),
  ...SNOWMEN.map(([x, z, rot], i) => ({ name: `snowman-${i}`, voxels: snowman(), size: 0.4, x, z, rot })),
  { name: "sleigh", voxels: sleigh(), size: 0.5, ...SLEIGH },
  ...REINDEER.map((d, i) => ({ name: `reindeer-${i}`, voxels: reindeer(), size: 0.35, ...d })),
  ...PLACED_PROPS.flatMap((p) => {
    const m = PROP[p.kind](p.seed);
    return p.at.map((at, i) => ({ name: `${p.seed}-${i}`, voxels: m.voxels, size: m.size, ...at }));
  }),
  // The expanded village (IMPL-0024): shops with their billboard frame, and the dressing of the residential rows.
  ...SHOPS.flatMap((s) => [
    { name: s.id, voxels: shop(s.id).voxels, size: 1, x: s.x, z: s.z, rot: s.facing },
    { name: `${s.id}-frame`, voxels: billboardFrame(), size: 1, x: s.x, z: s.z },
  ]),
  ...RESIDENTIAL_DRESSING.map((part, i) => ({ name: `${part.kind}-${i}`, voxels: dressingModel(part.kind, part.length, part.thick), size: 0.5, x: part.x, z: part.z, rot: part.rot })),
];
/** The chalets of the residential plots, each with the footprint of its own generated model. */
const HOMES = RESIDENTIAL_PLOTS.map((plot) => ({ plot, model: residence(plot) }));
const HOME_SCENERY: Drawn[] = HOMES.map(({ plot, model }) => ({ name: `home-${plot.id}`, voxels: model.voxels, size: model.size, x: plot.house.x, z: plot.house.z, rot: plot.facing }));
const QUEST_SCENERY: Drawn[] = [
  ...NPCS.map((n) => {
    const m = villager(n.seed);
    return { name: n.id, voxels: m.voxels, size: m.size, x: n.x, z: n.z, rot: n.rot };
  }),
  (() => {
    const m = donationPanel("donation-panel");
    return { name: "lectern", voxels: m.voxels, size: m.size, x: DONATION_PANEL.x, z: DONATION_PANEL.z, rot: DONATION_PANEL.rot };
  })(),
];
const MARKERS: Drawn[] = LOTS.map((l) => ({ name: `marker-${l.id}`, voxels: lotMarker(), size: 1, x: l.x, z: l.z, rot: l.facing }));
const HOUSES: Drawn[] = LOTS.map((l) => ({ name: `house-${l.id}`, voxels: house(l.id).voxels, size: 1, x: l.x, z: l.z, rot: l.facing }));

/** Voxels of a drawn thing whose underside is below `height`, as centres in the thing's own frame. */
const below = (d: Drawn, height: number) => d.voxels.filter(([, y]) => y * d.size + (d.y ?? 0) < height).map(([x, , z]) => [x * d.size, z * d.size] as const);

/** Model-local point → world (three.js `rotation.y`). */
function toWorld(d: Drawn, lx: number, lz: number): [number, number] {
  const c = Math.cos(d.rot ?? 0), s = Math.sin(d.rot ?? 0);
  return [d.x + lx * c + lz * s, d.z - lx * s + lz * c];
}

/** Distance from a world point to the nearest voxel (as a square on the ground) of a drawn thing. */
function toVoxels(d: Drawn, cells: ReadonlyArray<readonly [number, number]>, px: number, pz: number): number {
  const c = Math.cos(d.rot ?? 0), s = Math.sin(d.rot ?? 0);
  const dx = px - d.x, dz = pz - d.z;
  const lx = dx * c - dz * s, lz = dx * s + dz * c;
  let best = Infinity;
  for (const [x, z] of cells) best = Math.min(best, Math.hypot(Math.max(Math.abs(lx - x) - d.size / 2, 0), Math.max(Math.abs(lz - z) - d.size / 2, 0)));
  return best;
}

/** Points on a collider's outline: the middle and ends of each side, and the corners. */
function outline(c: Collider): Array<[number, number]> {
  const ux = c.ux ?? 1, uz = c.uz ?? 0, hx = c.hx ?? 0, hz = c.hz ?? 0;
  const out: Array<[number, number]> = [];
  const add = (lx: number, lz: number) => out.push([c.x + lx * ux - lz * uz, c.z + lx * uz + lz * ux]);
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const nx = Math.cos(a), nz = Math.sin(a);
    add(Math.sign(Math.round(nx * 1e6)) * hx + nx * c.r, Math.sign(Math.round(nz * 1e6)) * hz + nz * c.r);
  }
  for (const side of [-1, 1])
    for (const t of [-0.5, 0, 0.5]) {
      add(t * hx, side * (hz + c.r));
      add(side * (hx + c.r), t * hz);
    }
  return out;
}

const nearest = (colliders: readonly Collider[], x: number, z: number) => Math.min(...colliders.map((c) => distanceTo(c, x, z)));

/** An audit of the whole village tries every voxel against every collider: 1 to 2 s on an idle laptop, 5.6 s on the CI runner (the default limit is 5 s). */
const WHOLE_VILLAGE = 30_000;

function audit(drawn: readonly Drawn[], colliders: readonly Collider[]) {
  const walkThrough: string[] = [];
  for (const d of drawn)
    for (const [lx, lz] of below(d, MUST_BLOCK)) {
      const [x, z] = toWorld(d, lx, lz);
      if (Math.hypot(x, z) > WORLD_RADIUS) continue;
      const out = nearest(colliders, x, z);
      if (out > BRUSH) walkThrough.push(`${d.name}: voxel at (${x.toFixed(2)}, ${z.toFixed(2)}) is ${out.toFixed(2)} outside every collider`);
    }
  const bumpable = drawn.map((d) => ({ d, cells: below(d, MAY_BLOCK) }));
  const invisible: string[] = [];
  for (const c of colliders)
    for (const [x, z] of outline(c)) {
      let gap = Infinity, owner = "";
      for (const { d, cells } of bumpable) {
        if (Math.hypot(d.x - x, d.z - z) > 12) continue;
        const g = toVoxels(d, cells, x, z);
        if (g < gap) (gap = g), (owner = d.name);
      }
      if (gap > (NOTCH[owner] ?? SLACK)) invisible.push(`collider at (${c.x.toFixed(2)}, ${c.z.toFixed(2)}): outline point (${x.toFixed(2)}, ${z.toFixed(2)}) is ${gap.toFixed(2)} from the nearest voxel (${owner})`);
    }
  return { walkThrough, invisible };
}

describe("collider audit (IMPL-0016)", () => {
  it("matches the static scenery, with quests off and available lots", () => {
    const colliders = [...OBSTACLES, ...LOTS.flatMap((l) => lotColliders(l, null))];
    expect(audit([...SCENERY, ...MARKERS], colliders)).toEqual({ walkThrough: [], invisible: [] });
    // The audit covers the expanded village: 4 shops, 24 street lamps and the 256 dressing parts are in it.
    expect(SCENERY.filter((d) => /^shop-\d+$/.test(d.name))).toHaveLength(SHOPS.length);
    expect(SCENERY.length).toBeGreaterThan(RESIDENTIAL_DRESSING.length + STREET_LAMPS.length + 40);
  }, WHOLE_VILLAGE);

  it("matches the chalet of every residential plot, alone and among its neighbours", () => {
    for (const { plot, model } of HOMES) expect(model.solid, plot.id).toBeDefined();
    const colliders = HOMES.flatMap(({ plot, model }) => plotColliders(plot, model.solid!));
    expect(audit(HOME_SCENERY, colliders)).toEqual({ walkThrough: [], invisible: [] });
    // With the dressing in between: the fillers close the gap between two chalets, nothing sticks out of either.
    const all = audit([...SCENERY, ...MARKERS, ...HOME_SCENERY], [...OBSTACLES, ...colliders, ...LOTS.flatMap((l) => lotColliders(l, null))]);
    expect(all).toEqual({ walkThrough: [], invisible: [] });
  }, WHOLE_VILLAGE);

  it("audits the very list the scene walks around (`sceneColliders`): nothing drawn is left without its collider", () => {
    // The scene (`Player`) takes its colliders from `sceneColliders`, so a kind of collider dropped from that
    // list (the chalets of the residential plots, say) fails here. Before, the scene built its own list and every
    // test passed with the 112 chalets walk-through.
    const none = sceneColliders(new Set(), false);
    expect(audit([...SCENERY, ...MARKERS, ...HOME_SCENERY], none)).toEqual({ walkThrough: [], invisible: [] });
    const everyLot = new Set(LOTS.map((l) => l.id));
    expect(audit([...SCENERY, ...HOUSES, ...HOME_SCENERY, ...QUEST_SCENERY], sceneColliders(everyLot, true))).toEqual({ walkThrough: [], invisible: [] });
    // One published chalet among markers, as in the review's scene.
    const one = new Set(["plaza-03"]);
    expect(audit([...SCENERY, ...MARKERS.filter((m) => m.name !== "marker-plaza-03"), ...HOUSES.filter((h) => h.name === "house-plaza-03"), ...HOME_SCENERY], sceneColliders(one, false))).toEqual({ walkThrough: [], invisible: [] });
    // What the list is made of: the static obstacles, five colliders per empty lot, and every residential chalet.
    expect(HOME_COLLIDERS.length).toBeGreaterThanOrEqual(RESIDENTIAL_PLOTS.length);
    expect(none).toHaveLength(OBSTACLES.length + 5 * LOTS.length + HOME_COLLIDERS.length);
    expect(sceneColliders(new Set(), true)).toHaveLength(none.length + QUEST_OBSTACLES.length);
    for (const home of HOME_COLLIDERS) expect(none).toContain(home);
  }, WHOLE_VILLAGE);

  it("keeps every residential chalet inside the envelope of its tier, low, with its chimney over its own walls", () => {
    for (const { plot, model } of HOMES) {
      const envelope = plotColliders(plot);
      for (const c of plotColliders(plot, model.solid!)) {
        const ux = c.ux ?? 1, uz = c.uz ?? 0, hx = c.hx ?? 0, hz = c.hz ?? 0;
        for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
          const x = c.x + a * hx * ux - b * hz * uz, z = c.z + a * hx * uz + b * hz * ux;
          expect(Math.min(...envelope.map((e) => distanceTo(e, x, z))), plot.id).toBeLessThan(0.02);
        }
      }
      // One floor and no A-frame: a row never hides the street behind it from the camera.
      expect(Math.max(...model.voxels.map((v) => v[1])), `${plot.id} height`).toBeLessThanOrEqual(9);
      // The chimney (where smoke will rise once a fireplace is lit) stands over the chalet's own walls, by its fireplace.
      const [cx, cy, cz] = chimneyOf(model, { x: plot.house.x, z: plot.house.z, rot: plot.facing });
      expect(distanceTo(envelope[0], cx, cz), `${plot.id} chimney`).toBeLessThan(0);
      expect(Math.hypot(cx - plot.hearth.x, cz - plot.hearth.z), `${plot.id} chimney by the fireplace`).toBeLessThan(3);
      expect(cy, `${plot.id} chimney top`).toBeGreaterThan(4);
    }
  });

  it("gives every shop the footprint the shared world blocks, and keeps its sign above every head", () => {
    for (const s of SHOPS) expect(shop(s.id).solid).toEqual(SHOP_SOLID.map((r) => [...r]));
    expect(Math.min(...billboardFrame().map((v) => v[1]))).toBeGreaterThanOrEqual(6);
  });

  it("matches the quest NPCs and the donation lectern while quests are on", () => {
    expect(audit(QUEST_SCENERY, QUEST_OBSTACLES)).toEqual({ walkThrough: [], invisible: [] });
  });

  it("matches the generated chalet of every lot", () => {
    for (const lot of LOTS) {
      const model = house(lot.id);
      const drawn = HOUSES.filter((h) => h.name === `house-${lot.id}`);
      expect(model.solid, lot.id).toBeDefined();
      expect(audit(drawn, lotColliders(lot, model.solid!)), lot.id).toEqual({ walkThrough: [], invisible: [] });
    }
  });

  it("keeps every generated chalet inside the envelope the shared tests plan against", () => {
    const inEnvelope = (x: number, z: number) => HOUSE_ENVELOPE.some(([x0, x1, z0, z1]) => x >= x0 && x <= x1 && z >= z0 && z <= z1);
    for (const lot of LOTS)
      for (const [x0, x1, z0, z1] of house(lot.id).solid!)
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) expect(inEnvelope(x, z), `${lot.id} (${x}, ${z})`).toBe(true);
  });
});
