/**
 * The press handler the scene mounts on the ground (`PressDisc`), pressed here as react-three-fiber presses
 * it: with the hits of the pointer, nearest first, and the ray of the camera. The rule itself is `pressScene`
 * (`game/clicks.test.ts`); this file fails when the ground stops calling it, or calls it with the wrong hits,
 * the wrong spot or without the moderation pick (IMPL-0021, IMPL-0024). No browser: the element is read as data.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Me } from "@vila/shared/accounts/contract";
import { INTERACT_DISTANCE, LOTS, NPCS, RESIDENTIAL_PLOTS, SHOPS } from "@vila/shared/game/world";

import { groundUnder, openFromScene, startPress, tapResidence, visit } from "../game/clicks";
import { events, type GameEvent } from "../game/events";
import { sim } from "../game/sim";
import { useVila } from "../game/store";
import { useAccount } from "../lib/account";
import { useModeration } from "../lib/moderation";
import { ingestSnapshot, resetRemotes } from "../net/multiplayer";
import { PressDisc } from "./Ground";

const ADMIN: Me = { id: "a1", name: "Ana Lima", nickname: "ana_admin", city: "Recife", email: "ana@example.com", role: "admin" };
const PLAYER: Me = { ...ADMIN, id: "u1", nickname: "ana_lima", role: "player" };
const VISITOR = 9;

const disc = PressDisc();
const onPointerDown = disc.props.onPointerDown as (e: unknown) => void;
/** The ground's own event object, and something drawn in front of it (a pad, a chalet, a shop, the tree, an NPC). */
const ground = {}, front = {};

/** The camera at rest looks north from above: the ray through the point `(x, y, z)` of the world. */
const rayThrough = (x: number, y: number, z: number) => ({ origin: { x, y: y + 24, z: z + 21 }, direction: { x: 0, y: -24 / Math.hypot(24, 21), z: -21 / Math.hypot(24, 21) } });

/** A press on the point `(x, y, z)` of the scene; `over` is what the pointer is on before the ground. */
function press(at: { x: number; y?: number; z: number }, over: object[] = [], pointer: { button?: number; isPrimary?: boolean } = {}) {
  const ray = rayThrough(at.x, at.y ?? 0, at.z);
  const point = groundUnder(ray.origin, ray.direction)!;
  const e = {
    button: pointer.button ?? 0,
    nativeEvent: { isPrimary: pointer.isPrimary ?? true },
    intersections: [...over, ground].map((eventObject) => ({ eventObject })),
    eventObject: ground,
    point: { x: point.x, y: 0, z: point.z },
    ray,
    stopPropagation: vi.fn(),
  };
  onPointerDown(e);
  return { stopped: e.stopPropagation.mock.calls.length > 0, point };
}

const taps: Array<{ x: number; z: number }> = [];
let off = () => {};
const stand = (x: number, z: number) => {
  sim.body.x = sim.pose.x = x;
  sim.body.z = sim.pose.z = z;
  sim.body.vx = sim.body.vz = 0;
};
const reset = () => {
  startPress();
  useVila.setState({ panel: { kind: "none" }, menu: null, target: null });
  sim.route.active = false;
  sim.nav = null;
  stand(0, 9);
  useModeration.setState({ on: false, selected: null, askedAt: null, sending: false, notice: null });
  useAccount.setState({ user: null, presenceModeration: false });
  resetRemotes();
};
const state = () => ({ panel: useVila.getState().panel, target: useVila.getState().target, taps: [...taps], selected: useModeration.getState().selected });

/** An administrator in moderation mode, with visitor removal on, and one visitor standing at `(x, z)`. */
function moderate(x: number, z: number, user: Me = ADMIN, presenceModeration = true) {
  useAccount.setState({ user, presenceModeration });
  useModeration.getState().setOn(true);
  ingestSnapshot([[VISITOR, x, z, 0, 0, 0]], 1000, null, 1000);
}

beforeEach(() => {
  reset();
  taps.length = 0;
  off = events.on((e: GameEvent) => {
    if (e.type === "tap") taps.push({ x: e.x, z: e.z });
  });
});
afterEach(() => {
  off();
  reset();
});

describe("a press on the ground of the scene", () => {
  it("is the handler of the disc that lies under the whole village", () => {
    expect(disc.type).toBe("mesh");
    expect(typeof onPointerDown).toBe("function");
  });

  it("walks to the pressed spot on open ground and keeps the press to itself", () => {
    const { stopped, point } = press({ x: -20, z: 20 });
    expect(stopped).toBe(true);
    expect(point.x).toBeCloseTo(-20, 9);
    expect(point.z).toBeCloseTo(20, 9);
    expect(state()).toEqual({ panel: { kind: "none" }, target: point, taps: [point], selected: null });
  });

  it("walks nowhere when a chalet, a shop, the tree or a lot stands in front of the ground: its click decides", () => {
    const { stopped } = press({ x: 20, z: 20 }, [front]);
    expect(stopped).toBe(false);
    expect(state()).toEqual({ panel: { kind: "none" }, target: null, taps: [], selected: null });
  });

  it("is only for the main button and the first finger: a second finger starts a pinch", () => {
    moderate(20, 20);
    for (const pointer of [{ button: 2 }, { isPrimary: false }]) {
      expect(press({ x: 20, y: 1.3, z: 20 }, [], pointer).stopped).toBe(false);
      expect(state()).toEqual({ panel: { kind: "none" }, target: null, taps: [], selected: null });
    }
  });
});

describe("a press on a visitor in moderation mode (PROPOSTA, IMPL-0021)", () => {
  const shop = SHOPS[0];
  const plot = RESIDENTIAL_PLOTS.find((p) => p.id === "standard-27")!;
  const lot = LOTS.find((l) => l.id === "plaza-10")!;
  const npc = NPCS[0];
  /** Where the visitor stands, and the click that the thing behind them answers: [what, visitor, avatar, click]. */
  const BEHIND: Array<[string, { x: number; z: number }, { x: number; z: number }, () => void]> = [
    ["on the pad of an available lot", { x: lot.x, z: lot.z - 1.5 }, { x: lot.x + 5, z: lot.z + 3 }, () => openFromScene({ kind: "lot", lotId: lot.id })],
    ["in front of the tree", { x: 0, z: 5.5 }, { x: 0, z: 9 }, () => openFromScene({ kind: "donation" })],
    ["at a shop's door", shop.door, shop.door, () => visit(shop.door, { kind: "shop", shopId: shop.id })],
    ["at the front of a residential plot", plot.front, plot.front, () => tapResidence(plot, { x: plot.house.x, z: plot.house.z })],
    ["beside a quest NPC", { x: npc.x - 1, z: npc.z + 1 }, { x: npc.x - 1.5, z: npc.z + 1.5 }, () => visit(npc, { kind: "npc", npcId: npc.id }, INTERACT_DISTANCE)],
  ];

  it.each(BEHIND)("picks a visitor standing %s, and that press opens no panel and walks nowhere", (_, visitor, avatar, click) => {
    stand(avatar.x, avatar.z);
    moderate(visitor.x, visitor.z);
    // On the visitor's chest, with the pad, the chalet, the shop, the tree or the NPC first under the pointer.
    expect(press({ x: visitor.x, y: 1.3, z: visitor.z }, [front]).stopped).toBe(true);
    expect(state()).toEqual({ panel: { kind: "none" }, target: null, taps: [], selected: VISITOR });
    // The click that ends the press reaches the thing behind the visitor, which does nothing with it.
    click();
    expect(state()).toEqual({ panel: { kind: "none" }, target: null, taps: [], selected: VISITOR });
  });

  it("picks a visitor on open ground instead of walking, as always", () => {
    moderate(6, 10);
    expect(press({ x: 6, y: 1.3, z: 10 }).stopped).toBe(true);
    expect(state()).toEqual({ panel: { kind: "none" }, target: null, taps: [], selected: VISITOR });
  });

  it.each(BEHIND)("a press that is on nobody, with a visitor %s nearby, does what it always did", (_, visitor, avatar, click) => {
    stand(avatar.x, avatar.z);
    moderate(visitor.x + 6, visitor.z + 6);
    expect(press({ x: visitor.x, y: 1.3, z: visitor.z }, [front]).stopped).toBe(false);
    expect(state()).toEqual({ panel: { kind: "none" }, target: null, taps: [], selected: null });
    click();
    expect(useVila.getState().panel.kind).not.toBe("none");
    expect(useModeration.getState().selected).toBeNull();
  });

  it("lets the next press through after a pick: the panel behind the visitor opens when the press is not on them", () => {
    stand(shop.door.x, shop.door.z);
    moderate(shop.door.x, shop.door.z);
    press({ x: shop.door.x, y: 1.3, z: shop.door.z }, [front]);
    expect(useModeration.getState().selected).toBe(VISITOR);
    press({ x: shop.x + 4, y: 3, z: shop.z }, [front]);
    visit(shop.door, { kind: "shop", shopId: shop.id });
    expect(useVila.getState().panel).toEqual({ kind: "shop", shopId: shop.id });
    // The selection stays: only a pick, the HUD or the visitor leaving changes it.
    expect(useModeration.getState().selected).toBe(VISITOR);
  });

  it.each<[string, Me | null, boolean, boolean]>([
    ["a visitor who is not signed in", null, true, true],
    ["an account that is not an administrator", PLAYER, true, true],
    ["an administrator with moderation mode off", ADMIN, true, false],
    ["an administrator while visitor removal is off", ADMIN, false, true],
  ])("never picks for %s: the press on a visitor is an ordinary press", (_, user, presence, on) => {
    moderate(6, 10, user ?? undefined, presence);
    if (!user) useAccount.setState({ user: null });
    useModeration.setState({ on });
    // On open ground it walks…
    const { stopped, point } = press({ x: 6, y: 1.3, z: 10 });
    expect(stopped).toBe(true);
    expect(useVila.getState().target).not.toBeNull();
    expect(taps).toHaveLength(1);
    expect(point.z).toBeLessThan(10);
    expect(useModeration.getState().selected).toBeNull();
    // …and in front of a lot its panel opens.
    useVila.setState({ target: null });
    expect(press({ x: 6, y: 1.3, z: 10 }, [front]).stopped).toBe(false);
    openFromScene({ kind: "lot", lotId: "plaza-10" });
    expect(useVila.getState().panel).toEqual({ kind: "lot", lotId: "plaza-10" });
  });

  it("does not pick while a removal is waiting for the room's answer: the press is an ordinary one", () => {
    moderate(6, 10);
    useModeration.setState({ sending: true });
    expect(press({ x: 6, y: 1.3, z: 10 }, [front]).stopped).toBe(false);
    openFromScene({ kind: "donation" });
    expect(useVila.getState().panel).toEqual({ kind: "donation" });
    expect(useModeration.getState().selected).toBeNull();
  });
});
