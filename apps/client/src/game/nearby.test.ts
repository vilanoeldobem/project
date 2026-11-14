/**
 * The one contextual action (IMPL-0024): what is on offer where, a residential plot only to an avatar that
 * stands still, and the hysteresis that keeps the button from dropping between neighbours.
 */
import { describe, expect, it } from "vitest";

import { createBody, MOTION } from "@vila/shared/game/motion";
import { createNavField, createRoute, planRoute, stepWalk } from "@vila/shared/game/navigation";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { BILLBOARDS, lotFront, LOTS, PATH_GRAPH, PLACE_INTERACT_DISTANCE, RESIDENTIAL_PLOTS, SHOPS, SPAWN } from "@vila/shared/game/world";

import { sceneColliders } from "../scene/sceneColliders";
import { NEARBY_KEEP, pickNearby, PLOT_KEEP_SPEED, PLOT_STILL_SPEED } from "./nearby";
import { type Nearby } from "./store";

const COLLIDERS = sceneColliders(new Set(), false);
const FIELD = createNavField(COLLIDERS);
const node = (id: string) => PATH_GRAPH.nodes.find((n) => n.id === id)!;
const name = (n: Nearby) => (!n ? null : n.kind === "plot" ? n.plotId : n.kind === "shop" ? n.shopId : n.kind === "billboard" ? n.billboardId : n.kind === "lot" ? n.lotId : n.kind);
/** The first version's rule: every place offered on the move, and no memory of what was on offer. */
const before = (x: number, z: number) => pickNearby(x, z, 0, false, EMPTY_PROGRESS, null);

/** Walks from `a` to `b` with the client's own planner and step, asking for the target at every step. */
function walk(a: { x: number; z: number }, b: { x: number; z: number }) {
  const body = createBody(a.x, a.z), route = createRoute();
  planRoute(FIELD, route, a.x, a.z, b.x, b.z);
  let near: Nearby = null;
  const now: Nearby[] = [], old: Nearby[] = [];
  for (let step = 0; step < 60 * 120; step++) {
    const r = stepWalk(body, route, FIELD, COLLIDERS);
    near = pickNearby(body.x, body.z, Math.hypot(body.vx, body.vz), false, EMPTY_PROGRESS, near);
    now.push(near);
    old.push(before(body.x, body.z));
    if (r.targetDone) break;
  }
  // A second at rest where the walk ended.
  for (let step = 0; step < 60; step++) now.push((near = pickNearby(body.x, body.z, 0, false, EMPTY_PROGRESS, near)));
  const share = (list: Nearby[]) => list.filter(Boolean).length / list.length;
  const changes = (list: Nearby[]) => list.filter((n, i) => i > 0 && n !== list[i - 1]).length;
  /** Times the action went away and came back within `within` steps (a quarter of a second by default). */
  const blinks = (list: Nearby[], within = 15) => {
    let count = 0, gone = -1;
    list.forEach((n, i) => {
      if (!n && i > 0 && list[i - 1]) gone = i;
      if (n && gone >= 0) {
        if (i - gone < within) count++;
        gone = -1;
      }
    });
    return count;
  };
  return { steps: old.length, now, old, share, changes, blinks, end: near };
}

describe("what is on offer where", () => {
  it("offers each place from its own interaction point, standing still", () => {
    for (const s of SHOPS) expect(name(pickNearby(s.door.x, s.door.z, 0, false, EMPTY_PROGRESS, null)), `${s.id} door`).toBe(s.id);
    for (const b of BILLBOARDS) expect(name(pickNearby(b.point.x, b.point.z, 0, false, EMPTY_PROGRESS, null)), `${b.id} point`).toBe(b.id);
    for (const p of RESIDENTIAL_PLOTS) expect(name(pickNearby(p.front.x, p.front.z, 0, false, EMPTY_PROGRESS, null)), `${p.id} front`).toBe(p.id);
    for (const l of LOTS) expect(name(pickNearby(lotFront(l).x, lotFront(l).z, 0, false, EMPTY_PROGRESS, null)), `${l.id} front`).toBe(l.id);
    expect(pickNearby(SPAWN.x, SPAWN.z, 0, false, EMPTY_PROGRESS, null)).toBeNull();
    expect(name(pickNearby(0, 6, 0, false, EMPTY_PROGRESS, null))).toBe("tree");
  });

  it("offers a residential plot only to an avatar that stands still", () => {
    const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-12")!;
    const at = (speed: number, previous: Nearby = null) => name(pickNearby(plot.front.x, plot.front.z, speed, false, EMPTY_PROGRESS, previous));
    expect(at(0)).toBe(plot.id);
    expect(at(PLOT_STILL_SPEED - 0.01)).toBe(plot.id);
    expect(at(PLOT_STILL_SPEED)).toBeNull();
    expect(at(MOTION.maxSpeed)).toBeNull();
    // On offer, it stays while the avatar shifts its feet, and goes once it really walks.
    const shown = pickNearby(plot.front.x, plot.front.z, 0, false, EMPTY_PROGRESS, null);
    expect(at(PLOT_KEEP_SPEED - 0.01, shown)).toBe(plot.id);
    expect(at(PLOT_KEEP_SPEED, shown)).toBeNull();
  });

  it("keeps offering shops, billboards, lots and the tree on the move, as before", () => {
    const speed = MOTION.maxSpeed;
    expect(name(pickNearby(SHOPS[0].door.x, SHOPS[0].door.z, speed, false, EMPTY_PROGRESS, null))).toBe(SHOPS[0].id);
    expect(name(pickNearby(BILLBOARDS[0].point.x, BILLBOARDS[0].point.z, speed, false, EMPTY_PROGRESS, null))).toBe(BILLBOARDS[0].id);
    expect(name(pickNearby(lotFront(LOTS[0]).x, lotFront(LOTS[0]).z, speed, false, EMPTY_PROGRESS, null))).toBe(LOTS[0].id);
    expect(name(pickNearby(0, 6, speed, false, EMPTY_PROGRESS, null))).toBe("tree");
  });
});

describe("hysteresis", () => {
  it("holds the target on offer across the edge of its reach, and lets go beyond the margin", () => {
    const door = SHOPS[1].door; // the south shop: its door faces north, towards the tree
    const at = (d: number, previous: Nearby) => pickNearby(door.x, door.z - d, MOTION.maxSpeed, false, EMPTY_PROGRESS, previous);
    expect(at(PLACE_INTERACT_DISTANCE + 0.1, null)).toBeNull();
    const shown = at(PLACE_INTERACT_DISTANCE - 0.1, null);
    expect(name(shown)).toBe(SHOPS[1].id);
    // A jitter of the pose around the edge no longer toggles the button.
    for (const d of [0.05, -0.05, 0.2, 0.01, NEARBY_KEEP - 0.05]) expect(at(PLACE_INTERACT_DISTANCE + d, shown), `${d}`).toBe(shown);
    expect(at(PLACE_INTERACT_DISTANCE + NEARBY_KEEP + 0.05, shown)).toBeNull();
  });

  it("switches between two neighbours only when the other is clearly closer", () => {
    // Between a shop's door and its billboard's point, 3.4 u apart: each is offered at its own point, and in the
    // middle the one that was on offer stays.
    const door = SHOPS[0].door, point = BILLBOARDS[0].point;
    const mid = { x: (door.x + point.x) / 2, z: (door.z + point.z) / 2 };
    const shop = pickNearby(door.x, door.z, 0, false, EMPTY_PROGRESS, null), board = pickNearby(point.x, point.z, 0, false, EMPTY_PROGRESS, null);
    for (const k of [-0.2, 0, 0.2]) {
      const x = mid.x + (point.x - door.x) * k * 0.1, z = mid.z + (point.z - door.z) * k * 0.1;
      expect(pickNearby(x, z, 0, false, EMPTY_PROGRESS, shop)).toBe(shop);
      expect(pickNearby(x, z, 0, false, EMPTY_PROGRESS, board)).toBe(board);
    }
    expect(pickNearby(point.x, point.z, 0, false, EMPTY_PROGRESS, shop)).toBe(board);
    expect(pickNearby(door.x, door.z, 0, false, EMPTY_PROGRESS, board)).toBe(shop);
  });

  it("gives way to a lot: a place is only offered when nothing that ranks before it is in reach", () => {
    const lot = LOTS[0], front = lotFront(lot);
    const shop = pickNearby(SHOPS[0].door.x, SHOPS[0].door.z, 0, false, EMPTY_PROGRESS, null);
    expect(name(pickNearby(front.x, front.z, 0, false, EMPTY_PROGRESS, shop))).toBe(lot.id);
  });

  it("forgets a target it cannot place (set from outside, a quest that ended)", () => {
    expect(pickNearby(SPAWN.x, SPAWN.z, 0, false, EMPTY_PROGRESS, { kind: "plot", plotId: "economy-01" })).toBeNull();
    expect(pickNearby(SPAWN.x, SPAWN.z, 0, false, EMPTY_PROGRESS, { kind: "npc", npcId: "postmaster" })).toBeNull();
    expect(pickNearby(60, 60, 0, false, EMPTY_PROGRESS, { kind: "tree" })).toBeNull();
  });
});

describe("a walk down a residential street", () => {
  it.each([
    ["economy", "avenue-01-street-3", "avenue-02-street-3"],
    ["standard", "avenue-01-street-2", "avenue-02-street-2"],
    ["premium", "avenue-01-street-1", "avenue-02-street-1"],
  ])("shows no strip of prompts on the %s street, where the first version showed one", (_, from, to) => {
    const w = walk(node(from), node(to));
    // Before: a prompt on most of the walk, switching from front to front, dropping out between rows.
    expect(w.share(w.old)).toBeGreaterThan(0.3);
    expect(w.changes(w.old)).toBeGreaterThanOrEqual(4);
    // Now: nothing on offer while the avatar walks past the plots.
    expect(w.share(w.now.slice(0, w.steps))).toBeLessThan(0.02);
    expect(w.blinks(w.now)).toBe(0);
  });

  it("measures the economy street: share of the walk with a prompt, before and after", () => {
    const w = walk(node("avenue-01-street-3"), node("avenue-02-street-3"));
    const old = { share: Math.round(w.share(w.old) * 100), changes: w.changes(w.old), blinks: w.blinks(w.old) };
    const now = { share: Math.round(w.share(w.now.slice(0, w.steps)) * 100), changes: w.changes(w.now.slice(0, w.steps)), blinks: w.blinks(w.now) };
    // The numbers of IMPL-0024 ("O botão de ação nas ruas residenciais").
    expect({ seconds: Math.round((w.steps / 60) * 10) / 10, old, now }).toEqual({ seconds: 6.7, old: { share: 83, changes: 15, blinks: 5 }, now: { share: 0, changes: 0, blinks: 0 } });
  });

  it("offers the plot once the avatar has stopped in front of it", () => {
    const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-12")!;
    const w = walk(node("avenue-01-street-3"), plot.front);
    expect(w.share(w.now.slice(0, w.steps - 30))).toBeLessThan(0.02);
    expect(name(w.end)).toBe(plot.id);
  });

  it("never drops the action for a blink on a walk along the square's frontage, past shops, billboards and lots", () => {
    SHOPS.forEach((shop, i) => {
      const board = BILLBOARDS[i].point;
      // The lot across the lane from the shop, and the lot next to it on the neighbouring side.
      const lots = [...LOTS].sort((a, b) => Math.hypot(a.x - shop.x, a.z - shop.z) - Math.hypot(b.x - shop.x, b.z - shop.z)).slice(0, 2).map(lotFront);
      for (const [from, to] of [[board, shop.door], [shop.door, lots[0]], [lots[0], board], [board, lots[1]], [lots[1], lots[0]]]) {
        const w = walk(from, to);
        // Two things 7 u apart leave a stretch with nothing in reach between them; what must not happen is the
        // action going away and coming back within a few frames.
        expect(w.blinks(w.now, 6), `${shop.id}: (${from.x}, ${from.z}) → (${to.x}, ${to.z})`).toBe(0);
        expect(w.share(w.now)).toBeGreaterThan(0.3);
      }
    });
  });
});
