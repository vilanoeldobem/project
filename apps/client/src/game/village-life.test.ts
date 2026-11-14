/**
 * The village's characters on the client (IMPL-0025): the shared simulation is never touched by what one
 * visitor sees, who is drawn, who can be talked to and what is offered next to a lot, a shop, a billboard, a
 * plot, the tree or a quest NPC, what a click does, and what each one says where it is.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { WEATHER_SEED } from "@vila/shared/environment/config";
import { saoPauloToEpoch } from "@vila/shared/environment/time";
import { clearance } from "@vila/shared/game/collision";
import { compileLife, createLifeState, LIFE_ACTIVITIES, LIFE_CAST, sampleLife } from "@vila/shared/game/life";
import { NOTHING_SOLD, WAYS } from "@vila/shared/game/life-dialogue";
import { createNavField } from "@vila/shared/game/navigation";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { BILLBOARDS, INTERACT_DISTANCE, lotFront, LOTS, NPCS, RESIDENTIAL_PLOTS, SHOPS, TREE_RADIUS, WOOD_YARD } from "@vila/shared/game/world";

import { env, frameAt, useEnvUi } from "../environment/runtime";
import { sceneColliders } from "../scene/sceneColliders";
import { visitCharacter } from "./clicks";
import { events, type GameEvent } from "./events";
import { REACT } from "./life-reactions";
import { LIFE_OVER_PLACE, LIFE_REACH, type LifeNearby, NEARBY_KEEP, pickNearby } from "./nearby";
import { sim } from "./sim";
import { type Nearby, useVila } from "./store";
import { life, LIFE_DRAW, LIFE_HYSTERESIS, LIFE_NEAR, LIFE_TALK_REACH, LIFE_TALK_STAND, lifeAction, lifeIndex, lifeNear, lifePanel, lifeTap, tickLife } from "./village-life";

const DAY = saoPauloToEpoch(2026, 12, 20, 0, 0);
const HOUR = 3_600_000;
const DT = 1 / 60;
const stand = (x: number, z: number) => {
  sim.body.x = sim.pose.x = x;
  sim.body.z = sim.pose.z = z;
  sim.body.vx = sim.body.vz = 0;
};
/** One frame at a village time, as the scene runs it. */
const frame = (ms: number, quality: keyof typeof LIFE_DRAW = "high", calm = false) => {
  env.frame = frameAt(ms);
  tickLife(ms, env.frame.worldSeconds, DT, quality, calm);
};
/** The first time from `fromHour` on (looking every 20 s) at which the character is where `test` says. */
function when(id: string, test: (c: { x: number; z: number; moving: boolean; activity: string; presence: number }) => boolean, fromHour = 9, hours = 9): number {
  const i = lifeIndex(id);
  for (let ms = DAY + fromHour * HOUR; ms < DAY + (fromHour + hours) * HOUR; ms += 20_000) {
    frame(ms);
    const s = life.shared;
    if (test({ x: s.x[i], z: s.z[i], moving: s.moving[i] === 1, activity: LIFE_ACTIVITIES[s.activity[i]], presence: s.presence[i] })) return ms;
  }
  throw new Error(`${id} never is where the test wants it`);
}
const here = (id: string) => ({ x: life.shared.x[lifeIndex(id)], z: life.shared.z[lifeIndex(id)] });
const name = (n: Nearby) => (!n ? null : n.kind === "life" ? n.charId : n.kind === "shop" ? n.shopId : n.kind === "billboard" ? n.billboardId : n.kind === "plot" ? n.plotId : n.kind === "lot" ? n.lotId : n.kind === "npc" ? n.npcId : n.kind);
/** What the action button offers an avatar standing at a point, as `Player` asks every frame. */
const offer = (x: number, z: number, quests = false, previous: Nearby = null, speed = 0) => pickNearby(x, z, speed, quests, EMPTY_PROGRESS, previous, lifeNear(x, z, previous));

beforeEach(() => {
  // Clear weather for every test: the routines read it from the same frame as the sky.
  useEnvUi.setState({ debug: { weather: "CLEAR_FROST" } });
  life.sim = null;
  life.on = true;
  life.radius = 0;
  life.visible.fill(0);
  sim.nav = null;
  stand(0, 9);
  useVila.setState({ panel: { kind: "none" }, menu: null, target: null });
  sim.route.active = false;
});
afterEach(() => {
  useEnvUi.setState({ debug: null });
  life.on = false;
  life.sim = null;
  useVila.setState({ panel: { kind: "none" }, menu: null, target: null });
  sim.route.active = false;
  stand(0, 9);
});

describe("what one visitor sees never changes where a character is", () => {
  it("leaves the shared positions exactly as the simulation gives them, with the avatar in everyone's way", () => {
    const reference = compileLife(WEATHER_SEED, { hourAt: (ms) => frameAt(ms).hour, snowAt: () => frameAt(DAY).weather.snowfall, festiveAt: () => false });
    const expected = createLifeState();
    let displaced = 0, most = 0;
    for (let f = 0; f < 1200; f++) {
      const ms = DAY + 15 * HOUR + f * 250;
      // The avatar jumps onto one character after another.
      frame(ms);
      const target = (f >> 4) % LIFE_CAST.length;
      stand(life.shared.x[target] + 0.2, life.shared.z[target]);
      frame(ms);
      sampleLife(reference, ms, expected);
      expect(Array.from(life.shared.x), `frame ${f}`).toEqual(Array.from(expected.x));
      expect(Array.from(life.shared.z), `frame ${f}`).toEqual(Array.from(expected.z));
      for (let i = 0; i < LIFE_CAST.length; i++) {
        const off = Math.hypot(life.x[i] - life.shared.x[i], life.z[i] - life.shared.z[i]);
        expect(off, LIFE_CAST[i].id).toBeLessThanOrEqual(REACT.maxOffset + 1e-5);
        if (off > 0.05) displaced++;
        most = Math.max(most, off);
      }
    }
    // The layer did something (characters stepped aside), within its bound.
    expect(displaced).toBeGreaterThan(500);
    expect(most).toBeGreaterThan(0.5);
  });

  it("brings a character back to its shared position once the avatar has left", () => {
    const ms = when("villager-2", (c) => !c.moving && c.presence === 1);
    const at = here("villager-2");
    const i = lifeIndex("villager-2");
    stand(at.x + 0.25, at.z);
    for (let f = 0; f < 60; f++) frame(ms + f * 16);
    expect(Math.hypot(life.x[i] - at.x, life.z[i] - at.z)).toBeGreaterThan(0.6);
    // The avatar is never inside the character it walked into.
    expect(Math.hypot(life.x[i] - sim.pose.x, life.z[i] - sim.pose.z)).toBeGreaterThan(0.85);
    stand(at.x + 12, at.z);
    for (let f = 0; f < 240; f++) frame(ms + 1000 + f * 16);
    expect(Math.hypot(life.x[i] - at.x, life.z[i] - at.z)).toBeLessThan(0.01);
  });
});

describe("a step aside next to something solid", () => {
  it("turns to a side that is free instead of ending inside a bench, and never leaves the character on top of the avatar", () => {
    const colliders = sceneColliders(new Set(), false);
    sim.nav = createNavField(colliders);
    // One of the two neighbours on the south-west bench: the bench is right behind it, seen from the plaza.
    const ms = when("villager-5", (c) => c.activity === "chat" && c.presence === 1 && !c.moving, 9, 4);
    const i = lifeIndex("villager-5"), at = here("villager-5");
    const r = Math.hypot(at.x, at.z);
    let turned = 0;
    // The avatar comes from every side, the plaza's included (which pushes the villager straight at the bench).
    for (let a = 0; a < 16; a++) {
      const angle = (a / 16) * Math.PI * 2;
      const from = { x: at.x + Math.cos(angle) * 0.3, z: at.z + Math.sin(angle) * 0.3 };
      if (clearance(colliders, from.x, from.z) < 0) continue;
      stand(from.x, from.z);
      life.visible.fill(0);
      for (let f = 0; f < 90; f++) frame(ms + f * 16);
      const shown = { x: life.x[i], z: life.z[i] };
      expect(clearance(colliders, shown.x, shown.z), `avatar at ${a}/16: the villager is drawn inside something`).toBeGreaterThanOrEqual(0);
      expect(Math.hypot(shown.x - from.x, shown.z - from.z), `avatar at ${a}/16: the villager is drawn on the avatar`).toBeGreaterThan(0.6);
      expect(Math.hypot(shown.x - at.x, shown.z - at.z)).toBeLessThanOrEqual(REACT.maxOffset + 1e-5);
      // Pushed away from the tree (towards the bench): the step it takes is not the straight one.
      const straight = { x: at.x + life.reactions.ox[i], z: at.z + life.reactions.oz[i] };
      if (Math.hypot(straight.x - shown.x, straight.z - shown.z) > 0.1) turned++;
    }
    expect(r).toBeGreaterThan(8);
    expect(turned).toBeGreaterThan(0);
  });
});

describe("who is drawn", () => {
  it("draws the characters near the avatar, with hysteresis at the edge, and nobody who is off stage", () => {
    const ms = when("shopkeeper-1", (c) => !c.moving && c.presence === 1, 10);
    const at = here("shopkeeper-1"), i = lifeIndex("shopkeeper-1");
    const radius = LIFE_DRAW.high.radius;
    const shown = (d: number) => {
      stand(at.x + d, at.z);
      frame(ms);
      return life.visible[i] === 1;
    };
    // Coming closer: not yet just inside the radius, drawn well inside it; going away: still drawn just outside.
    expect(shown(radius + 10)).toBe(false);
    expect(shown(radius - LIFE_HYSTERESIS + 0.5)).toBe(false);
    expect(shown(radius - LIFE_HYSTERESIS - 0.5)).toBe(true);
    expect(shown(radius + LIFE_HYSTERESIS - 0.5)).toBe(true);
    expect(shown(radius + LIFE_HYSTERESIS + 0.5)).toBe(false);
    // At night the shopkeeper is home: not drawn, wherever the avatar is.
    stand(at.x, at.z);
    frame(DAY + 2 * HOUR);
    expect(life.shared.presence[i]).toBe(0);
    expect(life.visible[i]).toBe(0);
    expect(life.scale[i]).toBe(0);
  });

  it("draws fewer, nearer characters on the low preset, and the whole square on the others", () => {
    const counts: Record<string, number> = {};
    for (const quality of ["low", "medium", "high"] as const) {
      life.radius = 0;
      life.visible.fill(0);
      stand(0, 9);
      for (let f = 0; f < 240; f++) frame(DAY + 15 * HOUR + f * 16, quality);
      counts[quality] = life.drawn;
      for (let i = 0; i < LIFE_CAST.length; i++) if (life.visible[i]) expect(Math.hypot(life.shared.x[i], life.shared.z[i] - 9), quality).toBeLessThan(LIFE_DRAW[quality].radius + LIFE_HYSTERESIS);
    }
    expect(counts.low).toBeLessThanOrEqual(LIFE_DRAW.low.most);
    expect(counts.low).toBeGreaterThan(5);
    expect(counts.medium).toBeGreaterThan(counts.low + 5);
    expect(counts.high).toBeGreaterThanOrEqual(counts.medium);
    expect(LIFE_DRAW.low.radius).toBeLessThan(LIFE_DRAW.medium.radius);
  });

  it("draws and offers nobody while the visitor has the characters turned off", () => {
    const ms = when("santa", (c) => !c.moving && c.presence === 1 && c.z > 15, 10);
    const at = here("santa");
    stand(at.x, at.z - 1.2);
    frame(ms);
    expect(name(offer(sim.pose.x, sim.pose.z))).toBe("santa");
    life.on = false;
    frame(ms);
    expect(life.drawn).toBe(0);
    expect(offer(sim.pose.x, sim.pose.z)).toBeNull();
  });

  it("with less motion asked for, characters are where they are but nothing swings", () => {
    const ms = when("lumberjack", (c) => c.activity === "chop");
    const i = lifeIndex("lumberjack");
    stand(WOOD_YARD.x, WOOD_YARD.z + 5);
    const poses = new Set<string>();
    for (let f = 0; f < 60; f++) {
      frame(ms + f * 16, "high", true);
      poses.add(`${life.swing[i]} ${life.first[i]} ${life.second[i]}`);
    }
    expect(life.visible[i]).toBe(1);
    expect(poses.size).toBe(1);
    const moving = new Set<string>();
    for (let f = 0; f < 60; f++) {
      frame(ms + f * 16);
      moving.add(`${life.first[i].toFixed(2)}`);
    }
    expect(moving.size).toBeGreaterThan(10);
  });
});

describe("the one contextual action next to a character", () => {
  it("offers the talk next to a character that stands, and not next to one that walks", () => {
    const ms = when("santa", (c) => !c.moving && c.presence === 1 && c.z > 15, 10);
    const at = here("santa");
    stand(at.x, at.z - 1.2);
    frame(ms);
    const near = offer(sim.pose.x, sim.pose.z);
    expect(near).toEqual({ kind: "life", charId: "santa" });
    expect(near).toBe(LIFE_NEAR[lifeIndex("santa")]);
    expect(lifeAction("santa")).toBe("Conversar com Papai Noel");
    // Out of talking reach: nothing.
    expect(offer(at.x, at.z - LIFE_TALK_REACH - 0.2)).toBeNull();
    expect(LIFE_TALK_REACH).toBe(LIFE_REACH);
    // On the move (an elf carrying a gift): not offered, however close.
    const walking = when("elf-1", (c) => c.moving && c.presence === 1, 9);
    const elf = here("elf-1");
    stand(elf.x + 0.9, elf.z);
    frame(walking);
    expect(name(offer(sim.pose.x, sim.pose.z))).not.toBe("elf-1");
    // An animal is never a talk target.
    const dog = here("dog-2");
    expect(offer(dog.x + 0.8, dog.z)?.kind).not.toBe("life");
    expect(lifeAction("dog-2")).toBeNull();
  });

  it("never takes the action of the tree, a lot or a quest NPC, which keep their reach", () => {
    // Santa by the tree: on the tree's side of him the button is the tree's; a step beyond its reach, his.
    const ms = when("santa", (c) => !c.moving && c.presence === 1 && c.z < 10, 10);
    const at = here("santa");
    frame(ms);
    const r = Math.hypot(at.x, at.z);
    const toward = (d: number) => ({ x: (at.x / r) * d, z: (at.z / r) * d });
    expect(name(offer(toward(r - 1).x, toward(r - 1).z))).toBe("tree");
    expect(r - 1).toBeLessThan(TREE_RADIUS + INTERACT_DISTANCE);
    const beyond = toward(TREE_RADIUS + INTERACT_DISTANCE + 0.7);
    expect(name(offer(beyond.x, beyond.z))).toBe("santa");
    // A character as near as can be to a quest NPC, a lot's front or the tree: theirs wins, with any character.
    const life0: LifeNearby = { near: LIFE_NEAR[0], dist: 0.3, previousDist: 0.3 };
    for (const npc of NPCS) expect(name(pickNearby(npc.x + 1, npc.z, 0, true, EMPTY_PROGRESS, null, life0)), npc.id).toBe(npc.id);
    for (const lot of LOTS) expect(name(pickNearby(lotFront(lot).x, lotFront(lot).z, 0, false, EMPTY_PROGRESS, null, life0)), lot.id).toBe(lot.id);
    expect(name(pickNearby(0, 7, 0, false, EMPTY_PROGRESS, null, life0))).toBe("tree");
    // And a character on offer gives way the moment one of them comes into reach.
    expect(name(pickNearby(0, 7.9, 0, false, EMPTY_PROGRESS, LIFE_NEAR[0], life0))).toBe("tree");
    // With quests off there is no NPC there: the character is what stands at that spot.
    expect(name(pickNearby(NPCS[4].x + 9, NPCS[4].z + 9, 0, false, EMPTY_PROGRESS, null, life0))).toBe(LIFE_CAST[0].id);
  });

  it("leaves a shop door, a billboard and a plot their action unless the avatar is clearly closer to the character", () => {
    const ms = when("shopkeeper-2", (c) => !c.moving && c.presence === 1 && c.activity === "tend", 10);
    frame(ms);
    const shop = SHOPS[1], board = BILLBOARDS[1];
    const keeper = here("shopkeeper-2");
    expect([keeper.x, keeper.z]).toEqual([shop.keeper.x, shop.keeper.z]);
    // At the door: the shop. At the billboard's point: the billboard. Right by the keeper: the keeper.
    expect(name(offer(shop.door.x, shop.door.z))).toBe(shop.id);
    expect(name(offer(board.point.x, board.point.z))).toBe(board.id);
    expect(name(offer(keeper.x, keeper.z - 0.9))).toBe("shopkeeper-2");
    // Where a click on the keeper from the plaza leaves the avatar (a step short of the keeper): the keeper.
    expect(name(offer(keeper.x, keeper.z - LIFE_TALK_STAND))).toBe("shopkeeper-2");
    // Every point within the reach of the door or of the billboard: the place is offered unless the keeper is
    // closer by the margin; and the keeper never hides both, so each of the three can be reached.
    const seen = new Set<string | null>();
    for (let dx = -4; dx <= 4; dx += 0.25)
      for (let dz = -4; dz <= 1; dz += 0.25) {
        const x = keeper.x + dx, z = keeper.z + dz;
        const got = name(offer(x, z));
        seen.add(got);
        const toKeeper = Math.hypot(dx, dz), toPlace = Math.min(Math.hypot(x - shop.door.x, z - shop.door.z), Math.hypot(x - board.point.x, z - board.point.z));
        if (got === "shopkeeper-2") expect(toKeeper + LIFE_OVER_PLACE, `(${x}, ${z})`).toBeLessThan(toPlace);
        if (toPlace < toKeeper && toPlace < 3.2) expect(got, `(${x}, ${z})`).not.toBe("shopkeeper-2");
      }
    expect(seen).toContain(shop.id);
    expect(seen).toContain(board.id);
    expect(seen).toContain("shopkeeper-2");
    // A plot (offered to an avatar that stands still): the same rule.
    const plot = RESIDENTIAL_PLOTS[0];
    const by = (dist: number): LifeNearby => ({ near: LIFE_NEAR[1], dist, previousDist: dist });
    expect(name(pickNearby(plot.front.x, plot.front.z, 0, false, EMPTY_PROGRESS, null, by(0.4)))).toBe(plot.id);
    expect(name(pickNearby(plot.front.x + 2, plot.front.z, 0, false, EMPTY_PROGRESS, null, by(0.4)))).toBe(LIFE_CAST[1].id);
  });

  it("holds the character on offer across the edge of its reach, and lets go when it walks off", () => {
    const previous = LIFE_NEAR[3];
    const at = (previousDist: number, near = true): LifeNearby => ({ near: near && previousDist < LIFE_REACH ? previous : null, dist: previousDist, previousDist });
    // In the open, far from everything else.
    const x = 50, z = 0;
    expect(pickNearby(x, z, 0, false, EMPTY_PROGRESS, null, at(LIFE_REACH + 0.1))).toBeNull();
    expect(pickNearby(x, z, 0, false, EMPTY_PROGRESS, previous, at(LIFE_REACH + 0.1))).toBe(previous);
    expect(pickNearby(x, z, 0, false, EMPTY_PROGRESS, previous, at(LIFE_REACH + NEARBY_KEEP + 0.1))).toBeNull();
    // It set off, or went indoors: no distance to it any more.
    expect(pickNearby(x, z, 0, false, EMPTY_PROGRESS, previous, { near: null, dist: Infinity, previousDist: Infinity })).toBeNull();
    // Walking past a character: the button comes and goes once, with no flicker on the edge.
    let near: Nearby = null, changes = 0;
    for (let px = -5; px <= 5; px += 0.02) {
      const d = Math.abs(px) + 1;
      const next = pickNearby(x, z, 3, false, EMPTY_PROGRESS, near, { near: d < LIFE_REACH ? previous : null, dist: d, previousDist: d });
      if (next !== near) changes++;
      near = next;
    }
    expect(changes).toBe(2);
  });
});

describe("a click on a character", () => {
  const taps: Array<{ x: number; z: number }> = [];
  let off = () => {};
  beforeEach(() => {
    taps.length = 0;
    off = events.on((e: GameEvent) => void (e.type === "tap" && taps.push({ x: e.x, z: e.z })));
  });
  afterEach(() => off());

  it("walks to a spot short of it from afar and opens its lines from talking distance, leaving no walk behind", () => {
    const ms = when("villager-2", (c) => !c.moving && c.presence === 1);
    frame(ms);
    const i = lifeIndex("villager-2"), at = here("villager-2");
    // This villager looks at the tree from inside the tree's own reach. Coming from the far side of the tree:
    stand(at.x - 9, at.z);
    visitCharacter(lifeTap(i), lifePanel("villager-2"), LIFE_TALK_REACH, LIFE_TALK_STAND);
    expect(useVila.getState().panel).toEqual({ kind: "none" });
    const to = useVila.getState().target!;
    // The walk ends beside the character, on the avatar's side, within talking reach: not on top of it.
    expect(Math.hypot(to.x - at.x, to.z - at.z)).toBeCloseTo(LIFE_TALK_STAND, 1);
    expect(to.x).toBeLessThan(at.x);
    expect(taps).toEqual([to]);
    stand(to.x, to.z);
    frame(ms);
    expect(name(offer(to.x, to.z))).toBe("villager-2");
    // From there the click (like the action button) opens the dialogue, and the walk is gone.
    visitCharacter(lifeTap(i), lifePanel("villager-2"), LIFE_TALK_REACH, LIFE_TALK_STAND);
    const panel = useVila.getState().panel;
    expect(panel.kind === "life" && panel.charId).toBe("villager-2");
    expect([useVila.getState().target, sim.route.active]).toEqual([null, false]);
    // Coming from the tree's side the avatar stops inside the tree's reach: the button stays the tree's
    // ("Doação global" is never taken over), and a click on the villager from there still opens its lines.
    useVila.getState().close();
    stand(at.x + LIFE_TALK_STAND, at.z);
    frame(ms);
    expect(name(offer(sim.pose.x, sim.pose.z))).toBe("tree");
    visitCharacter(lifeTap(i), lifePanel("villager-2"), LIFE_TALK_REACH, LIFE_TALK_STAND);
    expect(useVila.getState().panel.kind).toBe("life");
  });

  it("meets a character that is walking where it is going, and opens nothing until it stands", () => {
    const ms = when("elf-2", (c) => c.moving && c.presence === 1, 9);
    frame(ms);
    const i = lifeIndex("elf-2");
    const tap = lifeTap(i);
    const going = LIFE_CAST[i].spots[life.shared.spot[i]];
    expect(tap.ready).toBe(false);
    expect([tap.x, tap.z]).toEqual([going.x, going.z]);
    stand(life.shared.x[i] + 0.5, life.shared.z[i]);
    visitCharacter(tap, lifePanel("elf-2"), LIFE_TALK_REACH, LIFE_TALK_STAND);
    expect(useVila.getState().panel).toEqual({ kind: "none" });
    const to = useVila.getState().target;
    if (to) expect(Math.hypot(to.x - going.x, to.z - going.z)).toBeLessThan(LIFE_TALK_REACH);
  });
});

describe("what each one says where it is", () => {
  const lines = (id: string) => {
    const panel = lifePanel(id);
    if (!panel || panel.kind !== "life") throw new Error(`${id} has nothing to say`);
    return panel;
  };

  it("the lumberjack at the wood yard, a shopkeeper at the shop, Santa by the sleigh and by the tree, a villager on the bench", () => {
    frame(when("lumberjack", (c) => c.activity === "chop"));
    expect(lines("lumberjack")).toMatchObject({ name: "Lenhador", lines: ["A lenha da Vila vai sair daqui, do pátio na beira da floresta.", "O pátio da lenha ainda não abriu.", NOTHING_SOLD] });
    frame(when("lumberjack", (c) => c.activity === "carry"));
    expect(lines("lumberjack").lines[0]).toBe("Estou levando umas achas para perto do Empório da Lareira.");

    frame(when("shopkeeper-2", (c) => c.activity === "tend", 10));
    expect(lines("shopkeeper-2")).toMatchObject({ name: "Lojista", lines: ["Este lugar se chama Oficina de Brinquedos. O tema é brinquedos e lembranças.", "A loja ainda não abriu.", NOTHING_SOLD] });
    frame(when("shopkeeper-4", (c) => c.activity === "sweep", 10));
    expect(lines("shopkeeper-4").lines.slice(0, 2)).toEqual(["Este lugar se chama Empório da Lareira. O tema é lenha e lanternas.", "A loja ainda não abriu. Enquanto isso, varro a neve da porta."]);

    frame(when("santa", (c) => !c.moving && c.presence === 1 && c.z > 15, 10));
    expect(lines("santa")).toMatchObject({ name: "Papai Noel", lines: ["Ho, ho, ho! Que alegria ver você na Vila.", "Estou cuidando do trenó e das renas.", "Cada casa em volta da praça é de uma ONG. Conheça no seu tempo."] });
    frame(when("santa", (c) => !c.moving && c.presence === 1 && c.z < 10, 10));
    expect(lines("santa").lines[1]).toBe("A árvore da praça é o coração da Vila.");

    const morning = when("villager-5", (c) => c.activity === "chat", 9, 3);
    frame(morning);
    const villager = lines("villager-5");
    expect(villager.name).toBe("Morador da Vila");
    expect(villager.lines.slice(0, 2)).toEqual(["Bom dia! O céu limpou e a praça está brilhando.", "Paramos aqui no banco para pôr a conversa em dia."]);
    expect(WAYS).toContain(villager.lines[2]);
    // The weather of the moment: the same villager in a snowfall says so.
    useEnvUi.setState({ debug: { weather: "SNOW" } });
    life.sim = null;
    frame(when("villager-2", (c) => !c.moving && c.presence === 1, 14, 4));
    expect(lines("villager-2").lines[0]).toBe("Boa tarde! Olha a neve caindo. A Vila fica ainda mais bonita.");
    // Animals and unknown ids have no dialogue.
    expect(lifePanel("dog-1")).toBeNull();
    expect(lifePanel("nobody")).toBeNull();
  });
});
