import { describe, expect, it } from "vitest";

import { mulberry32 } from "../environment/random";
import { AVATAR_RADIUS, clearance, type Collider } from "./collision";
import { type Body, createBody, MOTION, STEP } from "./motion";
import { createNavField, createRoute, isOpen, NAV, type NavField, planRoute, releaseSearchScratch, type Route, searchScratchBytes, stepWalk } from "./navigation";
import {
  DONATION_PANEL,
  GIFTS,
  HOUSE_ENVELOPE,
  INTERACT_DISTANCE,
  BILLBOARDS,
  LOT_INTERACT_DISTANCE,
  lotColliders,
  lotFront,
  LOTS,
  NPCS,
  OBSTACLES,
  PLACE_INTERACT_DISTANCE,
  plotColliders,
  QUEST_INTERACTIONS,
  QUEST_OBSTACLES,
  QUEST_SPAWNS,
  RESIDENTIAL_PLOTS,
  SHOPS,
  SPAWN,
  TREE_KEEP_OUT,
  TREE_RADIUS,
  WORLD_RADIUS,
} from "./world";

/** The chalets of the residential plots (IMPL-0024): always drawn, here as the envelope of each tier. */
const HOMES = RESIDENTIAL_PLOTS.flatMap((p) => plotColliders(p));
/** The collider sets the client can be in: quests off (production today), quests on, every lot published. */
const SETS: Record<string, Collider[]> = {
  "quests off": [...OBSTACLES, ...HOMES, ...LOTS.flatMap((l) => lotColliders(l, null))],
  "quests on": [...OBSTACLES, ...HOMES, ...QUEST_OBSTACLES, ...LOTS.flatMap((l) => lotColliders(l, null))],
  "quests on, every lot a chalet": [...OBSTACLES, ...HOMES, ...QUEST_OBSTACLES, ...LOTS.flatMap((l) => lotColliders(l, HOUSE_ENVELOPE))],
};
const FIELDS: Record<string, NavField> = Object.fromEntries(Object.entries(SETS).map(([name, set]) => [name, createNavField(set)]));
const CONFIGS = Object.keys(SETS).map((name) => [name, SETS[name], FIELDS[name]] as const);
const [OFF, QUESTS] = [CONFIGS[0], CONFIGS[1]];

interface Walk {
  arrived: boolean;
  /** Ended without arriving (every replan used up). */
  gaveUp: boolean;
  seconds: number;
  /** Smallest room around the body during the walk (negative = overlapping a collider). */
  room: number;
  /** Distance from where the body stopped to the route's destination. */
  off: number;
}

/** Walks an already planned route to its end with the client's own step function. */
function follow(b: Body, route: Route, field: NavField, colliders: readonly Collider[], limit = 40): Walk {
  let room = Infinity, steps = 0, arrived = false, done = false;
  for (; steps < limit / STEP && !done; steps++) {
    const r = stepWalk(b, route, field, colliders);
    room = Math.min(room, clearance(colliders, b.x, b.z));
    done = r.targetDone;
    arrived = r.arrived;
  }
  return { arrived, gaveUp: done && !arrived, seconds: steps * STEP, room, off: Math.hypot(b.x - route.x, b.z - route.z) };
}

/** A click: plan from where the body is, then walk. */
function click(b: Body, route: Route, field: NavField, colliders: readonly Collider[], x: number, z: number): Walk {
  planRoute(field, route, b.x, b.z, x, z);
  return follow(b, route, field, colliders);
}

describe("planRoute + stepWalk (IMPL-0016)", () => {
  it("goes straight to a destination in plain sight, without searching", () => {
    const [, set, field] = OFF;
    const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
    planRoute(field, route, b.x, b.z, 5, 9);
    expect([route.count, route.expanded, route.direct]).toEqual([1, 0, false]);
    expect([route.x, route.z]).toEqual([5, 9]);
    const w = follow(b, route, field, set);
    expect(w.arrived).toBe(true);
    expect(w.off).toBeLessThan(MOTION.arriveEpsilon);
    expect(w.seconds).toBeLessThan(2);
  });

  /*
   * The defect behind "collisions are broken": on main, each of these clicks (chained, from the spawn) left
   * the avatar 10 to 20 u short, because a lamp post, a bench or the tree sat on the straight line and the
   * body gave up after 0.5 s against it. Positions are the quest NPC spots, with quests off.
   */
  it("reaches the three clicks that used to stop short, chained from the spawn", () => {
    const [, set, field] = OFF;
    const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
    for (const [x, z] of [[-6, 21.8], [-18.6, 0], [16.3, -10.4], [4.5, 11.8], [5, 4], [4.6, 6.4]]) {
      const from = Math.hypot(x - b.x, z - b.z);
      const w = click(b, route, field, set, x, z);
      const label = `to (${x}, ${z})`;
      expect([route.x, route.z], label).toEqual([x, z]);
      expect(w.arrived, label).toBe(true);
      expect(Math.hypot(b.x - x, b.z - z), label).toBeLessThan(MOTION.arriveEpsilon);
      expect([route.replans, route.direct], label).toEqual([0, false]);
      // No dithering: about the straight-line time, plus the detour and the ease in and out.
      expect(w.seconds, label).toBeLessThan((from * 1.35) / MOTION.maxSpeed + 1.5);
      expect(w.room, label).toBeGreaterThan(0);
    }
  });

  it.each(CONFIGS)("crosses the village around the tree, lamps, benches, props and lots (%s)", (_, set, field) => {
    const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
    const tour = [
      [9.5, -9.5], // across the tree
      [-10, 6],
      [0, 13.6], // just behind the lamp post south of the spawn
      [0, -15], // straight through the tree
      [-23, 0], // behind the market stalls, between the two fences
      [22.5, 5.5],
      [-28, -14], // on the south-west avenue, between two lots of the frontage
      [2, 22.8], // behind the sleigh and the reindeer
      [26, -12],
      [37.5, 6], // the premium street, behind the frontage
      [-53, 15.75], // the standard street, on the far side of the village
      [72, 30], // the far end of the economy street
      [0, -78], // the end of the northern lane, by the wood yard
      [SPAWN.x, SPAWN.z],
    ];
    for (const [x, z] of tour) {
      const w = click(b, route, field, set, x, z);
      const label = `to (${x}, ${z})`;
      expect(w.arrived, label).toBe(true);
      expect(w.off, label).toBeLessThan(MOTION.arriveEpsilon);
      expect(Math.hypot(b.x - x, b.z - z), label).toBeLessThan(0.6); // open ground, or right next to it
      expect([route.replans, route.direct], label).toEqual([0, false]);
      expect(w.room, label).toBeGreaterThan(0); // never touched anything on the way
    }
  });

  it("resolves a click on an obstacle to the spot right beside it, on the avatar's side", () => {
    const [, set, field] = QUESTS;
    const cases: Array<[string, number, number, number, number, (x: number, z: number) => boolean]> = [
      ["the tree, from the spawn", SPAWN.x, SPAWN.z, 0, 0, (x, z) => z > 4.5 && Math.abs(x) < 2],
      ["a pine, from the plaza", -4, -4, -10, -10, (x, z) => x > -10 && z > -10],
      ["a market stall, from the street", 15, 0, 20.5, 0, (x) => x < 19.5],
      ["an NPC, from the spawn", SPAWN.x, SPAWN.z, 5, 4, (x, z) => z > 4 && x < 5],
      ["the sleigh, from the street", -2, 16, -2, 20.2, (_, z) => z < 19],
      ["a shop, from the square", 5, 18, 5, 30.5, (_, z) => z < 27],
      ["firewood between two cottages, from their street", 66.5, -19.5, 72.5, -19.5, (x) => x < 70],
    ];
    for (const [label, sx, sz, tx, tz, near] of cases) {
      const b = createBody(sx, sz), route = createRoute();
      planRoute(field, route, sx, sz, tx, tz);
      expect(near(route.x, route.z), `${label}: destination (${route.x.toFixed(2)}, ${route.z.toFixed(2)})`).toBe(true);
      // Right beside it: the planning clearance away from touching, no farther.
      const room = clearance(set, route.x, route.z);
      expect(room, label).toBeGreaterThanOrEqual(NAV.clearance - 1e-9);
      expect(room, label).toBeLessThan(NAV.clearance + 0.05);
      const w = follow(b, route, field, set);
      expect(w.arrived, label).toBe(true);
      expect(w.off, label).toBeLessThan(MOTION.arriveEpsilon);
      expect(route.replans, label).toBe(0);
    }
  });

  it("resolves a click outside the world to the edge, or to the nearest walkable spot beside what blocks it", () => {
    const [, set, field] = OFF;
    const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
    let w = click(b, route, field, set, 100, 100);
    expect(Math.hypot(route.x, route.z)).toBeCloseTo(WORLD_RADIUS, 6);
    expect(route.x).toBeCloseTo(route.z, 6);
    expect(w.arrived).toBe(true);
    // West of the village a tall pine stands on the edge: the walk ends beside the pine, inside the world.
    w = click(b, route, field, set, -130, 14.5);
    expect(Math.hypot(route.x, route.z)).toBeLessThanOrEqual(WORLD_RADIUS);
    expect(isOpen(field, route.x, route.z)).toBe(true);
    expect(route.x).toBeLessThan(-70);
    expect(w.arrived).toBe(true);
    expect(w.off).toBeLessThan(MOTION.arriveEpsilon);
  });

  it("stops cleanly at the closest reachable point when the target cannot be reached", () => {
    // A closed ring of posts around open ground: the middle is free, but there is no way in.
    const ring: Collider[] = Array.from({ length: 16 }, (_, i) => ({ x: 18 + 4 * Math.cos((i * Math.PI) / 8), z: 4 * Math.sin((i * Math.PI) / 8), r: 1 }));
    const field = createNavField(ring);
    expect(isOpen(field, 18, 0)).toBe(true);
    expect(field.regionSizes.length).toBeGreaterThanOrEqual(2);
    const b = createBody(6, 9), route = createRoute();
    planRoute(field, route, b.x, b.z, 18, 0);
    // Outside the ring, on the avatar's side, as close to the target as the ring allows.
    const fromTarget = Math.hypot(route.x - 18, route.z);
    expect(fromTarget).toBeGreaterThan(4 + 1 + AVATAR_RADIUS);
    expect(fromTarget).toBeLessThan(4 + 1 + AVATAR_RADIUS + NAV.clearance + 0.3);
    expect(route.x).toBeLessThan(18);
    expect(route.direct).toBe(false);
    const w = follow(b, route, field, ring);
    expect(w.arrived).toBe(true); // arrived at the resolved destination: no pushing against the ring
    expect(w.room).toBeGreaterThan(0);
    expect(route.replans).toBe(0);
    for (let i = 0; i < 30; i++) stepWalk(b, route, field, ring);
    expect([b.vx, b.vz]).toEqual([0, 0]);
  });

  it("is deterministic: same clicks, same route, same trajectory", () => {
    const [, set, field] = QUESTS;
    const run = () => {
      const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
      const trace: number[] = [];
      for (const [x, z] of [[24.5, -2.5], [-18.6, 0], [0, 0], [-2.5, 28.5]]) {
        planRoute(field, route, b.x, b.z, x, z);
        trace.push(route.count, route.expanded, ...route.xs.slice(0, route.count), ...route.zs.slice(0, route.count));
        for (let i = 0; i < 20 / STEP; i++) {
          const r = stepWalk(b, route, field, set);
          trace.push(b.x, b.z, b.yaw);
          if (r.targetDone) break;
        }
      }
      return trace;
    };
    const a = run();
    expect(a.length).toBeGreaterThan(2000);
    expect(run()).toEqual(a);
  });

  it("plans within a bounded number of grid nodes, and only on a click", () => {
    // Around the square, then the far corners of the village: plot fronts on opposite sides, the wood yard, the edge.
    const far = [RESIDENTIAL_PLOTS[0], RESIDENTIAL_PLOTS[RESIDENTIAL_PLOTS.length - 1], RESIDENTIAL_PLOTS[RESIDENTIAL_PLOTS.length - 30], RESIDENTIAL_PLOTS[30]].map((p) => [p.front.x, p.front.z]);
    const spots = [[SPAWN.x, SPAWN.z], [-23, 0], [2, 22.8], [22.5, 5.5], [-28, -14], [26, -12], [0, -15], [-33, 6], [14, 30], [0, 0], [30.5, 5], [20.5, 0], ...far, [0, -78], [-58, 58]];
    for (const [name, set, field] of CONFIGS) {
      // The search space is the walkable region of the 0.25 u grid over the 82.5 u disc: at most 342 000 cells.
      expect(field.walkable, name).toBeGreaterThan(150000);
      expect(field.walkable, name).toBeLessThan(Math.PI * (WORLD_RADIUS / NAV.cell) ** 2);
      let worst = 0;
      const route = createRoute();
      for (const [sx, sz] of spots)
        for (const [tx, tz] of spots) {
          planRoute(field, route, sx, sz, tx, tz);
          worst = Math.max(worst, route.expanded);
          expect(route.expanded, `${name} (${sx}, ${sz}) → (${tx}, ${tz})`).toBeLessThanOrEqual(field.walkable);
          expect(route.count, `${name} waypoints`).toBeLessThan(40);
        }
      // In practice a fraction of the bound: the hardest of these 324 plans (every pair of the 18 spots above)
      // stays under 60 000 expansions (measured: 31 124). The next test draws the pairs at random.
      expect(worst, name).toBeGreaterThan(0);
      expect(worst, name).toBeLessThan(60000);
      // Walking never plans: the expansion count of the route is untouched by a whole walk.
      const b = createBody(SPAWN.x, SPAWN.z);
      planRoute(field, route, b.x, b.z, 26, -12);
      const planned = route.expanded;
      expect(follow(b, route, field, set).arrived, name).toBe(true);
      expect([route.expanded, route.replans], name).toEqual([planned, 0]);
    }
  });

  it("stays within the bound for a seeded random sample of pairs across the village", () => {
    // The fixed spots above are places people go; a click can land anywhere. 3 000 pairs of open points drawn
    // with `mulberry32(40)` over the whole disc, every lot a chalet and the quests on (the fewest walkable cells,
    // the most detours). Measured: the hardest pair expands 72 464 cells, about a third of the walkable region
    // (in a sample of 18 000 pairs with `mulberry32(2026)`, 82 895). IMPL-0024 has the times.
    const [name, , field] = CONFIGS[2];
    const random = mulberry32(40);
    const point = (): [number, number] => {
      for (;;) {
        const x = (random() * 2 - 1) * WORLD_RADIUS, z = (random() * 2 - 1) * WORLD_RADIUS;
        if (isOpen(field, x, z)) return [x, z];
      }
    };
    const route = createRoute();
    let worst = 0, longest = 0;
    for (let i = 0; i < 3000; i++) {
      const [sx, sz] = point(), [tx, tz] = point();
      planRoute(field, route, sx, sz, tx, tz);
      // Open ground is always reached, exactly, by a planned route.
      if (route.direct || route.x !== tx || route.z !== tz) expect.fail(`${name}: (${sx}, ${sz}) → (${tx}, ${tz}) was not planned to its end`);
      worst = Math.max(worst, route.expanded);
      longest = Math.max(longest, route.count);
    }
    expect(worst).toBeGreaterThan(60000);
    expect(worst).toBeLessThan(100000);
    expect(worst).toBeLessThan(field.walkable / 2);
    expect(longest).toBeLessThan(40);
  }, 30_000);

  it("allocates the search scratch on the first search that needs it, small, and gives it back when asked", () => {
    const [, , field] = CONFIGS[2];
    const route = createRoute();
    const far = RESIDENTIAL_PLOTS[RESIDENTIAL_PLOTS.length - 30].front;
    const plan = () => {
      planRoute(field, route, SPAWN.x, SPAWN.z, far.x, far.z);
      return [route.count, route.expanded, ...route.xs.slice(0, route.count), ...route.zs.slice(0, route.count)];
    };
    const before = plan();
    releaseSearchScratch();
    expect(searchScratchBytes()).toBe(0);
    // A destination in plain sight is one line-of-sight test: no search, no scratch.
    planRoute(field, route, SPAWN.x, SPAWN.z, SPAWN.x + 2, SPAWN.z + 2);
    expect([route.expanded, searchScratchBytes()]).toEqual([0, 0]);
    // The same walk planned on a fresh scratch is the same walk.
    expect(plan()).toEqual(before);
    // 10 bytes a cell over the grid, plus an open list and a path that grew with this search: under 5 MB
    // (the first version of the expanded village kept 24 bytes a cell: 10.5 MB).
    const cells = (2 * Math.ceil(WORLD_RADIUS / NAV.cell) + 1) ** 2;
    expect(searchScratchBytes()).toBeGreaterThanOrEqual(10 * cells);
    expect(searchScratchBytes()).toBeLessThan(5 * 1024 * 1024);
    // More than 255 searches in a row (the visit mark is one byte and starts over): still the same walk.
    for (let i = 0; i < 300; i++) planRoute(field, route, SPAWN.x, SPAWN.z, -23, 0);
    expect(route.expanded).toBeGreaterThan(0);
    expect(plan()).toEqual(before);
  }, 20_000);

  it("does nothing but brake while idle or paused, and resumes the same route", () => {
    const [, set, field] = OFF;
    const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
    // Idle: no route, no field needed, no movement.
    expect(stepWalk(b, route, null, set)).toEqual({ step: false, targetDone: false, arrived: false });
    expect([b.x, b.z]).toEqual([SPAWN.x, SPAWN.z]);
    planRoute(field, route, b.x, b.z, -18.6, 0);
    for (let i = 0; i < 60; i++) stepWalk(b, route, field, set);
    // An open panel pauses the walk (`null`): the body brakes to a stop and the route is kept.
    for (let i = 0; i < 60; i++) expect(stepWalk(b, null, field, set).targetDone).toBe(false);
    expect([b.vx, b.vz]).toEqual([0, 0]);
    expect(route.active).toBe(true);
    const w = follow(b, route, field, set);
    expect(w.arrived).toBe(true);
    expect(Math.hypot(b.x + 18.6, b.z)).toBeLessThan(MOTION.arriveEpsilon);
    expect(route.active).toBe(false);
  });

  it("leads a body out of a slot too narrow to plan through", () => {
    // Two walls 1.3 u apart: the body fits (0.9 u) but the planning clearance does not, so no walkable cell
    // is in sight from the middle of the slot. The route starts with the way out, cell by cell.
    const slot: Collider[] = [lotColliders(LOTS[0], [[-4, 4, 0.65, 3]])[0], lotColliders(LOTS[0], [[-4, 4, -3, -0.65]])[0]];
    const field = createNavField(slot);
    const b = createBody(LOTS[0].x, LOTS[0].z), route = createRoute();
    expect(isOpen(field, b.x, b.z)).toBe(false);
    expect(clearance(slot, b.x, b.z)).toBeGreaterThan(0.15);
    planRoute(field, route, b.x, b.z, SPAWN.x, SPAWN.z);
    expect(route.direct).toBe(false);
    expect(route.count).toBeGreaterThan(3);
    // The first waypoint is still inside the slot, a short hop from the body.
    expect(isOpen(field, route.xs[0], route.zs[0])).toBe(false);
    expect(Math.hypot(route.xs[0] - b.x, route.zs[0] - b.z)).toBeLessThan(NAV.lenient + NAV.cell);
    const w = follow(b, route, field, slot);
    expect(w.arrived).toBe(true);
    expect(route.replans).toBe(0);
    expect(Math.hypot(b.x - SPAWN.x, b.z - SPAWN.z)).toBeLessThan(MOTION.arriveEpsilon);
  });

  it("replans instead of giving up when the body is knocked off its route", () => {
    const wall: Collider[] = [lotColliders(LOTS[0], HOUSE_ENVELOPE)[0]];
    const field = createNavField(wall);
    const lot = LOTS[0];
    // From the plaza side to behind the chalet; halfway, drop the body against the wall, facing a waypoint
    // on the far side (as if something had pushed it there).
    const b = createBody(lot.x * 0.6, lot.z * 0.6), route = createRoute();
    planRoute(field, route, b.x, b.z, lot.x * 1.4, lot.z * 1.4);
    expect(route.count).toBeGreaterThan(1);
    route.index = route.count - 1;
    const w = follow(b, route, field, wall);
    expect(w.arrived).toBe(true);
    expect(route.replans).toBe(1);
    expect(w.off).toBeLessThan(MOTION.arriveEpsilon);
  });
});

describe("collider table invariants (IMPL-0016)", () => {
  it.each(CONFIGS)("keeps the spawn, the gifts and the quest pickups on open ground (%s)", (_, set, field) => {
    for (const p of [{ id: "spawn", ...SPAWN }, ...GIFTS, ...QUEST_SPAWNS]) {
      expect(clearance(set, p.x, p.z), p.id).toBeGreaterThanOrEqual(NAV.clearance);
      expect(isOpen(field, p.x, p.z), p.id).toBe(true);
      // Reachable from the spawn, exactly: a gift or pickup is collected by walking onto it.
      const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
      const w = click(b, route, field, set, p.x, p.z);
      expect([route.x, route.z], p.id).toEqual([p.x, p.z]);
      expect(w.arrived, p.id).toBe(true);
    }
  });

  it.each(CONFIGS)("lets the avatar walk up to every interaction target (%s)", (name, set, field) => {
    const approach = (x: number, z: number) => {
      const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
      const w = click(b, route, field, set, x, z);
      expect(w.arrived, `${name}: walk to (${x}, ${z})`).toBe(true);
      return Math.hypot(b.x - x, b.z - z);
    };
    // The tree: the action button shows within TREE_RADIUS + INTERACT_DISTANCE of its axis.
    expect(approach(0, 0)).toBeLessThan(TREE_KEEP_OUT + 0.6);
    expect(TREE_KEEP_OUT + 0.6).toBeLessThan(TREE_RADIUS + INTERACT_DISTANCE - 1);
    // Lots: from the front (the "Ir até lá" point of the Explore panel) and by clicking the lot itself.
    for (const lot of LOTS) {
      const front = (() => {
        const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
        const at = lotFront(lot);
        expect(click(b, route, field, set, at.x, at.z).arrived, lot.id).toBe(true);
        return Math.hypot(b.x - lot.x, b.z - lot.z);
      })();
      expect(front, `${lot.id} from the front`).toBeLessThan(LOT_INTERACT_DISTANCE - 0.5);
      expect(approach(lot.x, lot.z), `${lot.id} clicked`).toBeLessThan(LOT_INTERACT_DISTANCE - 0.5);
    }
    // Shops, billboards and residential plots (IMPL-0024): the avatar reaches the very point each one is used from.
    for (const shop of SHOPS) expect(approach(shop.door.x, shop.door.z), shop.id).toBeLessThan(PLACE_INTERACT_DISTANCE - 2.5);
    for (const sign of BILLBOARDS) expect(approach(sign.point.x, sign.point.z), sign.id).toBeLessThan(PLACE_INTERACT_DISTANCE - 2.5);
    for (const plot of RESIDENTIAL_PLOTS) {
      expect(approach(plot.front.x, plot.front.z), plot.id).toBeLessThan(PLACE_INTERACT_DISTANCE - 2.5);
      // A click on the chalet itself ends right beside it, on the plot or at its edge.
      const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
      expect(click(b, route, field, set, plot.house.x, plot.house.z).arrived, plot.id).toBe(true);
      expect(Math.hypot(b.x - plot.x, b.z - plot.z), `${plot.id} chalet clicked`).toBeLessThan(Math.hypot(plot.width, plot.depth) / 2 + 1);
    }
    // Quest NPCs, the lectern, the mailbox and the sled (the last two are scenery even with quests off).
    for (const n of NPCS) expect(approach(n.x, n.z), n.id).toBeLessThan(INTERACT_DISTANCE - 2.5);
    expect(approach(DONATION_PANEL.x, DONATION_PANEL.z), "lectern").toBeLessThan(INTERACT_DISTANCE - 2.5);
    for (const i of QUEST_INTERACTIONS) expect(approach(i.x, i.z), i.id).toBeLessThan(i.radius - 1.5);
  });

  it.each(CONFIGS)("has no enclosed pocket: all the open ground is one region (%s)", (_, __, field) => {
    const stray = field.regionSizes.filter((_size, id) => id !== field.main);
    // What is left are single grid cells in the crook between two colliders: too small to stand in.
    expect(Math.max(0, ...stray)).toBeLessThanOrEqual(2);
    expect(stray.reduce((a, n) => a + n, 0)).toBeLessThanOrEqual(12);
  });

  /** Cells the body can physically reach from the spawn (touching allowed), on the planning grid's pitch. */
  function reachable(colliders: readonly Collider[]): (x: number, z: number) => boolean {
    const half = Math.ceil(WORLD_RADIUS / NAV.cell), side = 2 * half + 1;
    const cellOf = (x: number, z: number) => Math.round(z / NAV.cell + half) * side + Math.round(x / NAV.cell + half);
    const state = new Uint8Array(side * side);
    const queue = [cellOf(SPAWN.x, SPAWN.z)];
    state[queue[0]] = 1;
    for (let head = 0; head < queue.length; head++) {
      const ix = queue[head] % side, iz = Math.floor(queue[head] / side);
      for (const [dx, dz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nx = ix + dx, nz = iz + dz;
        if (nx < 0 || nz < 0 || nx >= side || nz >= side || state[nz * side + nx]) continue;
        const x = (nx - half) * NAV.cell, z = (nz - half) * NAV.cell;
        const free = Math.hypot(x, z) <= WORLD_RADIUS && clearance(colliders, x, z) >= 0;
        state[nz * side + nx] = free ? 1 : 2;
        if (free) queue.push(nz * side + nx);
      }
    }
    return (x, z) => state[cellOf(x, z)] === 1;
  }

  /** Spots where the body touches a collider: all around each one, skipping those inside a neighbour. */
  function touching(colliders: readonly Collider[]): Array<[number, number]> {
    const out: Array<[number, number]> = [];
    for (const c of colliders) {
      const ux = c.ux ?? 1, uz = c.uz ?? 0, hx = c.hx ?? 0, hz = c.hz ?? 0, r = c.r + AVATAR_RADIUS + 5e-4;
      const add = (lx: number, lz: number) => {
        const x = c.x + lx * ux - lz * uz, z = c.z + lx * uz + lz * ux;
        if (Math.hypot(x, z) <= WORLD_RADIUS && clearance(colliders, x, z) >= 0) out.push([x, z]);
      };
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2 + 0.1;
        add(Math.sign(Math.cos(a)) * hx + Math.cos(a) * r, Math.sign(Math.sin(a)) * hz + Math.sin(a) * r);
      }
      for (const s of [-1, 1])
        for (const t of [-0.6, 0, 0.6]) {
          if (hx > 0) add(t * hx, s * (hz + r));
          if (hz > 0) add(s * (hx + r), t * hz);
        }
    }
    return out;
  }

  it.each(CONFIGS)(
    "never traps the avatar: pressed against any collider it can reach, a walk still gets away (%s)",
    (name, set, field) => {
      const can = reachable(set);
      // Every spot around the square, as before the village grew; beyond it the rows repeat the same few
      // shapes on every side, so one spot in three is walked (IMPL-0024).
      const starts = touching(set).filter(([x, z]) => can(x, z)).filter(([x, z], i) => Math.hypot(x, z) < 34 || i % 3 === 0);
      expect(starts.length, name).toBeGreaterThan(1500);
      const route = createRoute();
      const stuck: string[] = [];
      for (const [x, z] of starts) {
        const b = createBody(x, z);
        // Walk to the spawn, or to the far side of the plaza when already next to it.
        const far = Math.hypot(x - SPAWN.x, z - SPAWN.z) < 6 ? { x: -SPAWN.x, z: -SPAWN.z - 4 } : SPAWN;
        const w = click(b, route, field, set, far.x, far.z);
        if (!w.arrived || w.off > MOTION.arriveEpsilon || route.direct || route.replans > 0) stuck.push(`from (${x.toFixed(2)}, ${z.toFixed(2)}): arrived ${w.arrived}, direct ${route.direct}, replans ${route.replans}`);
      }
      expect(stuck, name).toEqual([]);
    },
    30000
  );

  it.each(CONFIGS)("survives a long run of random clicks, some of them mid-walk (%s)", (name, set, field) => {
    const rnd = mulberry32(0xc011de);
    const b = createBody(SPAWN.x, SPAWN.z), route = createRoute();
    let walked = 0;
    for (let n = 0; n < 150; n++) {
      // Anywhere on the clickable ground: on obstacles, on lots, and up to 3 u outside the world.
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (WORLD_RADIUS + 3);
      const x = r * Math.cos(a), z = r * Math.sin(a);
      planRoute(field, route, b.x, b.z, x, z);
      const label = `${name} click ${n} to (${x.toFixed(2)}, ${z.toFixed(2)})`;
      expect(route.direct, label).toBe(false);
      expect(isOpen(field, route.x, route.z), label).toBe(true);
      const length = Math.hypot(route.xs[0] - b.x, route.zs[0] - b.z) + route.rest[0];
      const interrupted = rnd() < 0.3; // a new click half a second into the walk
      let done = false, arrived = false, steps = 0;
      for (; steps < (interrupted ? 30 : 40 / STEP) && !done; steps++) {
        const s = stepWalk(b, route, field, set);
        expect(clearance(set, b.x, b.z), label).toBeGreaterThan(-0.011);
        done = s.targetDone;
        arrived = s.arrived;
      }
      if (interrupted && !done) continue;
      expect(arrived, label).toBe(true);
      expect(Math.hypot(b.x - route.x, b.z - route.z), label).toBeLessThan(MOTION.arriveEpsilon);
      expect(route.replans, label).toBe(0);
      // No dithering or doubling back: the planned length at walking pace, plus easing in, out and at turns.
      expect(steps * STEP, label).toBeLessThan((length * 1.15) / MOTION.maxSpeed + 1.5);
      walked++;
    }
    expect(walked).toBeGreaterThan(80);
  });
});
