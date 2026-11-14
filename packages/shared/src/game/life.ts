/**
 * Village life (PROPOSTA of the technical owner, IMPL-0025; the final cast, names and routines are the product
 * owner's, OQ-20): Christmas characters and animals that walk the village on their own.
 *
 * **Shared simulation model.** Where every character is, is a pure function of (world seed, synchronized
 * village time, the village plan). Every visitor evaluates it from the clock they already share
 * (`environment/network-clock.ts`), so they all see the same characters in the same places with no message,
 * no Durable Object state and no database: the realtime server never simulates or relays a character.
 *
 * How a position is computed for a time `t`, with no stepping from zero:
 *
 * 1. Time is cut into **slots** per group of characters (a slot is one or a few minutes for a person, seconds
 *    for an animal). Slot `k` is `floor((t + phase) / length)`.
 * 2. Where a character stands in slot `k` is `choice(character, k)`: a hash of (seed, character, decision
 *    number) picks one of its own spots, with the weights of its routine for the hour at which the slot starts
 *    (and for the snow and the events of that moment). It depends on `k` only, never on what came before.
 * 3. Inside slot `k` the character walks from `choice(k - 1)` to `choice(k)` along a fixed polyline (street
 *    graph plus its own lane offset) at its own constant pace, then does the activity of the spot until the
 *    slot ends. The position is a linear interpolation on that polyline: continuous in `t`, and a clock that
 *    is a little off shows the character a little ahead or behind.
 *
 * **Not walking through things, not overlapping** (checked by `life.test.ts`, statically and by sampling):
 *
 * - every spot and every polyline is on open ground in both collider sets; people travel on the street graph
 *   (`LIFE_PATHS` = `PATH_GRAPH` without the chords of the round street, plus footpaths added on open ground);
 * - every character has spots of its own (a place has as many standing points as its capacity);
 * - characters whose walks could meet form a **group** and move one at a time inside a slot (each trip is
 *   scheduled after the previous one, in an order that turns with the slot); a companion (a dog) follows its
 *   leader's trip a moment later, beside it;
 * - the polylines and spots of different groups never come within the sum of the two bodies.
 *
 * Characters are not obstacles for the visitor's avatar and are not in the navigation grid: the client moves
 * them aside locally (a bounded, per-viewer offset; `apps/client/src/scene/life/reactions.ts`).
 *
 * No language model and no other AI service: behaviour is this schedule, and dialogue is fixed text
 * (`life-dialogue.ts`). No chat, no free text, no names of people.
 */
import { activeEvents, applyEvents } from "../environment/events";
import { WEATHER_SLOT_MS, WEATHER_TRANSITION_MS } from "../environment/config";
import { hash32, random01 } from "../environment/random";
import { saoPauloSecondsOfDay } from "../environment/time";
import { weatherAt } from "../environment/weather";
import { groundAt, LAMPS, PADDOCKS, PATH_GRAPH, PINES, SHOPS, SLEIGH, VILLAGE, VILLAGE_PLAN, WOOD_YARD, sideFrame } from "./world";

export { PADDOCKS } from "./world";

// ---------------------------------------------------------------------------------------------------------
// Config (PROPOSTA): every number below is a knob. Counts live in `LIFE_CAST`.
// ---------------------------------------------------------------------------------------------------------

export const LIFE = {
  /** Hard cap on the population: `compileLife` refuses a longer cast (the renderer sizes its buffers by it). */
  maxPopulation: 40,
  /** Seconds a character stays at a spot before its group's next slot can move it. */
  minDwell: 12,
  /** Seconds between two trips of the same group. */
  gap: 1.5,
  /** Seconds a character takes to appear or disappear at a door (an off-stage transition). */
  fade: 1.2,
  /** Hours (São Paulo) the shopkeepers stand at their shops. The shops themselves are closed. */
  shopHours: [9, 19] as const,
  /** Most people are home between these hours. */
  quietHours: [22, 7] as const,
  /** How far a lane offset may push a walker from the axis of a street (u). */
  maxLane: 0.6,
  /** Smallest free room (u, beyond an avatar-sized body) a spot or a polyline keeps from every collider. */
  clearance: 0.05,
  /** Slack (u) the bodies of two characters keep beyond touching. */
  bodyGap: 0,
} as const;

export type LifeKind = "santa" | "elf" | "shopkeeper" | "lumberjack" | "villager" | "visitor" | "reindeer" | "dog" | "cat" | "bird" | "rabbit" | "owl";
export const LIFE_KINDS: readonly LifeKind[] = ["santa", "elf", "shopkeeper", "lumberjack", "villager", "visitor", "reindeer", "dog", "cat", "bird", "rabbit", "owl"];
export const isPerson = (kind: LifeKind): boolean => kind === "santa" || kind === "elf" || kind === "shopkeeper" || kind === "lumberjack" || kind === "villager" || kind === "visitor";

/** What a character is doing. The client turns it into a pose; the dialogue uses it as context. */
export const LIFE_ACTIVITIES = ["stand", "walk", "carry", "chop", "stack", "sweep", "tend", "chat", "watch", "feed", "load", "place", "rest", "graze", "sniff", "sit", "peck", "perch"] as const;
export type LifeActivity = (typeof LIFE_ACTIVITIES)[number];
const ACTIVITY_INDEX = new Map<LifeActivity, number>(LIFE_ACTIVITIES.map((a, i) => [a, i]));

/** Where a spot is, for the dialogue: never a coordinate, only the kind of place. */
export type LifePlace = "home" | "street" | "square" | "tree" | "sleigh" | "bench" | "stall" | "shop" | "yard" | "paddock" | "billboard" | "pond" | "perch" | "edge";

/** Body radius (u) by kind: two characters never stand closer than the sum of theirs. */
export const LIFE_RADIUS: Record<LifeKind, number> = {
  santa: 0.75, elf: 0.4, shopkeeper: 0.45, lumberjack: 0.45, villager: 0.45, visitor: 0.45,
  reindeer: 1.2, dog: 0.55, cat: 0.35, bird: 0.2, rabbit: 0.3, owl: 0.2,
};
/** Walking pace (u/s) by kind, before the personal factor (`paceFactor`). The avatar runs at 8.5 u/s. */
export const LIFE_PACE: Record<LifeKind, number> = {
  santa: 2, elf: 3, shopkeeper: 2.4, lumberjack: 2.5, villager: 2.4, visitor: 2,
  reindeer: 0.8, dog: 3.2, cat: 2.2, bird: 5, rabbit: 2.6, owl: 1,
};
/** The personal pace is the kind's pace times a seeded factor in this range. */
export const PACE_RANGE = [0.88, 1.12] as const;

export interface LifeSpotDef {
  x: number;
  z: number;
  /** Height above the ground: only perched birds and the owl stand above 0 (over every head). */
  y?: number;
  /** Point the character faces while standing there. */
  look?: { x: number; z: number };
  activity: LifeActivity;
  place: LifePlace;
  /** Node of `LIFE_PATHS` the spot is reached from. Absent = walked to in a straight line (animals in their patch). */
  via?: string;
  /** Off stage: a door, the sleigh, a nest, the edge of the village. The character is not drawn while it stands there. */
  inside?: boolean;
  /** A trip that ends here is made carrying something (elves with gifts, the lumberjack with firewood). */
  carry?: boolean;
}

/** One stretch of the day: until `until` (hour, São Paulo), spot `i` is chosen with weight `w[i]`. */
export interface LifeRule {
  until: number;
  w: readonly number[];
  /** Weights while it snows at least the character's `snowLimit`. Default: its spot 0 (home or shelter). */
  snow?: readonly number[];
  /** Weights while a village event runs (Christmas Eve, Christmas Day, New Year). */
  festive?: readonly number[];
}

export interface LifeCharDef {
  id: string;
  kind: LifeKind;
  /** Seed of the generated model: the decorative critters keep the seeds they had. */
  seed: string;
  group: string;
  /** Spot 0 is where the character is when it is nowhere else: home, a nest, the sleigh. */
  spots: readonly LifeSpotDef[];
  routine: readonly LifeRule[];
  /** Slots a decision lasts: `[min, max]`, the character's own number is seeded. */
  linger: readonly [number, number];
  /** Snowfall (0..1) from which the routine's `snow` weights apply. Above 1 = never. */
  snowLimit: number;
  /** Lateral offset (u) on streets, to the right of the walking direction. */
  lane: number;
  /** Follows this character's trips `delay` seconds later, beside it (spots are parallel to the leader's). */
  follows?: { leader: string; delay: number };
  /** Makes the same choices as this character (spots are parallel): a pair that chats. */
  mirrors?: string;
  /** The shop a shopkeeper keeps. */
  shopId?: string;
}

export interface LifeGroupDef {
  id: string;
  /** Seconds per slot. */
  slot: number;
  /** Seconds left at the end of a slot after its last trip: `LIFE.minDwell` for people, a moment for an animal in its patch. */
  dwell?: number;
}

// ---------------------------------------------------------------------------------------------------------
// Paths: the street graph plus footpaths on open ground.
// ---------------------------------------------------------------------------------------------------------

export interface LifeNode {
  id: string;
  x: number;
  z: number;
  /** On a street, an avenue or a lane: the lane offset applies here. */
  street: boolean;
}
export interface LifeEdge {
  a: string;
  b: string;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
/** Point of side `s` (0 = east, counter-clockwise seen from above with +z towards the camera): `apothem` from the tree, `along` the side. */
export function sidePoint(s: number, apothem: number, along: number): { x: number; z: number } {
  const f = sideFrame(VILLAGE_PLAN, s);
  return { x: round2(apothem * f.nx + along * f.tx), z: round2(apothem * f.nz + along * f.tz) };
}
const pad2 = (n: number) => String(n).padStart(2, "0");
const laneNode = (s: number, what: string) => `lane-${pad2(s + 1)}-${what}`;
const avenueNode = (n: number, what: string) => `avenue-${pad2(n)}-${what}`;

// The lane of the north-east side leaves the square over the frozen pond: characters keep off the ice, so that
// node is left out (the villager who lives on that side goes home up the avenue beside it).
const nodes: LifeNode[] = PATH_GRAPH.nodes.filter((n) => groundAt(n.x, n.z) !== "ice").map((n) => ({ ...n, street: true }));
const kept = new Set(nodes.map((n) => n.id));
// The chords of the round street cut the plaza's lamps and the small pines: nobody walks them.
const edges: LifeEdge[] = PATH_GRAPH.edges.filter((e) => e.kind !== "plaza" && kept.has(e.a) && kept.has(e.b)).map(({ a, b }) => ({ a, b }));
const node = (id: string, p: { x: number; z: number }, street = false) => (nodes.push({ id, x: p.x, z: p.z, street }), id);
const link = (...ids: string[]) => {
  for (let i = 1; i < ids.length; i++) edges.push({ a: ids[i - 1], b: ids[i] });
};

const PREMIUM = VILLAGE.rings.find((r) => r.zone === "premium")!;
const ECONOMY = VILLAGE.rings.find((r) => r.zone === "economy")!;
const streetAxis = (ring: typeof PREMIUM) => (ring.street![0] + ring.street![1]) / 2;

/**
 * A home: the gateway of a chalet's plot, reached along the street of its ring from `from` (a node on that
 * street). The character stands in the gateway and goes in: an off-stage spot.
 */
function home(s: number, along: number, ring: typeof PREMIUM, from: string): LifeSpotDef {
  const id = `${ring.zone}:${s}:${along}`;
  const row = node(`row:${id}`, sidePoint(s, streetAxis(ring), along), true);
  const front = node(`front:${id}`, sidePoint(s, ring.front - 0.75, along));
  link(from, row, front);
  // Premium: the gate in the stone wall, 0.75 u inside the plot. Economy: the open yard in front of the door.
  return { ...sidePoint(s, ring.front + (ring.zone === "premium" ? 0.6 : 0.7), along), look: sidePoint(s, ring.front + 4, along), activity: "rest", place: "home", via: front, inside: true };
}
const premiumHome = (s: number, half: -1 | 1) => home(s, half * (VILLAGE_PLAN.laneWidth / 2 + VILLAGE_PLAN.tiers.premium.width / 2), PREMIUM, laneNode(s, "street-1"));

const TREE = { x: 0, z: 0 };

// --- South of the tree: the sleigh, Santa and the elves ---------------------------------------------------
const S_TOP = node("sq:sleigh-top", { x: -3.9, z: 15 });
const S_LOW = node("sq:sleigh-low", { x: -3.6, z: 9.8 });
link(S_TOP, S_LOW);
const LOADS = [{ x: -5, z: 17 }, { x: -3.7, z: 17.4 }, { x: -2.4, z: 17 }].map((p, i) => ({ p, id: node(`sq:load-${i + 1}`, p) }));
for (const l of LOADS) link(l.id, S_TOP);
const SANTA_SLEIGH = node("sq:santa-sleigh", { x: -0.3, z: 16.4 });
link(SANTA_SLEIGH, S_TOP);
const GIFT_SPOTS = [{ x: -0.9, z: 6.9 }, { x: -2.1, z: 6.6 }, { x: -3.3, z: 6.2 }];

// --- The four shops: a node in front of each door, joined to the lane of its side --------------------------
const SHOP_SIDE = (i: number) => i * VILLAGE_PLAN.shopEvery;
const SHOP_FRONT = SHOPS.map((_, i) => {
  const s = SHOP_SIDE(i);
  const id = node(`sq:shop-${i + 1}`, sidePoint(s, VILLAGE.rings[0].front - 1.8, -5));
  link(id, laneNode(s, "square"));
  return id;
});

// --- East: the market stall, the round street and the plaza, for the villager who stood on the round street
const E1 = node("sq:east-1", { x: 20.6, z: -3.3 });
const E2 = node("sq:east-2", { x: 18, z: -1.8 });
const E3 = node("sq:east-3", { x: 14.6, z: -2.6 });
link(laneNode(0, "square"), E1, E2, E3);

// --- West: around the market stalls ----------------------------------------------------------------------
const W1 = node("sq:west-1", { x: -16.5, z: 2.9 });
const W2 = node("sq:west-2", { x: -20.3, z: 6 });
const W0 = node("sq:west-0", { x: -7, z: 2.5 });
link(W0, W1, W2, SHOP_FRONT[2]);

// --- North: the lumberjack's lane, from the wood yard to the square -------------------------------------------
const YARD = laneNode(6, "end");

// --- South-west: the bench where two villagers chat --------------------------------------------------------
const SW1 = node("sq:sw-1", sidePoint(3, 21, -0.9));
const SW2 = node("sq:sw-2", sidePoint(3, 19.6, -1.3));
const SW3 = node("sq:sw-3", sidePoint(3, 16.5, -2.6));
const SW4 = node("sq:sw-4", sidePoint(3, 14.5, -2.9));
const SW5 = node("sq:sw-5", sidePoint(3, 10.2, -2.4));
const SW6 = node("sq:sw-6", sidePoint(3, 8.6, -1.2));
link(laneNode(3, "square"), SW1, SW2, SW3, SW4, SW5, SW6);

// --- South-east: the reindeer pen and the villager who feeds them ---------------------------------------------
const SE1 = node("sq:se-1", sidePoint(1, 20.6, 0));
const SE2 = node("sq:se-2", sidePoint(1, 18.5, 2));
link(laneNode(1, "square"), SE1, SE2);

// --- North-east: a villager and a dog, who go home up an avenue (the pond lies on the lane of that side) ------
const NE0 = node("sq:ne-0", { x: 6, z: -6.5 });
const NE1 = node("sq:ne-1", sidePoint(7, 11, -2.6));
const NE2 = node("sq:ne-2", sidePoint(7, 14.5, -2.4));
link(NE0, NE1, avenueNode(7, "plaza"));
// The pond side joins the avenue directly: through the first stretch it would be a hairpin, and a dog that
// follows a moment behind would cut across its owner there.
link(NE1, NE2, avenueNode(7, "plaza"));

// --- Avenues walked by the seasonal visitors: a stop by the billboard of the shop at each avenue's mouth -------
const AVENUE_OF_VISITOR = [2, 4, 8] as const;
const AVENUE_STOP = AVENUE_OF_VISITOR.map((n) => {
  const p = PATH_GRAPH.nodes.find((x) => x.id === avenueNode(n, "plaza"))!;
  const k = 27 / Math.hypot(p.x, p.z);
  const id = node(`avenue-${pad2(n)}-billboard`, { x: round2(p.x * k), z: round2(p.z * k) }, true);
  link(avenueNode(n, "plaza"), id, avenueNode(n, "street-1"));
  return id;
});

export const LIFE_PATHS: { nodes: LifeNode[]; edges: LifeEdge[] } = { nodes, edges };

// ---------------------------------------------------------------------------------------------------------
// Cast (PROPOSTA; OQ-20). One table: who, where, when.
// ---------------------------------------------------------------------------------------------------------

/** Weights: `rule(until, ...w)`. */
const rule = (until: number, w: number[], extra: Partial<LifeRule> = {}): LifeRule => ({ until, w, ...extra });
const [QUIET_FROM, QUIET_UNTIL] = LIFE.quietHours;
const [OPEN, CLOSE] = LIFE.shopHours;

function shopkeeper(i: number): LifeCharDef {
  const shop = SHOPS[i], s = SHOP_SIDE(i);
  const front = SHOP_FRONT[i];
  return {
    id: `shopkeeper-${i + 1}`, kind: "shopkeeper", seed: `shopkeeper-${i + 1}`, group: `shop-${i + 1}`, shopId: shop.id,
    spots: [
      premiumHome(s, -1),
      // `ShopDef.keeper`: the spot the village plan left beside each door.
      { x: shop.keeper.x, z: shop.keeper.z, look: TREE, activity: "tend", place: "shop", via: front },
      { ...sidePoint(s, VILLAGE.rings[0].front - 1.4, -5.9), look: shop.door, activity: "sweep", place: "shop", via: front },
    ],
    // At the shop a quarter of an hour before its hours and until they end; home otherwise. In heavy snow: no sweeping.
    routine: [rule(OPEN - 0.25, [1, 0, 0]), rule(CLOSE, [0, 7, 3], { snow: [0, 1, 0] }), rule(24, [1, 0, 0])],
    linger: [1, 3], snowLimit: 0.6, lane: 0.5,
  };
}

/** A villager's day: spot 0 is home, the others are weighted `out` while people are out. */
const villagerDay = (out: number[], evening: number[] = out): LifeRule[] => [
  rule(QUIET_UNTIL, [1, ...out.map(() => 0)]),
  rule(12, [0.4, ...out]),
  rule(13.5, [3, ...out]),
  rule(18, [0.4, ...out]),
  rule(QUIET_FROM, [1, ...evening], { festive: [0, ...evening] }),
  rule(24, [1, ...out.map(() => 0)], { festive: [0.5, ...evening] }),
];

function visitor(i: number): LifeCharDef {
  const n = AVENUE_OF_VISITOR[i];
  const at = (id: string) => PATH_GRAPH.nodes.find((x) => x.id === id)!;
  const stop = nodes.find((x) => x.id === AVENUE_STOP[i])!;
  const shop = SHOPS[[1, 2, 0][i]];
  /** A point beside the avenue at one of its nodes: `side` u to the left (+) or right (-) looking outwards. */
  const beside = (p: { x: number; z: number }, side: number) => {
    const r = Math.hypot(p.x, p.z);
    return { x: round2(p.x + (side * p.z) / r), z: round2(p.z - (side * p.x) / r) };
  };
  const plaza = at(avenueNode(n, "plaza")), corner1 = at(avenueNode(n, "street-1")), corner2 = at(avenueNode(n, "street-2")), end = at(avenueNode(n, "end"));
  return {
    id: `visitor-${i + 1}`, kind: "visitor", seed: `visitor-${i + 1}`, group: `avenue-${n}`,
    spots: [
      // Seasonal visitors come and go by the end of an avenue, at the edge of the village.
      { x: end.x, z: end.z, look: TREE, activity: "stand", place: "edge", via: end.id, inside: true },
      { ...beside(stop, -1.1), look: { x: shop.x, z: shop.z }, activity: "watch", place: "billboard", via: stop.id },
      { ...beside({ x: plaza.x * 1.09, z: plaza.z * 1.09 }, 1), look: TREE, activity: "watch", place: "square", via: plaza.id },
      { ...beside(corner1, 1.2), look: TREE, activity: "stand", place: "street", via: corner1.id },
      { ...beside(corner2, -1.2), look: TREE, activity: "stand", place: "street", via: corner2.id },
    ],
    routine: [rule(10, [1, 0, 0, 0, 0]), rule(21, [0.3, 3, 3, 2, 1], { festive: [0, 3, 4, 1, 0] }), rule(24, [1, 0, 0, 0, 0], { festive: [1, 2, 3, 0, 0] })],
    linger: [1, 2], snowLimit: 0.6, lane: 0.6,
  };
}

/** An animal that keeps to a small patch of open ground: its spots are walked to in straight lines. */
function roamer(id: string, kind: LifeKind, activity: LifeActivity, place: LifePlace, points: Array<{ x: number; z: number }>, routine: LifeRule[], extra: Partial<LifeCharDef> = {}): LifeCharDef {
  return {
    id, kind, seed: id, group: id,
    spots: [{ ...points[0], activity: "rest", place, inside: true }, ...points.map((p, i) => ({ ...p, look: points[(i + 1) % points.length], activity: i % 2 ? ("rest" as const) : activity, place }))],
    routine, linger: [1, 3], snowLimit: 2, lane: 0, ...extra,
  };
}
const always = (n: number): LifeRule[] => [rule(24, [0, ...Array.from({ length: n }, () => 1)])];
const byDay = (n: number, from: number, to: number): LifeRule[] => [
  rule(from, [1, ...Array.from({ length: n }, () => 0)]),
  rule(to, [0, ...Array.from({ length: n }, () => 1)]),
  rule(24, [1, ...Array.from({ length: n }, () => 0)]),
];
/** Lamp top: where the two birds that were perched there still perch. */
const lampTop = (i: number) => ({ x: LAMPS[i][0], z: LAMPS[i][1], y: 4.5 });
/** A point on the long axis of the reindeer pen of a side, `depth` u in from its open end. */
const pen = (side: number, depth: number) => {
  const p = PADDOCKS.find((x) => x.side === side)!;
  return sidePoint(side, p.apothem[0] + depth, (p.along[0] + p.along[1]) / 2);
};

const SLEIGH_NAP = { x: -0.6, z: 18.1 };
const LUMBER_HOME = home(6, VILLAGE_PLAN.laneWidth / 2 + VILLAGE_PLAN.tiers.economy.width / 2, ECONOMY, laneNode(6, "street-3"));
const VILLAGER_1_HOME = (() => {
  // The pond lies on the lane of the north-east side, so this home is reached from the avenue beside it.
  const along = -(VILLAGE_PLAN.laneWidth / 2 + VILLAGE_PLAN.tiers.premium.width / 2);
  return home(7, along, PREMIUM, avenueNode(7, "street-1"));
})();
const OWL_PINE = { x: PINES[3][0], z: PINES[3][1], y: 11 };

export const LIFE_GROUPS: LifeGroupDef[] = [
  { id: "sleigh", slot: 75 },
  { id: "shop-1", slot: 180 },
  { id: "shop-2", slot: 240 },
  { id: "shop-3", slot: 180 },
  { id: "shop-4", slot: 200 },
  { id: "bench-sw", slot: 150 },
  { id: "pen-se", slot: 160 },
  { id: "north-east", slot: 170 },
  { id: "avenue-2", slot: 150 },
  { id: "avenue-4", slot: 190 },
  { id: "avenue-8", slot: 170 },
  { id: "reindeer-1", slot: 16, dwell: 1 },
  { id: "reindeer-2", slot: 19, dwell: 1 },
  { id: "dog-2", slot: 8, dwell: 1 },
  { id: "cat-1", slot: 11, dwell: 1 },
  { id: "cat-2", slot: 13, dwell: 1 },
  { id: "bird-1", slot: 23, dwell: 1 },
  { id: "bird-2", slot: 29, dwell: 1 },
  { id: "bird-3", slot: 5, dwell: 1 },
  { id: "bird-4", slot: 6, dwell: 1 },
  { id: "rabbit-1", slot: 7, dwell: 1 },
  { id: "owl-1", slot: 300, dwell: 1 },
];

const ELF_DAY: LifeRule[] = [rule(8, [1, 0, 0]), rule(21, [0, 5, 5], { snow: [1, 2, 0] }), rule(24, [1, 0, 0], { festive: [1, 2, 2] })];

export const LIFE_CAST: LifeCharDef[] = [
  {
    id: "santa", kind: "santa", seed: "santa", group: "sleigh",
    spots: [
      // Santa rests in the sleigh: an off-stage spot beside it.
      { ...SLEIGH_NAP, look: SLEIGH, activity: "rest", place: "sleigh", via: SANTA_SLEIGH, inside: true },
      { x: -0.3, z: 16.4, look: SLEIGH, activity: "tend", place: "sleigh", via: SANTA_SLEIGH },
      { x: 1.3, z: 7.4, look: TREE, activity: "watch", place: "tree", via: S_LOW },
    ],
    routine: [rule(10, [1, 0, 0]), rule(21.5, [0, 4, 5], { festive: [0, 2, 6] }), rule(24, [1, 0, 0], { festive: [1, 1, 2] })],
    linger: [1, 3], snowLimit: 2, lane: 0,
  },
  ...LOADS.map((load, i): LifeCharDef => ({
    id: `elf-${i + 1}`, kind: "elf", seed: `elf-${i + 1}`, group: "sleigh",
    spots: [
      { x: load.p.x + 0.1, z: load.p.z + 0.95, look: SLEIGH, activity: "rest", place: "sleigh", via: load.id, inside: true },
      { ...load.p, look: SLEIGH, activity: "load", place: "sleigh", via: load.id },
      { ...GIFT_SPOTS[i], look: TREE, activity: "place", place: "tree", via: S_LOW, carry: true },
    ],
    routine: ELF_DAY, linger: [1, 2], snowLimit: 0.9, lane: 0,
  })),
  ...SHOPS.map((_, i) => shopkeeper(i)),
  {
    id: "lumberjack", kind: "lumberjack", seed: "lumberjack", group: "shop-4",
    spots: [
      LUMBER_HOME,
      { x: WOOD_YARD.x, z: WOOD_YARD.z + 1.9, look: WOOD_YARD, activity: "chop", place: "yard", via: YARD },
      { x: WOOD_YARD.x - 2.8, z: WOOD_YARD.z, look: WOOD_YARD, activity: "stack", place: "yard", via: YARD },
      // Firewood for the "Empório da Lareira" (shop 4, north side): carried down the lane and set down by its door.
      { ...sidePoint(6, VILLAGE.rings[0].front - 3.1, -3), look: SHOPS[3].door, activity: "stack", place: "shop", via: laneNode(6, "square"), carry: true },
      { ...sidePoint(6, 50.2, 1.2), look: TREE, activity: "rest", place: "street", via: laneNode(6, "street-2") },
    ],
    routine: [rule(7, [1, 0, 0, 0, 0]), rule(12, [0, 6, 2, 2, 1]), rule(13, [1, 0, 0, 0, 2]), rule(18, [0, 6, 2, 2, 1]), rule(24, [1, 0, 0, 0, 0])],
    linger: [1, 2], snowLimit: 0.9, lane: 0.5,
  },
  {
    // The three decorative villagers keep their seeds (their looks) and now walk.
    id: "villager-1", kind: "villager", seed: "villager-1", group: "north-east",
    spots: [
      VILLAGER_1_HOME,
      { x: 6, z: -6.5, look: TREE, activity: "watch", place: "tree", via: NE0 },
      { ...sidePoint(7, 17, -1.4), look: { x: 15.06, z: -15.06 }, activity: "watch", place: "pond", via: NE2 },
    ],
    routine: villagerDay([3, 3]), linger: [1, 3], snowLimit: 0.7, lane: 0.5,
  },
  {
    // Far enough behind (1.7 s, about 4 u) that the corner of the avenue and the street is turned one after the other.
    id: "dog-1", kind: "dog", seed: "dog-1", group: "north-east", follows: { leader: "villager-1", delay: 1.7 },
    spots: [
      { ...VILLAGER_1_HOME, activity: "rest" },
      { x: 4.6, z: -7.6, look: TREE, activity: "sit", place: "tree" },
      { ...sidePoint(7, 16.6, -2.8), look: { x: 15.06, z: -15.06 }, activity: "sit", place: "pond" },
    ],
    routine: [], linger: [1, 1], snowLimit: 2, lane: 0,
  },
  {
    id: "villager-2", kind: "villager", seed: "villager-2", group: "shop-3",
    spots: [
      premiumHome(4, 1),
      { x: -7, z: 2.5, look: TREE, activity: "watch", place: "tree", via: W0 },
      { x: -18.3, z: 3, look: { x: -20.5, z: 2.4 }, activity: "stand", place: "stall", via: W1 },
    ],
    routine: villagerDay([4, 3]), linger: [1, 3], snowLimit: 0.6, lane: 0.5,
  },
  {
    id: "villager-3", kind: "villager", seed: "villager-3", group: "shop-1",
    spots: [
      premiumHome(0, 1),
      { x: 14.6, z: -2.6, look: TREE, activity: "stand", place: "square", via: E3 },
      { x: 18.4, z: -0.6, look: { x: 20.5, z: 0 }, activity: "stand", place: "stall", via: E2 },
      { x: 11, z: -2.6, look: TREE, activity: "watch", place: "tree", via: E3 },
    ],
    routine: villagerDay([3, 3, 3]), linger: [1, 3], snowLimit: 0.65, lane: 0.5,
  },
  {
    id: "villager-4", kind: "villager", seed: "villager-4", group: "pen-se",
    spots: [
      premiumHome(1, -1),
      { ...pen(1, -1.1), look: pen(1, 2), activity: "feed", place: "paddock", via: SE2 },
      { ...sidePoint(1, 20.4, -1.5), look: TREE, activity: "stand", place: "square", via: SE1 },
      { ...sidePoint(1, 17.4, -3.2), look: TREE, activity: "watch", place: "square", via: SE1 },
    ],
    routine: villagerDay([5, 2, 2]), linger: [1, 2], snowLimit: 0.75, lane: 0.5,
  },
  ...([-1, 1] as const).map((half, i): LifeCharDef => ({
    // Two neighbours who meet at the south-west bench: the second makes the choices of the first.
    id: `villager-${5 + i}`, kind: "villager", seed: `villager-${5 + i}`, group: "bench-sw", mirrors: i ? "villager-5" : undefined,
    spots: [
      premiumHome(3, half),
      // Each reaches its side of the bench without crossing the other's place.
      { ...sidePoint(3, half < 0 ? 10 : 9.5, half * 0.8), look: sidePoint(3, half < 0 ? 9.5 : 10, -half * 0.8), activity: "chat", place: "bench", via: half < 0 ? SW5 : SW6 },
      { ...sidePoint(3, 7.4, half * 0.8), look: TREE, activity: "watch", place: "tree", via: SW5 },
    ],
    routine: villagerDay([5, 3], [3, 4]), linger: [1, 3], snowLimit: 0.6, lane: 0.5,
  })),
  ...AVENUE_OF_VISITOR.map((_, i) => visitor(i)),
  // --- Animals ---------------------------------------------------------------------------------------------
  roamer("reindeer-1", "reindeer", "graze", "paddock", [pen(1, 1.8), pen(1, 2.4), pen(1, 2.9)], always(3)),
  roamer("reindeer-2", "reindeer", "graze", "paddock", [pen(3, 1.8), pen(3, 2.4), pen(3, 2.9)], always(3)),
  // A dog that roams the north-west of the plaza, and sleeps there at night.
  roamer("dog-2", "dog", "sniff", "square", [sidePoint(5, 9.5, -2.5), sidePoint(5, 8, -3.5), sidePoint(5, 6.6, -1), sidePoint(5, 7.8, 1.2)], [rule(6, [0, 0, 1, 0, 0]), rule(23, [0, 2, 1, 2, 2], { snow: [0, 0, 1, 0, 0] }), rule(24, [0, 0, 1, 0, 0])], { snowLimit: 0.7 }),
  // The cat that sat on the south-east bench now keeps to the ground beside it; a second one keeps to the west stalls.
  roamer("cat-1", "cat", "sit", "bench", [sidePoint(1, 9.9, 1.6), sidePoint(1, 9.9, -1.6), sidePoint(1, 8.9, 0)], always(3), { snowLimit: 0.5 }),
  roamer("cat-2", "cat", "sit", "stall", [{ x: -21.8, z: -4.9 }, { x: -22.6, z: -5.6 }, { x: -21.2, z: -6 }], always(3), { snowLimit: 0.5 }),
  // The two birds that perched on lamp posts flit between two neighbouring lamps, over every head.
  { id: "bird-1", kind: "bird", seed: "bird-1", group: "bird-1", spots: [{ ...lampTop(0), activity: "rest", place: "perch", inside: true }, { ...lampTop(0), look: TREE, activity: "perch", place: "perch" }, { ...lampTop(7), look: TREE, activity: "perch", place: "perch" }], routine: byDay(2, 6, 18.5), linger: [1, 3], snowLimit: 0.6, lane: 0 },
  { id: "bird-2", kind: "bird", seed: "bird-2", group: "bird-2", spots: [{ ...lampTop(4), activity: "rest", place: "perch", inside: true }, { ...lampTop(4), look: TREE, activity: "perch", place: "perch" }, { ...lampTop(3), look: TREE, activity: "perch", place: "perch" }], routine: byDay(2, 6, 18.5), linger: [1, 3], snowLimit: 0.6, lane: 0 },
  roamer("bird-3", "bird", "peck", "square", [{ x: 0.8, z: -8 }, { x: 2.4, z: -8.6 }, { x: 1.4, z: -9.8 }], byDay(3, 6, 18.5), { snowLimit: 0.6 }),
  roamer("bird-4", "bird", "peck", "square", [{ x: -8.2, z: -0.9 }, { x: -9.4, z: -1.6 }, { x: -8.6, z: -2.2 }], byDay(3, 6, 18.5), { snowLimit: 0.6 }),
  roamer("rabbit-1", "rabbit", "sit", "square", [{ x: 22, z: 2.6 }, { x: 23.4, z: 3.4 }, { x: 22.2, z: 4.4 }], always(3), { snowLimit: 0.9 }),
  // The owl comes out at night, on the top of the tall pine where it always perched.
  { id: "owl-1", kind: "owl", seed: "owl-1", group: "owl-1", spots: [{ ...OWL_PINE, activity: "rest", place: "perch", inside: true }, { ...OWL_PINE, look: TREE, activity: "perch", place: "perch" }], routine: [rule(5.5, [0, 1]), rule(18.5, [1, 0]), rule(24, [0, 1])], linger: [1, 1], snowLimit: 0.9, lane: 0 },
];

// ---------------------------------------------------------------------------------------------------------
// The compiled simulation.
// ---------------------------------------------------------------------------------------------------------

/** A polyline with the length walked up to each point, and the heading of each stretch. */
export interface LifeRoute {
  xs: Float64Array;
  zs: Float64Array;
  /** Distance from the start to point `i`. */
  at: Float64Array;
  yaw: Float32Array;
  length: number;
}

interface CompiledChar {
  def: LifeCharDef;
  index: number;
  group: number;
  hash: number;
  radius: number;
  pace: number;
  lane: number;
  linger: number;
  lingerOffset: number;
  /** Routine weights with the character's own preferences folded in: `[rule][variant][spot]`, variant 0 = plain, 1 = snow, 2 = festive. */
  weights: Float64Array[][];
  sx: Float64Array;
  sz: Float64Array;
  sy: Float64Array;
  syaw: Float32Array;
  inside: Uint8Array;
  routes: Array<LifeRoute | null>;
  leader: number;
  mirror: number;
  delayMs: number;
}

interface CompiledGroup {
  def: LifeGroupDef;
  hash: number;
  slotMs: number;
  phaseMs: number;
  /** Characters that plan their own trips, in a fixed order; followers are planned from their leaders. */
  walkers: number[];
  /** Slot the plan below was made for. */
  k: number;
}

export interface LifeOptions {
  /** Snowfall (0..1) at a time: default = the shared procedural weather with the scheduled events applied. */
  snowAt?: (epochMs: number) => number;
  /** Whether a village event runs at a time: default = the shared scheduled events. */
  festiveAt?: (epochMs: number) => boolean;
  /** São Paulo hour (0..24) at a time: default = the shared civil clock. */
  hourAt?: (epochMs: number) => number;
}

export interface Life {
  seed: number;
  count: number;
  chars: CompiledChar[];
  groups: CompiledGroup[];
  index: Map<string, number>;
  options: Required<LifeOptions>;
  /** Hour, snow and events by minute of village time (a small ring). */
  contexts: LifeContext[];
  /** The plan of each character for its group's current slot. */
  from: Int16Array;
  to: Int16Array;
  departMs: Float64Array;
  durMs: Float64Array;
}

/** Where every character is at one moment. Arrays are indexed like `LIFE_CAST`; reused across calls. */
export interface LifeState {
  epochMs: number;
  x: Float64Array;
  z: Float64Array;
  y: Float64Array;
  yaw: Float32Array;
  /** 0 = off stage (not drawn, not there), 1 = present; in between while it appears or leaves at a door. */
  presence: Float32Array;
  moving: Uint8Array;
  /** Index into `LIFE_ACTIVITIES`. */
  activity: Uint8Array;
  /** The spot it stands at, or walks to. */
  spot: Int16Array;
  /** The spot it left (equal to `spot` when it did not move in this slot). */
  origin: Int16Array;
  /** Distance walked on the current trip (u): the client's walk cycle follows it, so feet agree across clients. */
  walked: Float64Array;
  /** Speed (u/s) right now. */
  speed: Float32Array;
}

export function createLifeState(count: number = LIFE_CAST.length): LifeState {
  return {
    epochMs: 0,
    x: new Float64Array(count), z: new Float64Array(count), y: new Float64Array(count), yaw: new Float32Array(count),
    presence: new Float32Array(count), moving: new Uint8Array(count), activity: new Uint8Array(count),
    spot: new Int16Array(count), origin: new Int16Array(count), walked: new Float64Array(count), speed: new Float32Array(count),
  };
}

/** FNV-1a of an id: the per-character and per-group streams of the hash PRNG. */
function idHash(id: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

const NODE_INDEX = new Map(nodes.map((n, i) => [n.id, i]));
/** Edge lengths in hundredths of a unit: whole numbers, so the shortest path is the same on every engine. */
const ADJACENT: Array<Array<[to: number, cost: number]>> = nodes.map(() => []);
for (const e of edges) {
  const a = NODE_INDEX.get(e.a), b = NODE_INDEX.get(e.b);
  if (a === undefined || b === undefined) throw new RangeError(`village life: edge ${e.a} → ${e.b} names an unknown node`);
  const cost = Math.round(Math.sqrt((nodes[a].x - nodes[b].x) ** 2 + (nodes[a].z - nodes[b].z) ** 2) * 100);
  ADJACENT[a].push([b, cost]);
  ADJACENT[b].push([a, cost]);
}
const TREES = new Map<number, Int16Array>();
/** Shortest-path tree from a node (Dijkstra over whole-number costs, ties to the lower index). */
function treeFrom(source: number): Int16Array {
  let prev = TREES.get(source);
  if (prev) return prev;
  const n = nodes.length;
  prev = new Int16Array(n).fill(-1);
  const dist = new Float64Array(n).fill(Infinity), done = new Uint8Array(n);
  dist[source] = 0;
  for (;;) {
    let best = -1;
    for (let i = 0; i < n; i++) if (!done[i] && dist[i] < Infinity && (best < 0 || dist[i] < dist[best])) best = i;
    if (best < 0) break;
    done[best] = 1;
    for (const [to, cost] of ADJACENT[best]) if (dist[best] + cost < dist[to]) (dist[to] = dist[best] + cost), (prev[to] = best);
  }
  TREES.set(source, prev);
  return prev;
}

/** Node ids from `a` to `b` along the paths, both included. */
export function lifePath(a: string, b: string): string[] {
  const from = NODE_INDEX.get(a), to = NODE_INDEX.get(b);
  if (from === undefined || to === undefined) throw new RangeError(`village life: unknown node ${from === undefined ? a : b}`);
  const prev = treeFrom(from);
  const out: number[] = [];
  for (let i = to; i !== -1; i = prev[i]) {
    out.push(i);
    if (i === from) return out.reverse().map((k) => nodes[k].id);
  }
  throw new RangeError(`village life: no path from ${a} to ${b}`);
}

function buildRoute(points: Array<{ x: number; z: number }>): LifeRoute {
  // Drop repeated points (a spot that stands on its own node).
  const p = points.filter((q, i) => i === 0 || Math.abs(q.x - points[i - 1].x) + Math.abs(q.z - points[i - 1].z) > 1e-9);
  const n = p.length;
  const route: LifeRoute = { xs: new Float64Array(n), zs: new Float64Array(n), at: new Float64Array(n), yaw: new Float32Array(Math.max(1, n - 1)), length: 0 };
  for (let i = 0; i < n; i++) {
    route.xs[i] = p[i].x;
    route.zs[i] = p[i].z;
    if (i === 0) continue;
    const dx = p[i].x - p[i - 1].x, dz = p[i].z - p[i - 1].z;
    route.at[i] = route.at[i - 1] + Math.sqrt(dx * dx + dz * dz);
    route.yaw[i - 1] = Math.atan2(dx, dz);
  }
  route.length = route.at[n - 1];
  return route;
}

/**
 * The polyline a character walks from one of its spots to another: spot, the nodes between the two spots'
 * `via` nodes, spot. On street nodes the path is moved `lane` u to the right of the walking direction (a mitre
 * at each corner), so two walkers that share a street in opposite directions pass each other.
 */
function routeBetween(c: CompiledChar, a: number, b: number): LifeRoute {
  const from = c.def.spots[a], to = c.def.spots[b];
  if (!from.via || !to.via) return buildRoute([from, to]);
  const path = lifePath(from.via, to.via).map((id) => nodes[NODE_INDEX.get(id)!]);
  const points: Array<{ x: number; z: number }> = [from];
  for (let i = 0; i < path.length; i++) {
    const here = path[i];
    let ox = 0, oz = 0, parts = 0;
    if (c.lane !== 0 && here.street) {
      // Right-hand normals of the street stretches that meet here: (dx, dz) → (-dz, dx).
      for (const [p, q] of [[path[i - 1], here], [here, path[i + 1]]]) {
        if (!p || !q || !p.street || !q.street) continue;
        const dx = q.x - p.x, dz = q.z - p.z, len = Math.sqrt(dx * dx + dz * dz);
        if (len < 1e-9) continue;
        ox += -dz / len;
        oz += dx / len;
        parts++;
      }
    }
    if (parts === 2) {
      // Mitre: the offset lines of the two stretches meet at `(n1 + n2) / (1 + n1·n2)`; a hairpin is capped.
      const dot = Math.max(-0.5, (ox * ox + oz * oz) / 2 - 1);
      ox /= 1 + dot;
      oz /= 1 + dot;
    }
    points.push({ x: here.x + ox * c.lane, z: here.z + oz * c.lane });
  }
  points.push(to);
  return buildRoute(points);
}

/**
 * The polyline of a companion: its leader's, moved sideways. It starts and ends at the companion's own spots;
 * in between, each corner of the leader's path is moved along its mitre by an amount that goes from the side
 * the companion sat on at the start to the side it will sit on at the end. The companion sets off a moment
 * after the leader and takes the same time, so it trails behind and beside, never across.
 */
function routeBeside(c: CompiledChar, base: LifeRoute, a: number, b: number): LifeRoute {
  const n = base.xs.length;
  const from = { x: c.sx[a], z: c.sz[a] }, to = { x: c.sx[b], z: c.sz[b] };
  if (n < 2 || !(base.length > 0)) return buildRoute([from, to]);
  /** Right-hand unit normal of stretch `i` of the leader's path. */
  const normal = (i: number): [number, number] => {
    const dx = base.xs[i + 1] - base.xs[i], dz = base.zs[i + 1] - base.zs[i], len = Math.sqrt(dx * dx + dz * dz);
    return [-dz / len, dx / len];
  };
  const first = normal(0), last = normal(n - 2);
  const wa = (from.x - base.xs[0]) * first[0] + (from.z - base.zs[0]) * first[1];
  const wb = (to.x - base.xs[n - 1]) * last[0] + (to.z - base.zs[n - 1]) * last[1];
  const points = [from];
  for (let i = 1; i < n - 1; i++) {
    const [px, pz] = normal(i - 1), [qx, qz] = normal(i);
    const k = 1 + Math.max(-0.5, px * qx + pz * qz);
    const w = wa + ((wb - wa) * base.at[i]) / base.length;
    points.push({ x: base.xs[i] + ((px + qx) / k) * w, z: base.zs[i] + ((pz + qz) / k) * w });
  }
  points.push(to);
  return buildRoute(points);
}

/** The route of a character between two of its spots (built once, then reused). */
export function lifeRoute(life: Life, char: number, a: number, b: number): LifeRoute {
  const c = life.chars[char];
  const n = c.def.spots.length;
  return (c.routes[a * n + b] ??= c.leader >= 0 ? routeBeside(c, lifeRoute(life, c.leader, a, b), a, b) : routeBetween(c, a, b));
}

const VARIANTS = ["w", "snow", "festive"] as const;

/**
 * Compiles the cast for a world seed. Everything personal (pace, how long a decision lasts, favourite spots,
 * lane, when its group's slots start) is drawn here from the seed, once.
 */
export function compileLife(seed: number, options: LifeOptions = {}, cast: readonly LifeCharDef[] = LIFE_CAST, groupDefs: readonly LifeGroupDef[] = LIFE_GROUPS): Life {
  if (cast.length > LIFE.maxPopulation) throw new RangeError(`village life: ${cast.length} characters, the cap is ${LIFE.maxPopulation}`);
  const index = new Map(cast.map((c, i) => [c.id, i]));
  const groupIndex = new Map(groupDefs.map((g, i) => [g.id, i]));
  const groups: CompiledGroup[] = groupDefs.map((def) => {
    const hash = idHash(def.id);
    const slotMs = def.slot * 1000;
    return { def, hash, slotMs, phaseMs: Math.floor(random01(seed, hash, 3) * slotMs), walkers: [], k: Number.NaN };
  });
  const chars = cast.map((def, i): CompiledChar => {
    const group = groupIndex.get(def.group);
    if (group === undefined) throw new RangeError(`village life: ${def.id} is in the unknown group ${def.group}`);
    const hash = idHash(def.id);
    const n = def.spots.length;
    const leader = def.follows ? (index.get(def.follows.leader) ?? -1) : -1;
    const mirror = def.mirrors ? (index.get(def.mirrors) ?? -1) : -1;
    if ((def.follows && leader < 0) || (def.mirrors && mirror < 0)) throw new RangeError(`village life: ${def.id} follows or mirrors an unknown character`);
    for (const other of [leader, mirror]) if (other >= 0 && cast[other].spots.length !== n) throw new RangeError(`village life: ${def.id} needs as many spots as ${cast[other].id}`);
    const [lo, hi] = def.linger;
    const linger = lo + Math.floor(random01(seed, hash, 11) * (hi - lo + 1));
    const favour = Array.from({ length: n }, (_, s) => 0.6 + 0.8 * random01(seed, hash, 20 + s));
    const weights = def.routine.map((r) =>
      VARIANTS.map((v) => {
        // Default in heavy snow: spot 0 (home, shelter or nest). Default during an event: the plain weights.
        const raw = v === "snow" ? (r.snow ?? r.w.map((_, s) => (s === 0 ? 1 : 0))) : v === "festive" ? (r.festive ?? r.w) : r.w;
        if (raw.length !== n) throw new RangeError(`village life: a rule of ${def.id} has ${raw.length} weights for ${n} spots`);
        return Float64Array.from(raw, (w, s) => w * favour[s]);
      })
    );
    const look = (s: LifeSpotDef) => (s.look ? Math.atan2(s.look.x - s.x, s.look.z - s.z) : 0);
    return {
      def, index: i, group, hash,
      radius: LIFE_RADIUS[def.kind],
      pace: LIFE_PACE[def.kind] * (PACE_RANGE[0] + (PACE_RANGE[1] - PACE_RANGE[0]) * random01(seed, hash, 12)),
      lane: Math.min(LIFE.maxLane, def.lane * (0.8 + 0.4 * random01(seed, hash, 13))),
      linger,
      lingerOffset: hash32(seed, hash, 14) % linger,
      weights,
      sx: Float64Array.from(def.spots, (s) => s.x),
      sz: Float64Array.from(def.spots, (s) => s.z),
      sy: Float64Array.from(def.spots, (s) => s.y ?? 0),
      syaw: Float32Array.from(def.spots, look),
      inside: Uint8Array.from(def.spots, (s) => (s.inside ? 1 : 0)),
      routes: new Array<LifeRoute | null>(n * n).fill(null),
      leader, mirror,
      delayMs: (def.follows?.delay ?? 0) * 1000,
    };
  });
  for (const c of chars) if (c.leader < 0) groups[c.group].walkers.push(c.index);
  const defaults: Required<LifeOptions> = {
    snowAt: (ms) => applyEvents(weatherAt(seed, ms, WEATHER_SLOT_MS, WEATHER_TRANSITION_MS), activeEvents(ms)).snowfall,
    festiveAt: (ms) => activeEvents(ms).length > 0,
    hourAt: (ms) => saoPauloSecondsOfDay(ms) / 3600,
  };
  const n = chars.length;
  return { seed, count: n, chars, groups, index, options: { ...defaults, ...options }, contexts: Array.from({ length: CONTEXTS }, (): LifeContext => ({ minute: Number.NaN, hour: 0, snow: 0, festive: false })), from: new Int16Array(n), to: new Int16Array(n), departMs: new Float64Array(n), durMs: new Float64Array(n) };
}

/** Builds every route now, so that no frame ever builds one (the client calls it when the scene mounts). */
export function warmLife(life: Life): void {
  for (const c of life.chars) {
    const n = c.def.spots.length;
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (a !== b) lifeRoute(life, c.index, a, b);
  }
}

/** What a routine looks at when a slot starts: the hour, the snow and whether an event runs. */
interface LifeContext {
  minute: number;
  hour: number;
  snow: number;
  festive: boolean;
}
const CONTEXTS = 32;
/**
 * The context of the minute a slot of a group starts in. The hour, the weather and the events are read once per
 * minute of village time and kept (the animals' slots turn over every few seconds, and reading the civil clock
 * or the weather allocates): still a function of `k` alone.
 */
function contextOf(life: Life, g: CompiledGroup, k: number): LifeContext {
  const minute = Math.floor((k * g.slotMs - g.phaseMs) / 60_000);
  const c = life.contexts[((minute % CONTEXTS) + CONTEXTS) % CONTEXTS];
  if (c.minute !== minute) {
    const ms = minute * 60_000;
    c.minute = minute;
    c.hour = life.options.hourAt(ms);
    c.snow = life.options.snowAt(ms);
    c.festive = life.options.festiveAt(ms);
  }
  return c;
}

/** The spot a character stands at in slot `k` of its group: a function of `k` alone (and of the seed). */
function choice(life: Life, c: CompiledChar, k: number, ctx: LifeContext): number {
  if (c.mirror >= 0) return choice(life, life.chars[c.mirror], k, ctx);
  const rules = c.def.routine;
  let r = rules.length - 1;
  for (let i = 0; i < rules.length; i++) {
    if (ctx.hour < rules[i].until) {
      r = i;
      break;
    }
  }
  const w = c.weights[r][ctx.snow >= c.def.snowLimit ? 1 : ctx.festive ? 2 : 0];
  let total = 0;
  for (let i = 0; i < w.length; i++) total += w[i];
  if (!(total > 0)) return 0;
  // A decision lasts `linger` slots: the same draw picks from whatever weights apply in each of them.
  const decision = Math.floor((k + c.lingerOffset) / c.linger);
  let pick = random01(life.seed, decision, c.hash) * total;
  for (let i = 0; i < w.length; i++) {
    pick -= w[i];
    if (pick < 0) return i;
  }
  return w.length - 1;
}

/** The context of the slot before the one being planned (copied: the ring entry may be reused for the slot itself). */
const scratch: LifeContext = { minute: 0, hour: 0, snow: 0, festive: false };

/**
 * Plans slot `k` of a group: where each character comes from and goes to, and when it sets off. Trips of a
 * group never overlap in time: each starts when the previous one has ended (`LIFE.gap` later), in an order
 * that turns with the slot, after a pause drawn for the slot. All of it follows from `k`.
 */
function plan(life: Life, g: CompiledGroup, k: number): void {
  g.k = k;
  // Two entries of the context ring: a slot is never shorter than the minute both are read in.
  const before = contextOf(life, g, k - 1);
  const beforeHour = before.hour, beforeSnow = before.snow, beforeFestive = before.festive;
  const now = contextOf(life, g, k);
  scratch.hour = beforeHour;
  scratch.snow = beforeSnow;
  scratch.festive = beforeFestive;
  const { walkers } = g;
  const m = walkers.length;
  let total = 0;
  for (let i = 0; i < m; i++) {
    const c = life.chars[walkers[i]];
    const a = choice(life, c, k - 1, scratch), b = choice(life, c, k, now);
    life.from[c.index] = a;
    life.to[c.index] = b;
    const length = a === b ? 0 : lifeRoute(life, c.index, a, b).length;
    // A trip with no length (the owl coming out on its branch) takes the time of a fade.
    const dur = a === b ? 0 : Math.max(LIFE.fade * 1000, (length / c.pace) * 1000);
    life.durMs[c.index] = dur;
    if (dur > 0) total += dur + LIFE.gap * 1000;
  }
  const startMs = k * g.slotMs - g.phaseMs;
  const slack = Math.max(0, g.slotMs - (g.def.dwell ?? LIFE.minDwell) * 1000 - total);
  let at = startMs + slack * 0.8 * random01(life.seed, k, g.hash ^ 0x51ed);
  const first = m > 1 ? hash32(life.seed, k, g.hash ^ 0x2f0b) % m : 0;
  for (let i = 0; i < m; i++) {
    const c = life.chars[walkers[(first + i) % m]];
    life.departMs[c.index] = at;
    if (life.durMs[c.index] > 0) at += life.durMs[c.index] + LIFE.gap * 1000;
  }
  for (const c of life.chars) {
    if (c.leader < 0 || c.group !== life.chars[c.leader].group || life.groups[c.group] !== g) continue;
    life.from[c.index] = life.from[c.leader];
    life.to[c.index] = life.to[c.leader];
    life.departMs[c.index] = life.departMs[c.leader] + c.delayMs;
    life.durMs[c.index] = life.durMs[c.leader];
  }
}

const CARRY = ACTIVITY_INDEX.get("carry")!, WALK = ACTIVITY_INDEX.get("walk")!;

/**
 * Where every character is at `epochMs` (the synchronized village time): fills `out` and returns it. Pure in
 * (seed, time, plan); allocates nothing once the routes are built (`warmLife`).
 */
export function sampleLife(life: Life, epochMs: number, out: LifeState): LifeState {
  out.epochMs = epochMs;
  return evaluateLife(life, out);
}

/**
 * `sampleLife` for the time already written to `out.epochMs`. The frame loop uses this form: a number passed as
 * an argument may be boxed by the engine (16 bytes a call), a number stored in a field is not.
 */
export function evaluateLife(life: Life, out: LifeState): LifeState {
  const epochMs = out.epochMs;
  for (let gi = 0; gi < life.groups.length; gi++) {
    const g = life.groups[gi];
    const k = Math.floor((epochMs + g.phaseMs) / g.slotMs);
    if (k !== g.k) plan(life, g, k);
  }
  const fadeMs = LIFE.fade * 1000;
  for (let i = 0; i < life.count; i++) {
    const c = life.chars[i];
    const a = life.from[i], b = life.to[i];
    const dur = life.durMs[i];
    const since = epochMs - life.departMs[i];
    out.origin[i] = a;
    out.spot[i] = b;
    if (a === b || since <= 0 || since >= dur) {
      const s = a === b || since >= dur ? b : a;
      out.x[i] = c.sx[s];
      out.z[i] = c.sz[s];
      out.y[i] = c.sy[s];
      out.yaw[i] = c.syaw[s];
      out.presence[i] = c.inside[s] ? 0 : 1;
      out.moving[i] = 0;
      out.speed[i] = 0;
      out.walked[i] = 0;
      out.activity[i] = ACTIVITY_INDEX.get(c.def.spots[s].activity)!;
      continue;
    }
    const u = since / dur;
    const route = lifeRoute(life, i, a, b);
    const walked = u * route.length;
    let seg = 0;
    while (seg < route.at.length - 2 && route.at[seg + 1] <= walked) seg++;
    const span = route.at.length > 1 ? route.at[seg + 1] - route.at[seg] : 0;
    const t = span > 0 ? (walked - route.at[seg]) / span : 0;
    let x = route.xs[seg], z = route.zs[seg];
    if (route.at.length > 1) {
      x += (route.xs[seg + 1] - x) * t;
      z += (route.zs[seg + 1] - z) * t;
    }
    out.x[i] = x;
    out.z[i] = z;
    out.y[i] = c.sy[a] + (c.sy[b] - c.sy[a]) * u;
    out.yaw[i] = route.length > 0 ? route.yaw[seg] : c.syaw[b];
    // At a door the character appears over the first moments of the walk and is gone as the walk ends.
    let presence = 1;
    if (c.inside[a]) presence = Math.min(presence, since / fadeMs);
    if (c.inside[b]) presence = Math.min(presence, (dur - since) / fadeMs);
    out.presence[i] = presence < 0 ? 0 : presence > 1 ? 1 : presence;
    out.moving[i] = route.length > 0 ? 1 : 0;
    out.speed[i] = route.length > 0 ? route.length / (dur / 1000) : 0;
    out.walked[i] = walked;
    out.activity[i] = route.length === 0 ? ACTIVITY_INDEX.get(c.def.spots[b].activity)! : c.def.spots[b].carry ? CARRY : WALK;
  }
  return out;
}

/**
 * Fastest a character ever moves (u/s): its pace. A companion takes the time of its leader's trip over its own
 * path beside it, which is a little longer or shorter: its top speed is the fastest of its trips.
 */
export function lifeMaxSpeed(life: Life, char: number): number {
  const c = life.chars[char];
  if (c.leader < 0) return c.pace;
  const l = life.chars[c.leader];
  let top = 0;
  const n = c.def.spots.length;
  for (let a = 0; a < n; a++)
    for (let b = 0; b < n; b++) {
      if (a === b) continue;
      const dur = Math.max(LIFE.fade, lifeRoute(life, c.leader, a, b).length / l.pace);
      top = Math.max(top, lifeRoute(life, char, a, b).length / dur);
    }
  return top;
}

/** The place of an activity: the spots of every character that share `place` within `radius` of a point. */
export interface LifeVenue {
  id: string;
  /** How many characters have a standing point of their own there. */
  capacity: number;
  members: Array<{ char: number; spot: number }>;
}

/**
 * Activity places and their capacities: the spots of the cast, grouped by kind of place and by nearness (two
 * spots of the same kind of place within 5 u belong to the same one). A place has exactly as many standing
 * points as characters that may use it, so it can never hold more than its capacity.
 */
export function lifeVenues(cast: readonly LifeCharDef[] = LIFE_CAST): LifeVenue[] {
  const venues: Array<LifeVenue & { x: number; z: number; place: LifePlace }> = [];
  cast.forEach((c, char) => {
    const mine = new Set<LifeVenue>();
    c.spots.forEach((s, spot) => {
      if (s.inside) return;
      let v = venues.find((x) => x.place === s.place && Math.hypot(x.x - s.x, x.z - s.z) < 5);
      if (!v) venues.push((v = { id: `${s.place}-${venues.filter((x) => x.place === s.place).length + 1}`, capacity: 0, members: [], x: s.x, z: s.z, place: s.place }));
      v.members.push({ char, spot });
      if (!mine.has(v)) (mine.add(v), v.capacity++);
    });
  });
  return venues.map(({ id, capacity, members }) => ({ id, capacity, members }));
}
