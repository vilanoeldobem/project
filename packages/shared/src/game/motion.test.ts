import { describe, expect, it } from "vitest";

import { clearance, distanceTo, footprint } from "./collision";
import { createBody, type Intent, MOTION, STEP, stepBody } from "./motion";
import { createNavField, createRoute, planRoute, stepWalk } from "./navigation";
import {
  DONATION_PANEL,
  LOTS,
  NPCS,
  OBSTACLES,
  POND,
  QUEST_INTERACTIONS,
  QUEST_OBSTACLES,
  QUEST_SPAWNS,
  SLEIGH,
  surfaceAt,
  TREE_RADIUS,
  WORLD_RADIUS,
} from "./world";

const idle: Intent = { moveX: 0, moveZ: 0, target: null };
const run = (b: ReturnType<typeof createBody>, intent: Intent, seconds: number, colliders = OBSTACLES) => {
  const steps = Math.round(seconds / STEP);
  let footsteps = 0, done = false;
  for (let i = 0; i < steps; i++) {
    const r = stepBody(b, intent, colliders);
    if (r.step) footsteps++;
    if (r.targetDone) done = true;
  }
  return { footsteps, done };
};

describe("stepBody", () => {
  it("accelerates smoothly to top speed and brakes to a full stop", () => {
    const b = createBody(0, 9);
    stepBody(b, { ...idle, moveX: 1 }, []);
    expect(Math.hypot(b.vx, b.vz)).toBeGreaterThan(0);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThan(MOTION.maxSpeed * 0.5);
    run(b, { ...idle, moveX: 1 }, 0.6, []);
    expect(Math.hypot(b.vx, b.vz)).toBeCloseTo(MOTION.maxSpeed, 0);
    run(b, idle, 0.6, []);
    expect(b.vx).toBe(0);
    expect(b.vz).toBe(0);
  });

  it("normalises diagonal input (no faster diagonals)", () => {
    const b = createBody(0, 9);
    run(b, { ...idle, moveX: 1, moveZ: 1 }, 1, []);
    expect(Math.hypot(b.vx, b.vz)).toBeLessThanOrEqual(MOTION.maxSpeed + 1e-9);
  });

  it("arrives at a click target without overshooting and reports it", () => {
    const b = createBody(0, 9);
    const target = { x: 5, z: 9 };
    const { done } = run(b, { ...idle, target }, 3, []);
    expect(done).toBe(true);
    expect(Math.hypot(b.x - 5, b.z - 9)).toBeLessThan(MOTION.arriveEpsilon + 0.05);
    expect(b.x).toBeLessThanOrEqual(5 + 0.05);
  });

  it("never ends inside an obstacle and slides along it", () => {
    const wall = [{ x: 3, z: 0, r: 1 }];
    const b = createBody(0, 0.3);
    run(b, { ...idle, moveX: 1 }, 2, wall);
    expect(Math.hypot(b.x - 3, b.z)).toBeGreaterThanOrEqual(1 + MOTION.radius - 1e-6);
    expect(b.x).toBeGreaterThan(3); // slid around it instead of sticking
  });

  // The last resort: steered straight at a point it cannot reach (no route), the body gives up after
  // `stuckTime`. Clicks no longer end up here: `navigation.ts` resolves and routes them (IMPL-0016).
  it("abandons a target behind an obstacle it cannot pass, without claiming it arrived", () => {
    const wall = [{ x: 3, z: 0, r: 1 }];
    const b = createBody(0, 0);
    let last = stepBody(b, { ...idle, target: { x: 3, z: 0 } }, wall);
    for (let i = 0; i < 180 && !last.targetDone; i++) last = stepBody(b, { ...idle, target: { x: 3, z: 0 } }, wall);
    expect(last.targetDone).toBe(true);
    expect(last.arrived).toBe(false);
  });

  it("keeps its pace through a waypoint and eases only into the final destination", () => {
    const b = createBody(0, 9);
    // A waypoint with 10 u of path left after it: no slow-down, and never "arrived".
    const { done } = run(b, { ...idle, target: { x: 3, z: 9, rest: 10 } }, 0.33, []);
    expect(done).toBe(false);
    expect(b.x).toBeGreaterThan(1.4);
    expect(Math.hypot(b.vx, b.vz)).toBeGreaterThan(MOTION.maxSpeed * 0.9);
    const c = createBody(0, 9);
    run(c, { ...idle, target: { x: 3, z: 9 } }, 0.33, []);
    expect(Math.hypot(c.vx, c.vz)).toBeLessThan(Math.hypot(b.vx, b.vz));
  });

  it("is pushed out of a box and slides along its side", () => {
    const wall = [footprint({ x: 3, z: 0, rot: 0.5 }, -0.5, 0.5, -3, 3)];
    const b = createBody(0, 0.4);
    run(b, { ...idle, moveX: 1 }, 2.5, wall);
    expect(distanceTo(wall[0], b.x, b.z)).toBeGreaterThanOrEqual(MOTION.radius - 1e-6);
    expect(b.x).toBeGreaterThan(3.5); // slid around it instead of sticking
  });

  // The old single push-out pass let the body through any gap it was pressed into (each collider pushed it
  // into the other, and it crept forward): between a bench and its lamp post, a stall and an NPC, …
  it("is never squeezed through a gap narrower than itself, and rests there without jitter", () => {
    const wall = footprint({ x: 20, z: -5 }, -10, 10, -5, 5); // blocks z <= 0 for x in 10..30
    for (const gap of [0.7, 0.8, 0.88]) {
      const post = { x: 20, z: gap + 0.5, r: 0.5 };
      for (const colliders of [[wall, post], [post, wall]])
        for (const press of [0, -0.3, -1]) {
          const label = `gap ${gap}, press ${press}, ${colliders[0] === wall ? "wall first" : "post first"}`;
          const b = createBody(14, 0.46);
          const intent = { ...idle, moveX: 1, moveZ: press }; // along the wall, into the gap
          run(b, intent, 4, colliders);
          expect(b.x, label).toBeLessThan(20);
          const at = [b.x, b.z];
          let wobble = 0;
          for (let i = 0; i < 120; i++) {
            stepBody(b, intent, colliders);
            wobble = Math.max(wobble, Math.hypot(b.x - at[0], b.z - at[1]));
          }
          expect(wobble, label).toBeLessThan(1e-3);
          expect(clearance(colliders, b.x, b.z), label).toBeGreaterThan(-0.011);
        }
    }
    // A gap it fits through stays open.
    const b = createBody(14, 0.46);
    run(b, { ...idle, moveX: 1, moveZ: -0.3 }, 4, [wall, { x: 20, z: 1.5, r: 0.5 }]);
    expect(b.x).toBeGreaterThan(21);
  });

  it("stays inside the world", () => {
    const b = createBody(0, 0);
    run(b, { ...idle, moveZ: 1 }, 10, []);
    expect(Math.hypot(b.x, b.z)).toBeLessThanOrEqual(WORLD_RADIUS + 1e-9);
  });

  it("emits one footstep per stride", () => {
    const b = createBody(0, 9);
    const { footsteps } = run(b, { ...idle, moveX: -1 }, 1, []);
    // Straight line from x = 0, nothing in the way: walked distance = |x|.
    expect(footsteps).toBe(Math.floor(Math.abs(b.x) / MOTION.stride));
    expect(footsteps).toBeGreaterThan(5);
  });

  it("is deterministic", () => {
    const a = createBody(0, 9), c = createBody(0, 9);
    const intents: Intent[] = [{ ...idle, moveX: 1 }, { ...idle, target: { x: -8, z: -2 } }, idle];
    for (const i of intents) {
      run(a, i, 0.7);
      run(c, i, 0.7);
    }
    expect([a.x, a.z, a.yaw]).toEqual([c.x, c.z, c.yaw]);
  });
});

describe("world helpers", () => {
  it("keeps every gift and the spawn clear of obstacles", async () => {
    const { GIFTS, SPAWN } = await import("./world");
    for (const p of [...GIFTS, SPAWN]) expect(clearance(OBSTACLES, p.x, p.z)).toBeGreaterThan(0);
  });

  // Was a straight line that got past the villager and the dog only by squeezing between them (a gap
  // narrower than the body); a click is now a planned route.
  it("walks around the tree to a gift on the other side (click across the plaza)", async () => {
    const { GIFTS } = await import("./world");
    const from = GIFTS.find((g) => g.id === "gift-bench")!, to = GIFTS.find((g) => g.id === "gift-palm")!;
    const b = createBody(from.x, from.z);
    const field = createNavField(OBSTACLES), route = createRoute();
    planRoute(field, route, b.x, b.z, to.x, to.z);
    let arrived = false;
    for (let i = 0; i < 6 / STEP && !arrived; i++) arrived = stepWalk(b, route, field, OBSTACLES).arrived;
    expect(arrived).toBe(true);
    expect(Math.hypot(b.x - to.x, b.z - to.z)).toBeLessThan(MOTION.arriveEpsilon);
  });

  it("keeps placed props off lots (house up to 5 u), the pond and the sleigh", async () => {
    const { LOTS, PLACED_PROPS, POND, SLEIGH } = await import("./world");
    for (const p of PLACED_PROPS)
      for (const { x, z } of p.at) {
        for (const l of LOTS) expect(Math.hypot(x - l.x, z - l.z), `${p.seed} vs ${l.id}`).toBeGreaterThan(5.5);
        expect(Math.hypot(x - POND.x, z - POND.z)).toBeGreaterThan(POND.radius + 1);
        expect(Math.hypot(x - SLEIGH.x, z - SLEIGH.z)).toBeGreaterThan(5);
      }
  });

  it("classifies ground surfaces", () => {
    expect(surfaceAt(0, 6)).toBe("stone");
    expect(surfaceAt(0, 15)).toBe("packed");
    expect(surfaceAt(0, 25)).toBe("snow");
    expect(surfaceAt(28.5, -4)).toBe("ice");
  });
});

describe("quest placements (PROPOSTA quests-v1)", () => {
  it("keeps the quest colliders out of OBSTACLES (quests off: nothing invisible blocks the avatar)", () => {
    const at = (list: typeof OBSTACLES, x: number, z: number) => list.filter((o) => o.x === x && o.z === z);
    for (const { id, x, z } of NPCS) {
      expect(at(OBSTACLES, x, z), `${id} in OBSTACLES`).toEqual([]);
      // A villager's footprint (IMPL-0016): 1.5 u across the arms, 0.9 u deep, turned with the NPC.
      expect(at(QUEST_OBSTACLES, x, z), `${id} in QUEST_OBSTACLES`).toHaveLength(1);
      expect(at(QUEST_OBSTACLES, x, z)[0], `${id} footprint`).toMatchObject({ r: 0.45, hx: 0.3, hz: 0 });
      // With quests off the spot where the NPC would stand is open ground.
      expect(clearance(OBSTACLES, x, z), `${id} spot with quests off`).toBeGreaterThan(0);
    }
    expect(at(OBSTACLES, DONATION_PANEL.x, DONATION_PANEL.z), "lectern in OBSTACLES").toEqual([]);
    expect(at(QUEST_OBSTACLES, DONATION_PANEL.x, DONATION_PANEL.z), "lectern in QUEST_OBSTACLES").toEqual([{ x: DONATION_PANEL.x, z: DONATION_PANEL.z, r: DONATION_PANEL.r }]);
    expect(clearance(OBSTACLES, DONATION_PANEL.x, DONATION_PANEL.z), "lectern spot with quests off").toBeGreaterThan(0);
    expect(QUEST_OBSTACLES).toHaveLength(NPCS.length + 1);
  });

  it("keeps every NPC clear of the pre-existing scenery, lots, pond and each other", () => {
    for (const { id, x, z } of NPCS) {
      // Room for an avatar plus 0.3 u between the NPC's centre and every piece of scenery.
      expect(clearance(OBSTACLES, x, z), `${id} obstacles`).toBeGreaterThanOrEqual(0.3 - 1e-9);
      for (const l of LOTS) expect(Math.hypot(x - l.x, z - l.z), `${id} vs ${l.id}`).toBeGreaterThan(5.5);
      expect(Math.hypot(x - POND.x, z - POND.z), `${id} pond`).toBeGreaterThan(POND.radius + 1);
      expect(Math.hypot(x, z), `${id} tree`).toBeGreaterThan(TREE_RADIUS);
      expect(Math.hypot(x, z), `${id} world`).toBeLessThan(WORLD_RADIUS);
      expect(Math.hypot(x - DONATION_PANEL.x, z - DONATION_PANEL.z), `${id} lectern`).toBeGreaterThan(DONATION_PANEL.r + MOTION.radius);
    }
    for (const a of NPCS) for (const b of NPCS) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id}/${b.id}`).toBeGreaterThan(2);
  });

  it("keeps every quest spawn reachable and off lots, pond, tree and scenery", () => {
    expect(new Set(QUEST_SPAWNS.map((s) => s.id)).size).toBe(QUEST_SPAWNS.length);
    for (const { id, x, z } of QUEST_SPAWNS) {
      expect(clearance([...OBSTACLES, ...QUEST_OBSTACLES], x, z), `${id} obstacles`).toBeGreaterThanOrEqual(0.25);
      for (const l of LOTS) expect(Math.hypot(x - l.x, z - l.z), `${id} vs ${l.id}`).toBeGreaterThan(5.5);
      expect(Math.hypot(x - POND.x, z - POND.z), `${id} pond`).toBeGreaterThan(POND.radius + 1);
      expect(Math.hypot(x, z), `${id} tree`).toBeGreaterThan(TREE_RADIUS);
      expect(Math.hypot(x, z), `${id} world`).toBeLessThan(WORLD_RADIUS);
    }
  });

  it("places the donation lectern clear of props, lots, sleigh, pond and NPCs", () => {
    const others = [...OBSTACLES, ...QUEST_OBSTACLES].filter((o) => o.x !== DONATION_PANEL.x || o.z !== DONATION_PANEL.z);
    expect(clearance(others, DONATION_PANEL.x, DONATION_PANEL.z), "lectern obstacles").toBeGreaterThan(0);
    for (const l of LOTS) expect(Math.hypot(DONATION_PANEL.x - l.x, DONATION_PANEL.z - l.z), `lectern vs ${l.id}`).toBeGreaterThan(5.5);
    expect(Math.hypot(DONATION_PANEL.x - SLEIGH.x, DONATION_PANEL.z - SLEIGH.z), "lectern sleigh").toBeGreaterThan(5);
    expect(Math.hypot(DONATION_PANEL.x - POND.x, DONATION_PANEL.z - POND.z), "lectern pond").toBeGreaterThan(POND.radius + 1);
    for (const n of NPCS) expect(Math.hypot(DONATION_PANEL.x - n.x, DONATION_PANEL.z - n.z), `lectern ${n.id}`).toBeGreaterThan(1.2);
  });

  /*
   * The current layout is the frozen PROPOSTA (final layout is PEN-017/PEN-023): moving a piece must be
   * an intentional test diff. The clearance checks above stay; this one pins the coordinates themselves.
   * IMPL-0016 moved `bell-pine-north` (was -10, -12.4), `bell-pine-east` (was 12.2, 9.5) and
   * `lantern-lake-1` (was 23.5, 17) out from under the pine boughs, which now block the avatar.
   */
  it("pins the exact coordinates of NPCs, quest spawns, quest interactions and the donation lectern", () => {
    expect(NPCS.map(({ id, x, z }) => ({ id, x, z }))).toEqual([
      { id: "sleigh-keeper", x: -2.5, z: 28.5 },
      { id: "market-keeper", x: -18.6, z: 0 },
      { id: "postmaster", x: 4.5, z: 11.8 },
      { id: "pond-keeper", x: 24.5, z: -2.5 },
      { id: "storyteller", x: 5, z: 4 },
    ]);
    expect(QUEST_SPAWNS.map(({ id, x, z }) => ({ id, x, z }))).toEqual([
      { id: "bell-pine-north", x: -10, z: -13.2 },
      { id: "bell-pine-east", x: 12.9, z: 9.2 },
      { id: "crate-street", x: -14.5, z: 8.6 },
      { id: "crate-market", x: -16.8, z: -3.6 },
      { id: "lantern-lake-1", x: 23.2, z: 17 },
      { id: "lantern-lake-2", x: 30.5, z: 10 },
    ]);
    expect(QUEST_INTERACTIONS.map(({ id, x, z }) => ({ id, x, z }))).toEqual([
      { id: "mailbox-open", x: 2.4, z: 12.6 },
      { id: "sled-ride", x: 2.5, z: 27 },
    ]);
    expect({ x: DONATION_PANEL.x, z: DONATION_PANEL.z, r: DONATION_PANEL.r }).toEqual({ x: 4.6, z: 6.4, r: 0.5 });
  });
});
