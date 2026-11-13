/**
 * One intention per click (IMPL-0024, issue #41): a click on a building never leaves a walk behind its panel,
 * a click from afar walks to the building's interaction point with the marker there, and on a street a tap on
 * the roof that covers the paving walks to the paving.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { BILLBOARDS, groundAt, INTERACT_DISTANCE, NPCS, PLACE_INTERACT_DISTANCE, RESIDENTIAL_PLOTS, SHOPS } from "@vila/shared/game/world";

import { groundIsFirst, groundUnder, isStreet, openFromScene, tapResidence, visit, walkTo } from "./clicks";
import { events, type GameEvent } from "./events";
import { sim, walkRoute } from "./sim";
import { useVila } from "./store";

const taps: Array<{ x: number; z: number }> = [];
let off = () => {};
const stand = (x: number, z: number) => {
  sim.body.x = sim.pose.x = x;
  sim.body.z = sim.pose.z = z;
  sim.body.vx = sim.body.vz = 0;
};
const state = () => useVila.getState();

beforeEach(() => {
  taps.length = 0;
  off = events.on((e: GameEvent) => {
    if (e.type === "tap") taps.push({ x: e.x, z: e.z });
  });
  sim.nav = null;
  stand(0, 9);
  useVila.setState({ panel: { kind: "none" }, menu: null, target: null });
  sim.route.active = false;
});
afterEach(() => {
  off();
  useVila.setState({ panel: { kind: "none" }, menu: null, target: null });
  sim.route.active = false;
  stand(0, 9);
});

describe("a click on a place of the village", () => {
  const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "premium-01")!;
  const cases: Array<[string, { x: number; z: number }, Parameters<typeof visit>[1]]> = [
    ["the chalet of a residential plot", plot.front, { kind: "plot", plotId: plot.id }],
    ["a shop", SHOPS[0].door, { kind: "shop", shopId: SHOPS[0].id }],
    ["a billboard", BILLBOARDS[0].point, { kind: "billboard", billboardId: BILLBOARDS[0].id }],
  ];

  it.each(cases)("opens the panel of %s from its interaction point and leaves no walk behind", (_, spot, panel) => {
    stand(spot.x, spot.z);
    visit(spot, panel);
    expect(state().panel).toEqual(panel);
    expect(state().target).toBeNull();
    expect(sim.route.active).toBe(false);
    expect(taps).toEqual([]);
    // Closing the panel: nothing to walk.
    state().close();
    expect(walkRoute(state())?.active).toBe(false);
  });

  it.each(cases)("drops a walk that was on its way when the panel of %s opens", (_, spot, panel) => {
    stand(spot.x + 1, spot.z);
    walkTo(0, 9);
    expect(sim.route.active).toBe(true);
    visit(spot, panel);
    expect(state().panel).toEqual(panel);
    expect([state().target, sim.route.active]).toEqual([null, false]);
  });

  it.each(cases)("walks to the interaction point of %s from afar, with the tap marker there", (_, spot, panel) => {
    stand(0, 9);
    visit(spot, panel);
    expect(state().panel).toEqual({ kind: "none" });
    expect(state().target).toEqual(spot);
    expect(taps).toEqual([spot]);
    expect([sim.route.active, sim.route.x, sim.route.z]).toEqual([true, spot.x, spot.z]);
  });

  it("uses the reach of the action button: just inside opens, just outside walks", () => {
    const [, spot, panel] = cases[0];
    stand(spot.x + PLACE_INTERACT_DISTANCE - 0.05, spot.z);
    visit(spot, panel);
    expect(state().panel).toEqual(panel);
    state().close();
    stand(spot.x + PLACE_INTERACT_DISTANCE + 0.05, spot.z);
    visit(spot, panel);
    expect(state().panel).toEqual({ kind: "none" });
    expect(state().target).toEqual(spot);
  });

  it("walks up to a quest NPC from afar and talks from talking distance", () => {
    const npc = NPCS[0];
    visit(npc, { kind: "npc", npcId: npc.id }, INTERACT_DISTANCE);
    expect(state().panel).toEqual({ kind: "none" });
    // The NPC is solid: the walk ends beside it, and the marker is where the walk ends.
    const to = state().target!;
    expect(Math.hypot(to.x - npc.x, to.z - npc.z)).toBeLessThan(INTERACT_DISTANCE);
    expect(taps).toEqual([to]);
    stand(to.x, to.z);
    visit(npc, { kind: "npc", npcId: npc.id }, INTERACT_DISTANCE);
    expect(state().panel).toEqual({ kind: "npc", npcId: npc.id });
    expect(state().target).toBeNull();
  });
});

describe("a click on a lot, the tree or the lectern", () => {
  it("opens the panel and leaves no walk behind it, even one that was on its way", () => {
    walkTo(20, 20);
    expect(sim.route.active).toBe(true);
    openFromScene({ kind: "lot", lotId: "plaza-01" });
    expect(state().panel).toEqual({ kind: "lot", lotId: "plaza-01" });
    expect([state().target, sim.route.active]).toEqual([null, false]);
    state().close();
    openFromScene({ kind: "donation" });
    expect(state().panel).toEqual({ kind: "donation" });
    expect(state().target).toBeNull();
  });

  it("is not what the action button does: a panel opened from the HUD keeps the walk for when it closes (IMPL-0022)", () => {
    walkTo(20, 20);
    state().open({ kind: "donation" });
    expect(sim.route.active).toBe(true);
    expect(walkRoute(state())).toBeNull();
    state().close();
    expect(walkRoute(state())?.active).toBe(true);
  });
});

describe("the ground under the pointer", () => {
  it("walks only when the ground is the first thing under the pointer that answers a click", () => {
    const ground = {}, chalet = {};
    expect(groundIsFirst([{ eventObject: ground }], ground)).toBe(true);
    expect(groundIsFirst([{ eventObject: ground }, { eventObject: chalet }], ground)).toBe(true);
    // A chalet, a shop, the tree or a lot's pad in front of it: its click decides.
    expect(groundIsFirst([{ eventObject: chalet }, { eventObject: ground }], ground)).toBe(false);
    expect(groundIsFirst([], ground)).toBe(true);
  });

  it("finds where a ray from the camera meets the ground", () => {
    expect(groundUnder({ x: 0, y: 24, z: 21 }, { x: 0, y: -24, z: -21 })).toEqual({ x: 0, z: 0 });
    const hit = groundUnder({ x: 5, y: 10, z: 5 }, { x: 1, y: -2, z: 0 })!;
    expect([hit.x, hit.z]).toEqual([10, 5]);
    expect(groundUnder({ x: 0, y: 10, z: 0 }, { x: 0, y: 0.2, z: -1 })).toBeNull();
  });

  it("knows paving from a plot", () => {
    expect((["plaza", "ring-street", "avenue", "lane", "street-premium", "street-standard", "street-economy"] as const).every(isStreet)).toBe(true);
    expect((["yard-economy", "path-premium", "pad", "snow", "ice"] as const).some(isStreet)).toBe(false);
  });
});

describe("a tap on a chalet of a residential row", () => {
  // A cottage south of its street, seen from its back: its roof covers the street on the screen.
  const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "economy-19")!;
  const street = { x: plot.front.x + 1, z: plot.front.z - 1 };

  it("walks to the tapped spot of the street when the roof under the finger covers paving", () => {
    expect(isStreet(groundAt(street.x, street.z))).toBe(true);
    stand(plot.front.x - 12, plot.front.z - 1);
    tapResidence(plot, street);
    expect(state().panel).toEqual({ kind: "none" });
    expect(state().target).toEqual(street);
    expect(taps).toEqual([street]);
  });

  it("goes to the plot's front when the ground under the finger is the plot itself", () => {
    const yard = { x: plot.house.x, z: plot.house.z + 1 };
    expect(isStreet(groundAt(yard.x, yard.z))).toBe(false);
    stand(plot.front.x - 12, plot.front.z - 1);
    tapResidence(plot, yard);
    expect(state().target).toEqual(plot.front);
    expect(taps).toEqual([plot.front]);
    // From the front itself, the same tap opens the plot's panel.
    stand(plot.front.x, plot.front.z);
    tapResidence(plot, yard);
    expect(state().panel).toEqual({ kind: "plot", plotId: plot.id });
    expect(state().target).toBeNull();
    state().close();
    // A ray that never meets the ground (it cannot, from this camera) still means the plot.
    stand(0, 9);
    tapResidence(plot, null);
    expect(state().target).toEqual(plot.front);
  });

  it("covers a street from the camera: the roof ridge of a south row projects onto its street", () => {
    // The camera at rest over the plot's front; the ray through the ridge of the cottage (5 u up) lands on paving.
    const cam = { x: plot.front.x, y: 25, z: plot.front.z + 21 };
    const ridge = { x: plot.house.x, y: 5, z: plot.house.z };
    const ground = groundUnder(cam, { x: ridge.x - cam.x, y: ridge.y - cam.y, z: ridge.z - cam.z })!;
    expect(groundAt(ground.x, ground.z)).toBe("street-economy");
  });
});
