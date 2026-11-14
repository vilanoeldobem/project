/**
 * The village's characters on this client (IMPL-0025, PROPOSTA): the shared simulation evaluated once per frame
 * for the synchronized village time, and, on top of it, what only this visitor sees (which characters are near
 * enough to draw, how they react to the avatar, their poses). Plain mutable arrays, like `sim.ts`: the frame
 * loop reads and writes them without React. Nothing here is sent anywhere.
 */
import { clearance } from "@vila/shared/game/collision";
import { compileLife, createLifeState, evaluateLife, isPerson, type Life, LIFE, LIFE_ACTIVITIES, LIFE_CAST, sampleLife, warmLife } from "@vila/shared/game/life";
import { LIFE_NAMES, lifeTalk } from "@vila/shared/game/life-dialogue";
import { ROOM_CAPACITY } from "@vila/shared/net/protocol";

import { env, frameAt, useEnvUi, worldNow } from "../environment/runtime";
import { remotes } from "../net/multiplayer";
import { createReactions, forget, react, REACT, type Reactions } from "./life-reactions";
import { sim } from "./sim";
import type { Nearby, Panel } from "./store";

export const LIFE_COUNT = LIFE_CAST.length;
/** How close the avatar stands to talk (u). Shorter than a quest NPC's: nothing blocks the way to a character. */
export const LIFE_TALK_REACH = 2.4;
/** A click on a character that is too far walks the avatar to this distance from it. */
export const LIFE_TALK_STAND = 1.3;

/**
 * How far from the avatar characters are drawn, and how many at most, by quality preset. The whole cast is one
 * draw call whatever is drawn, so the presets differ in triangles only: the low preset draws the nearest few.
 */
export const LIFE_DRAW: Record<"low" | "medium" | "high" | "ultra", { radius: number; most: number }> = {
  low: { radius: 30, most: 14 },
  medium: { radius: 46, most: LIFE.maxPopulation },
  high: { radius: 60, most: LIFE.maxPopulation },
  ultra: { radius: 72, most: LIFE.maxPopulation },
};
/** A character comes into the picture this much inside the radius and leaves it this much outside. */
export const LIFE_HYSTERESIS = 3;

const ACTIVITY = Object.fromEntries(LIFE_ACTIVITIES.map((a, i) => [a, i])) as Record<(typeof LIFE_ACTIVITIES)[number], number>;
const KIND = LIFE_CAST.map((c) => c.kind);
const PERSON = LIFE_CAST.map((c) => isPerson(c.kind));
/** Interaction targets, built once: offering one allocates nothing. */
export const LIFE_NEAR: Array<NonNullable<Nearby> & { kind: "life" }> = LIFE_CAST.map((c) => ({ kind: "life", charId: c.id }));
const INDEX = new Map(LIFE_CAST.map((c, i) => [c.id, i]));
export const lifeIndex = (charId: string): number => INDEX.get(charId) ?? -1;

export const life = {
  /** Off while the visitor hides the characters in the settings, or before the scene is up. */
  on: false,
  sim: null as Life | null,
  seed: Number.NaN,
  /** Where everyone is for every visitor (`sampleLife`). Never written to by anything but the simulation. */
  shared: createLifeState(LIFE_COUNT),
  reactions: createReactions(LIFE_COUNT) as Reactions,
  /** Where each character is drawn: its shared position plus this visitor's offset. */
  x: new Float32Array(LIFE_COUNT),
  z: new Float32Array(LIFE_COUNT),
  y: new Float32Array(LIFE_COUNT),
  yaw: new Float32Array(LIFE_COUNT),
  /** Pose: the walk angle, two gesture angles, the lean, whether what is held shows, and the size (0 = off stage). */
  swing: new Float32Array(LIFE_COUNT),
  first: new Float32Array(LIFE_COUNT),
  second: new Float32Array(LIFE_COUNT),
  lean: new Float32Array(LIFE_COUNT),
  prop: new Float32Array(LIFE_COUNT),
  scale: new Float32Array(LIFE_COUNT),
  /** Drawn this frame; `drawn` of them. `version` changes when the set does. */
  visible: new Uint8Array(LIFE_COUNT),
  drawn: 0,
  version: 0,
  /** The radius in force: it shrinks while more characters are near than the preset draws. */
  radius: 0,
};

/** The simulation for the seed the village shares (the environment snapshot's), compiled when it is first needed or changes. */
function simulation(): Life {
  const seed = useEnvUi.getState().snapshot.weatherSeed;
  if (!life.sim || life.seed !== seed) {
    // The routines read the hour, the snow and the events from the same frame function as the sky, so a
    // developer's `envTime` / `envWeather` moves the characters too.
    life.sim = compileLife(seed, { hourAt: (ms) => frameAt(ms).hour, snowAt: (ms) => frameAt(ms).weather.snowfall, festiveAt: (ms) => frameAt(ms).events.length > 0 });
    warmLife(life.sim);
    life.seed = seed;
  }
  return life.sim;
}

const visitorX = new Float32Array(ROOM_CAPACITY + 1), visitorZ = new Float32Array(ROOM_CAPACITY + 1);
/** Cosine and sine of the sides a blocked step aside tries, nearest to its own direction first: ±60°, ±120°, 180°. */
const TURNS = [0.5, 0.866, 0.5, -0.866, -0.5, 0.866, -0.5, -0.866, -1, 0];
const TWO_PI = Math.PI * 2;
/** Shortest turn from one heading to another. */
const turn = (from: number, to: number) => {
  const d = (to - from) % TWO_PI;
  return d > Math.PI ? d - TWO_PI : d < -Math.PI ? d + TWO_PI : d;
};
/** Walk-cycle length (u) by size of the animal: small ones take quick steps. */
const stride = (i: number) => (PERSON[i] ? 1.1 : KIND[i] === "reindeer" ? 1.3 : 0.6);

/**
 * One frame: evaluates the shared simulation for `epochMs`, decides who is drawn, moves the drawn ones aside
 * for the avatars and poses them. `seconds` are the shared world seconds (gestures are in step for everyone),
 * `calm` = less motion asked for. Allocates nothing.
 */
export function tickLife(epochMs: number, seconds: number, dt: number, quality: keyof typeof LIFE_DRAW, calm: boolean): void {
  const s = life.shared, r = life.reactions;
  s.epochMs = epochMs;
  evaluateLife(simulation(), s);
  const px = sim.pose.x, pz = sim.pose.z;
  // Avatars in the village: this visitor's first, then the others'.
  let visitors = 1;
  visitorX[0] = px;
  visitorZ[0] = pz;
  for (const other of remotes.values()) {
    if (visitors > ROOM_CAPACITY) break;
    visitorX[visitors] = other.x;
    visitorZ[visitors++] = other.z;
  }
  const draw = LIFE_DRAW[quality];
  if (!(life.radius > 0) || life.radius > draw.radius) life.radius = draw.radius;
  const colliders = sim.nav?.colliders;
  let drawn = 0, changed = false;
  for (let i = 0; i < LIFE_COUNT; i++) {
    const dx = s.x[i] - px, dz = s.z[i] - pz;
    const d = Math.sqrt(dx * dx + dz * dz);
    const was = life.visible[i];
    const show = life.on && s.presence[i] > 0 && d < life.radius + (was ? LIFE_HYSTERESIS : -LIFE_HYSTERESIS) ? 1 : 0;
    if (show !== was) (life.visible[i] = show), (changed = true);
    if (!show) {
      if (was) forget(r, i);
      life.x[i] = s.x[i];
      life.z[i] = s.z[i];
      life.scale[i] = 0;
      continue;
    }
    drawn++;
    const kind = KIND[i], moving = s.moving[i] === 1;
    react(r, i, kind, simulation().chars[i].radius, s.x[i], s.z[i], s.y[i], moving, visitorX, visitorZ, visitors, dt, calm);
    let ox = r.ox[i], oz = r.oz[i];
    // A step aside never ends inside something solid (a bench behind the character, a fence): the step turns
    // to the first side that is clear, and is given up only when every side is taken.
    if (colliders && (ox !== 0 || oz !== 0) && s.y[i] < 1 && clearance(colliders, s.x[i] + ox, s.z[i] + oz) < 0) {
      let k = 0;
      for (; k < TURNS.length; k += 2) {
        const tx = ox * TURNS[k] - oz * TURNS[k + 1], tz = ox * TURNS[k + 1] + oz * TURNS[k];
        if (clearance(colliders, s.x[i] + tx, s.z[i] + tz) < 0) continue;
        ox = tx;
        oz = tz;
        break;
      }
      if (k >= TURNS.length) ox = oz = 0;
    }
    life.x[i] = s.x[i] + ox;
    life.z[i] = s.z[i] + oz;
    life.scale[i] = s.presence[i];
    life.yaw[i] = s.yaw[i] + turn(s.yaw[i], r.faceYaw[i]) * r.face[i];
    // ---- pose, from the activity and the reaction ----
    const activity = s.activity[i];
    const beat = calm ? 0 : 1;
    let swing = 0, first = 0, second = 0, lean = 0, prop = 0, lift = 0;
    if (moving) {
      const phase = (s.walked[i] / stride(i)) * Math.PI;
      swing = Math.sin(phase) * 0.7 * beat;
      if (kind === "rabbit" || (kind === "bird" && s.y[i] < 1)) lift = Math.abs(Math.sin(phase)) * 0.22 * beat;
      else if (PERSON[i]) lift = Math.abs(Math.sin(phase)) * 0.05 * beat;
    }
    const wave = Math.sin(seconds * 3 + i);
    if (PERSON[i]) {
      if (activity === ACTIVITY.carry) (first = second = -1.25), (prop = 1);
      else if (activity === ACTIVITY.chop) first = second = -2 + 1.7 * Math.abs(Math.sin(seconds * 2.6)) * beat;
      else if (activity === ACTIVITY.sweep) (first = -0.7 + 0.35 * wave * beat), (second = -0.5 + 0.35 * wave * beat), (prop = 1), (lean = 0.12);
      else if (activity === ACTIVITY.stack || activity === ACTIVITY.load || activity === ACTIVITY.place || activity === ACTIVITY.feed) (first = -0.9 + 0.4 * wave * beat), (second = -0.6 - 0.3 * wave * beat), (lean = 0.1);
      else if (activity === ACTIVITY.tend) first = -0.25 * Math.max(0, wave) * beat;
      else if (activity === ACTIVITY.chat) first = -0.9 * Math.max(0, Math.sin(seconds * 1.7 + i * 2)) * beat;
      // A wave to the visitor: the right arm up, over whatever it was doing.
      if (r.wave[i] > 0) first = -2.7 + 0.35 * Math.sin(seconds * 11);
    } else if (kind === "reindeer") {
      // Head down to graze; up when the avatar is near.
      first = (activity === ACTIVITY.graze && !moving ? 0.75 + 0.08 * wave * beat : 0.1) * (1 - r.alert[i]) - 0.3 * r.alert[i];
    } else if (kind === "dog") {
      first = activity === ACTIVITY.sniff && !moving ? 0.5 * (1 - r.alert[i]) : -0.2 * r.alert[i];
      second = r.alert[i] * 0.6 * Math.sin(seconds * 13) * beat;
    } else if (kind === "cat") {
      second = 0.25 * Math.sin(seconds * 1.4 + i) * beat;
    } else if (kind === "bird") {
      if (activity === ACTIVITY.peck && !moving) lean = 0.6 * Math.max(0, Math.sin(seconds * 5 + i)) * beat;
      lift += r.alert[i] * Math.abs(Math.sin(seconds * 7 + i)) * 0.3;
    } else if (kind === "owl") {
      lean = 0.08 * wave * beat;
    }
    life.swing[i] = swing;
    life.first[i] = first;
    life.second[i] = second;
    life.lean[i] = lean;
    life.prop[i] = prop;
    life.y[i] = s.y[i] + lift;
  }
  // More characters near than this preset draws: pull the radius in a little; let it out again when there is room.
  if (drawn > draw.most) life.radius = Math.max(8, life.radius - 0.5);
  else if (drawn < draw.most - 2 && life.radius < draw.radius) life.radius = Math.min(draw.radius, life.radius + 0.1);
  life.drawn = drawn;
  if (changed) life.version++;
}

/** A character a visitor can talk to right now: a person, on stage, standing. */
const talkable = (i: number) => PERSON[i] && life.visible[i] === 1 && life.shared.presence[i] >= 0.99 && life.shared.moving[i] === 0;

/** Result of `lifeNear`: module scratch, read right after the call. */
export const lifeNearby = { near: null as Nearby, dist: Infinity, previousDist: Infinity };

/**
 * The character nearest to a point that can be talked to from there, and how far the character on offer
 * (`previous`, if it is one) is. Fills and returns `lifeNearby`; allocates nothing.
 */
export function lifeNear(x: number, z: number, previous: Nearby): typeof lifeNearby {
  lifeNearby.near = null;
  lifeNearby.dist = Infinity;
  lifeNearby.previousDist = Infinity;
  if (!life.on) return lifeNearby;
  for (let i = 0; i < LIFE_COUNT; i++) {
    if (!talkable(i)) continue;
    const d = Math.hypot(life.x[i] - x, life.z[i] - z);
    if (LIFE_NEAR[i] === previous) lifeNearby.previousDist = d;
    if (d < LIFE_TALK_REACH && d < lifeNearby.dist) (lifeNearby.near = LIFE_NEAR[i]), (lifeNearby.dist = d);
  }
  return lifeNearby;
}

/** The dialogue of a character for where it is, what it is doing, the hour and the weather, as it is opened. */
export function lifePanel(charId: string): Panel | null {
  const i = lifeIndex(charId);
  const def = LIFE_CAST[i];
  if (!def) return null;
  const s = life.shared;
  const spot = def.spots[s.spot[i]] ?? def.spots[0];
  const hour = env.frame.hour;
  const talk = lifeTalk({ kind: def.kind, place: s.moving[i] ? "street" : spot.place, activity: LIFE_ACTIVITIES[s.activity[i]] ?? "stand", hour, snow: env.frame.weather.snowfall, shopId: def.shopId, turn: i + Math.floor(hour) });
  return talk ? { kind: "life", charId, name: talk.name, role: talk.role, lines: talk.lines } : null;
}

/**
 * What a click on a character does (`scene/Life.tsx` passes it to `game/clicks.ts`): where to stand to talk to
 * it, and whether it can be talked to now. A character on the move is met where it is going.
 */
export function lifeTap(i: number): { x: number; z: number; ready: boolean } {
  const s = life.shared, c = simulation().chars[i];
  const moving = s.moving[i] === 1;
  const x = moving ? c.sx[s.spot[i]] : life.x[i], z = moving ? c.sz[s.spot[i]] : life.z[i];
  return { x, z, ready: talkable(i) };
}

/** Name on the action button for a character ("Conversar com …"), or null for an animal. */
export const lifeAction = (charId: string): string | null => LIFE_NAMES[LIFE_CAST[lifeIndex(charId)]?.kind]?.action ?? null;

/** For the verify scripts: every character as the simulation has it and as it is drawn here. */
export function lifeReport() {
  const s = life.shared;
  return {
    now: worldNow(),
    at: s.epochMs,
    on: life.on,
    drawn: life.drawn,
    radius: life.radius,
    chars: LIFE_CAST.map((c, i) => ({
      id: c.id, kind: c.kind, x: s.x[i], z: s.z[i], y: s.y[i], presence: s.presence[i], moving: s.moving[i] === 1,
      activity: LIFE_ACTIVITIES[s.activity[i]], spot: s.spot[i], visible: life.visible[i] === 1,
      shownX: life.x[i], shownZ: life.z[i], offset: Math.hypot(life.reactions.ox[i], life.reactions.oz[i]),
    })),
  };
}

/** For the verify scripts: where everyone is at a given village time, by the same function (nothing is drawn from it). */
export function lifeAt(epochMs: number) {
  const out = sampleLife(simulation(), epochMs, createLifeState(LIFE_COUNT));
  // The frame's own state was planned for another time: the next frame plans it again.
  return LIFE_CAST.map((c, i) => ({ id: c.id, x: out.x[i], z: out.z[i], presence: out.presence[i], moving: out.moving[i] === 1 }));
}

/** For the verify scripts: this client's synchronized clock right now, and where that puts everyone (no frame involved). */
export function lifeNow() {
  const now = worldNow();
  return { now, chars: lifeAt(now) };
}

export { REACT };
