/**
 * The ten saga props (PROPOSTA, slice 12): the landmarks and portable promises that carry the story across
 * the ten books. Seeded recipes only, colours from PALETTE/V, base on y = 0, one voxel = 0.2 u. The six solid
 * world props carry a world-unit footprint for a future placement; the walkable bridge and the three quest
 * items do not. No text, logo or brand.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../models";
import { V } from "../palette";
import { box, dedupe, disc, ground, rotate, snowCap, walls } from "../parts";
import { Rng, type Seed } from "../rng";
import type { GenModel } from "../types";
import type { StoryPropGenerator } from "./catalog";

const done = (v: Voxel[]) => dedupe(ground(v));

/** A flat star in the x/y plane at z = 0, with four points; one voxel thick. */
function star(v: Voxel[], cy: number, radius: number, color: string, point: string, center: string) {
  for (let x = -radius; x <= radius; x++) {
    for (let y = -radius; y <= radius; y++) {
      if (Math.abs(x) + Math.abs(y) <= radius) v.push([x, cy + y, 0, x === 0 && y === 0 ? center : color]);
    }
  }
  v.push([0, cy + radius + 1, 0, point], [0, cy - radius - 1, 0, point], [radius + 1, cy, 0, point], [-radius - 1, cy, 0, point]);
}

/** Estrela-Guia: a pedestal with a five-point star. Budget 220/600. */
export function starGuide(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-star-guide");
  const base = r.pick([P.wood, V.woodDark, P.coal] as const);
  const column = r.pick([V.woodLight, P.wood, P.coal] as const);
  const height = r.int(5, 7);
  const radius = r.int(2, 3);
  const garland = r.pick([P.red, P.pine, P.gold] as const);
  const snowy = r.chance(0.5);
  const turn = r.int(0, 3);
  const v: Voxel[] = [];
  box(v, -2, 2, 0, 0, -2, 2, (x, _y, z) => ((x + z) & 1 ? base : V.woodDark));
  box(v, 0, 0, 1, height, 0, 0, column);
  // Three short arms hold the star.
  box(v, -1, 1, height, height, 0, 0, P.gold);
  star(v, height + radius + 1, radius, P.gold, P.cream, P.snow);
  // Garland on the base.
  for (const [x, z] of [[-2, -2], [2, -2], [-2, 2], [2, 2]]) v.push([x, 1, z, garland]);
  v.push([0, 1, 2, P.red], [0, 2, 2, P.red]);
  const out = snowy ? snowCap(v, P.snow, (x, z, y) => y <= 1 && Math.abs(x) <= 2 && Math.abs(z) <= 2) : v;
  return {
    voxels: done(rotate(out, turn)),
    size: 0.2,
    emissive: [P.gold, P.cream],
    solid: [[-0.5, 0.5, -0.5, 0.5]],
  };
}

/** Sino-Mor: a timber frame with a bronze bell, a visible clapper and a star relief. Budget 220/600. */
export function greatBell(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-great-bell");
  const metal = r.pick([P.gold, V.goldDeep, V.crust] as const);
  const metalAlt = metal === P.gold ? V.goldDeep : P.gold;
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const woodAlt = wood === V.woodDark ? P.wood : V.woodDark;
  const rope = r.pick([P.red, P.pine, P.cream] as const);
  const top = r.int(10, 12);
  const clapper = r.chance(0.5);
  const snowy = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  for (const x of [-5, 5]) box(v, x, x, 0, top, 0, 0, wood);
  box(v, -6, 6, top, top, 0, 0, (x) => (x === -6 || x === 6 ? woodAlt : wood));
  disc(v, 0, 0, top - 1, 1, metal);
  disc(v, 0, 0, top - 2, 2, metal);
  disc(v, 0, 0, top - 3, 3, metal);
  disc(v, 0, 0, top - 4, 2, metalAlt);
  v.push([0, top - 4, 0, P.coal], [0, top - 5, 0, P.coal]);
  // Visible clapper and a star relief on the front.
  v.push([0, top - 5, 0, metalAlt], [0, top - 6, 0, P.gold]);
  if (clapper) v.push([-1, top - 6, 0, P.gold], [1, top - 6, 0, P.gold]);
  v.push([0, top - 2, 2, P.cream], [-1, top - 2, 2, P.cream], [1, top - 2, 2, P.cream], [0, top - 1, 2, P.cream]);
  v.push([0, top, 0, rope], [0, top - 1, 0, rope], [-1, top - 1, 1, rope], [1, top - 1, 1, rope]);
  v.push([-5, Math.floor(top / 2), 1, P.red], [-5, Math.floor(top / 2) + 1, 1, V.redDeep]);
  const out = snowy ? snowCap(v, P.snow, (_x, _z, y) => y >= top) : v;
  return {
    voxels: done(rotate(out, turn)),
    size: 0.2,
    emissive: [P.gold],
    solid: [[-1.2, 1.2, -0.4, 0.4]],
  };
}

/** Tear: a wooden loom with warp, half-woven cloth and a shuttle. Budget 220/600. */
export function loom(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-loom");
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const woodAlt = wood === V.woodDark ? P.wood : V.woodDark;
  const warp = r.pick([P.cream, P.red, P.gold, P.pine] as const);
  const cloth = r.pick([P.pine, P.red, P.gold, V.blueNight] as const);
  const clothAlt = cloth === P.red ? P.gold : P.red;
  const height = r.int(7, 9);
  const pattern = r.pick(["stripes", "checks"] as const);
  const shuttleSide = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  for (const x of [-4, 4]) box(v, x, x, 0, height, 0, 0, wood);
  box(v, -4, 4, 0, 0, 0, 0, woodAlt);
  box(v, -4, 4, height, height, 0, 0, woodAlt);
  for (let x = -3; x <= 3; x++) box(v, x, x, 1, height - 1, 1, 1, x % 2 ? warp : P.cream);
  const clothTop = 3;
  box(v, -2, 2, 1, clothTop, 0, 1, (x, y) => (pattern === "checks" && ((x + y) & 1) ? clothAlt : cloth));
  const shuttleX = shuttleSide ? 3 : -3;
  v.push([shuttleX, height - 1, 2, P.gold], [shuttleX + (shuttleSide ? 1 : -1), height - 1, 2, V.goldDeep]);
  return { voxels: done(rotate(v, turn)), size: 0.2, solid: [[-1.0, 1.0, -0.4, 0.4]] };
}

/** Torre do Tempo: a stone clock tower with a still clock face (never the real hour). Budget 220/600. */
export function timeTower(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-time-tower");
  const stone = r.pick([P.coal, V.blueNight, P.wood] as const);
  const stoneAlt = r.pick([V.blueNight, P.coal, V.woodDark] as const);
  const roof = r.pick([P.red, P.pine, V.blueNight] as const);
  const height = r.int(9, 12);
  const hands = r.int(0, 3);
  const snowy = r.chance(0.5);
  const vane = r.chance(0.5);
  const clockY = height - 2;
  const v: Voxel[] = [];
  box(v, -2, 2, 0, 0, -2, 2, (x, _y, z) => ((x + z) & 1 ? stone : stoneAlt));
  walls(v, -1, 1, 1, height, -1, 1, (x, y) => ((x + y) & 1 ? stone : stoneAlt));
  box(v, -1, 1, clockY - 1, clockY + 1, -2, -2, P.cream);
  v.push([0, clockY, -2, P.coal], [0, clockY + 1, -2, P.coal]);
  if (hands & 1) v.push([1, clockY, -2, P.coal]);
  else v.push([-1, clockY, -2, P.coal]);
  if (hands & 2) v.push([0, clockY - 1, -2, P.coal]);
  else v.push([0, clockY + 1, -2, V.redDeep]);
  box(v, -2, 2, height + 1, height + 1, -2, 2, roof);
  box(v, -1, 1, height + 2, height + 2, -1, 1, roof === P.red ? V.redDeep : roof);
  v.push([0, height + 3, 0, P.gold], [0, height + 4, 0, P.gold]);
  if (vane) v.push([0, height + 5, 0, P.cream], [1, height + 5, 0, P.cream], [-1, height + 5, 0, P.cream]);
  const out = snowy ? snowCap(v, P.snow, (_x, _z, y) => y >= height + 1) : v;
  return {
    voxels: done(out),
    size: 0.2,
    emissive: [P.cream],
    solid: [[-0.5, 0.5, -0.5, 0.5]],
  };
}

/** Ponte de Gelo: a walkable ice bridge, no footprint. Budget 220/600. */
export function iceBridge(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-ice-bridge");
  const ice = r.pick([P.ice, P.snow, V.skyBlue] as const);
  const iceAlt = r.pick([V.skyBlue, P.ice, P.snow] as const);
  const rail = r.pick([P.pine, P.red, P.gold] as const);
  const high = r.chance(0.5);
  const ropeRail = r.chance(0.5);
  const snowy = r.chance(0.5);
  const turn = r.int(0, 1);
  const arch = high ? [0, 1, 2, 3, 3, 3, 3, 3, 3, 3, 2, 1, 0] : [0, 0, 1, 2, 2, 2, 2, 2, 2, 2, 1, 0, 0];
  const v: Voxel[] = [];
  for (let i = 0; i < 13; i++) {
    const x = i - 6;
    const y = arch[i];
    box(v, x, x, y, y, -1, 1, (xx, _yy, z) => ((xx + z) & 1 ? ice : iceAlt));
    for (const z of [-2, 2]) v.push([x, y + 1, z, rail]);
    if (i % 3 === 0) for (const z of [-2, 2]) v.push([x, y + 2, z, rail]);
    if (ropeRail && i % 3 !== 0) for (const z of [-2, 2]) v.push([x, y + 2, z, ice]);
  }
  for (const x of [-6, 6]) for (let y = 0; y < arch[x + 6]; y++) for (const z of [-1, 0, 1]) v.push([x, y, z, iceAlt]);
  const out = snowy ? snowCap(v, P.snow, (_x, _z, y) => y >= 2) : v;
  return { voxels: done(rotate(out, turn)), size: 0.2 };
}

/** Pedra Fundamental: a cut stone with a carved promise mark. Budget 220/600. */
export function foundationStone(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-foundation-stone");
  const stone = r.pick([P.coal, V.blueNight, P.wood] as const);
  const stoneAlt = r.pick([V.woodDark, P.coal, V.blueNight] as const);
  const mark = r.pick([P.gold, P.cream, P.red, P.pine] as const);
  const shape = r.int(0, 3);
  const snowy = r.chance(0.5);
  const moss = r.chance(0.5);
  const chisel = r.chance(0.5);
  const v: Voxel[] = [];
  box(v, -3, 3, 0, 0, -2, 2, (x, _y, z) => ((x + z) & 1 ? stone : stoneAlt));
  box(v, -2, 2, 1, 3, -1, 1, stone);
  // The mark is a small carved shape on the front, not text.
  if (shape === 0) v.push([0, 2, -2, mark], [-1, 2, -2, mark], [1, 2, -2, mark], [0, 1, -2, mark], [0, 3, -2, mark]);
  else if (shape === 1) v.push([-1, 1, -2, mark], [0, 1, -2, mark], [1, 1, -2, mark], [1, 2, -2, mark], [1, 3, -2, mark]);
  else if (shape === 2) v.push([-1, 1, -2, mark], [-1, 2, -2, mark], [-1, 3, -2, mark], [0, 3, -2, mark], [1, 3, -2, mark]);
  else v.push([0, 1, -2, mark], [0, 2, -2, mark], [0, 3, -2, mark], [-1, 2, -2, mark], [1, 2, -2, mark]);
  if (moss) v.push([2, 1, 2, P.pine], [-2, 1, -2, P.pine], [1, 0, 2, P.pine]);
  if (chisel) v.push([3, 1, 0, V.woodLight], [4, 1, 0, P.gold]);
  const out = snowy ? snowCap(v, P.snow, (_x, _z, y) => y >= 3) : v;
  return { voxels: done(out), size: 0.2, solid: [[-0.7, 0.7, -0.5, 0.5]] };
}

/** Arquivo das Neves: a small archive with warm windows and books. Budget 220/600. */
export function snowArchive(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-snow-archive");
  const wall = r.pick([P.wood, V.woodDark, P.cream] as const);
  const roof = r.pick([P.red, P.pine, V.blueNight] as const);
  const doorSide = r.chance(0.5);
  const twoWindows = r.chance(0.5);
  const icicles = r.chance(0.5);
  const books = r.chance(0.5);
  const v: Voxel[] = [];
  box(v, -3, 3, 0, 0, -2, 2, V.woodDark);
  walls(v, -3, 3, 1, 4, -2, 2, (x, y) => ((x + y) & 1 ? wall : V.woodLight));
  const doorX = doorSide ? 2 : -2;
  box(v, doorX, doorX, 1, 2, -3, -3, P.coal);
  v.push([doorX, 1, -3, P.gold]);
  const windowX = twoWindows ? [-1, 1] : [-1];
  for (const x of windowX) box(v, x, x, 2, 3, -3, -3, P.gold);
  box(v, -3, 3, 5, 5, -2, 2, roof);
  box(v, -2, 2, 6, 6, -1, 1, roof === P.red ? V.redDeep : roof);
  // A book-shaped sign, no text.
  box(v, -1, 1, 3, 3, -3, -3, P.cream);
  v.push([0, 3, -3, P.red], [-1, 3, -3, P.pine]);
  if (books) v.push([2, 1, -3, P.red], [2, 2, -3, P.pine], [1, 1, -3, P.gold]);
  if (icicles) for (const x of [-2, 2]) v.push([x, 4, -3, P.ice]);
  const out = snowCap(v, P.snow, (_x, _z, y) => y >= 5);
  return { voxels: done(out), size: 0.2, emissive: [P.gold], solid: [[-0.8, 0.8, -0.6, 0.6]] };
}

/** Coroa de Aurora: a ribbon crown with stars. Budget 80/200. */
export function auroraCrown(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-aurora-crown");
  const band = r.pick([V.blueNight, P.ice] as const);
  const ribbon = r.pick([P.bulbBlue, P.pineLight, P.bulbGreen] as const);
  const points = r.int(3, 5);
  const gem = r.pick([P.gold, P.cream, P.red] as const);
  const v: Voxel[] = [];
  for (let x = -3; x <= 3; x++) v.push([x, 0, -1, band], [x, 0, 1, band]);
  for (let i = 0; i < points; i++) {
    const x = -3 + Math.round((6 * i) / Math.max(1, points - 1));
    v.push([x, 1, 0, ribbon], [x, 2, 0, ribbon], [x, 3, 0, i === Math.floor(points / 2) ? gem : P.gold]);
    if (i % 2 === 0) v.push([x, 2, -1, ribbon], [x, 2, 1, ribbon]);
  }
  v.push([0, 1, 2, P.gold], [0, 1, -2, P.gold]);
  return { voxels: done(v), size: 0.2, emissive: [P.bulbBlue, P.pineLight, P.gold], anchors: { attach: [0, 9, 0] } };
}

/** Fio do Amanhecer: a spool with a glowing thread. Budget 80/200. */
export function dawnThread(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-dawn-thread");
  const spool = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const thread = r.pick([P.gold, V.rose, P.ice] as const);
  const loop = r.int(0, 2);
  const needle = r.chance(0.5);
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 1, spool);
  box(v, -1, 1, 1, 1, 2, 2, thread);
  v.push([0, 3, 1, thread], [0, 4, 1, thread]);
  if (loop === 0) {
    for (let y = 4; y <= 6; y++) v.push([2, y, 1, thread]);
    v.push([1, 6, 1, thread], [3, 6, 1, thread], [2, 7, 1, P.cream]);
  } else if (loop === 1) {
    v.push([1, 4, 1, thread], [1, 5, 1, thread], [0, 6, 1, thread], [-1, 6, 1, thread], [-1, 5, 1, thread], [0, 4, 1, P.cream]);
  } else {
    v.push([0, 4, 2, thread], [0, 5, 2, thread], [0, 6, 2, thread], [0, 6, 0, P.cream]);
  }
  if (needle) v.push([-2, 0, 1, P.snow], [-3, 0, 1, P.snow], [-4, 0, 1, P.cream]);
  return { voxels: done(v), size: 0.2, emissive: [P.gold, P.cream], anchors: { attach: [0, 0, 0] } };
}

/** Vela da Vigília: a hand candle with a flame. Budget 80/200. */
export function handRightCandle(seed: Seed): GenModel {
  const r = new Rng(seed, "saga-hand-right-candle");
  const holder = r.pick([P.gold, V.goldDeep, P.wood] as const);
  const height = r.int(4, 6);
  const flame = r.chance(0.5);
  const drip = r.chance(0.5);
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, -1, 1, holder);
  box(v, 0, 0, 1, height, 0, 0, P.cream);
  v.push([0, height + 1, 0, P.gold], [0, height + 2, 0, P.red]);
  if (flame) v.push([1, height + 1, 0, P.gold], [-1, height + 2, 0, P.gold]);
  if (drip) v.push([1, 1, 0, P.cream], [1, 2, 0, P.snow], [-1, 3, 0, P.snow]);
  v.push([0, 1, 1, P.red]);
  return { voxels: done(v), size: 0.2, emissive: [P.gold, P.red], anchors: { attach: [0, -3, 0] } };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "star-guide", category: "world_prop", name: "Estrela-Guia", generate: starGuide },
  { id: "great-bell", category: "world_prop", name: "Sino-Mor", generate: greatBell },
  { id: "loom", category: "world_prop", name: "Tear", generate: loom },
  { id: "time-tower", category: "world_prop", name: "Torre do Tempo", generate: timeTower },
  { id: "ice-bridge", category: "world_prop", name: "Ponte de Gelo", generate: iceBridge },
  { id: "foundation-stone", category: "world_prop", name: "Pedra Fundamental", generate: foundationStone },
  { id: "snow-archive", category: "world_prop", name: "Arquivo das Neves", generate: snowArchive },
  { id: "aurora-crown", category: "quest_item", name: "Coroa de Aurora", generate: auroraCrown },
  { id: "dawn-thread", category: "quest_item", name: "Fio do Amanhecer", generate: dawnThread },
  { id: "hand-right-candle", category: "quest_item", name: "Vela da Vigília", generate: handRightCandle },
];

export const SAGA_IDS: ReadonlySet<string> = new Set(PROPS.map((prop) => prop.id));
