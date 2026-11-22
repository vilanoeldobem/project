/**
 * Book X props: the lost hour, the time gear, the short candle and the small notebook.
 * Seeded recipes only; colours come from PALETTE/V; every model is grounded on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { box, dedupe, disc, ground, rotate, snowCap } from "../../parts";
import { Rng, type Seed } from "../../rng";
import type { GenModel } from "../../types";
import type { StoryPropGenerator } from "../catalog";

const done = (v: Voxel[]) => dedupe(ground(v));

/**
 * `lost-hour`: a pocket hourglass with a wooden or brass frame, two glass bulbs and golden sand.
 * It represents the lost hours, the hourglass, the sand clock and the right hour. Budget 80/200.
 */
export function lostHour(seed: Seed): GenModel {
  const r = new Rng(seed, "book-10-lost-hour");
  const frame = r.pick([P.wood, V.woodDark, P.gold, P.coal] as const);
  const glass = r.pick([P.ice, P.snowShade] as const);
  const sand = r.pick([P.gold, V.crust, P.cream, P.carrot] as const);
  const tall = r.chance(0.5);
  const turn = r.int(0, 3);
  const snow = r.chance(0.5);
  const waist = tall ? 4 : 3;

  const v: Voxel[] = [];
  // Base and top cap: 3x3 plates with four corner posts.
  box(v, -1, 1, 0, 0, -1, 1, frame);
  const cap = waist + 3;
  box(v, -1, 1, cap, cap, -1, 1, frame);
  for (const [x, z] of [[-1, -1], [1, -1], [-1, 1], [1, 1]] as const) {
    for (let y = 1; y < cap; y++) v.push([x, y, z, frame]);
  }

  // Lower bulb with sand, waist and upper bulb with a little sand.
  disc(v, 0, 0, 1, 1, glass);
  disc(v, 0, 0, 2, 1, glass);
  v.push([0, 3, 0, glass]);
  for (const [x, z] of [[0, 0], [-1, 0], [1, 0], [0, -1], [0, 1]] as const) v.push([x, 1, z, sand]);
  v.push([0, 2, 0, sand], [1, 2, 0, sand], [-1, 2, 0, sand]);
  const upper = waist + 1;
  disc(v, 0, 0, upper, 1, glass);
  disc(v, 0, 0, upper + 1, 1, glass);
  v.push([0, upper, 0, sand], [0, upper + 1, 0, sand]);

  // Finial and snow on the top cap.
  v.push([0, cap + 1, 0, frame]);
  const out = snow ? snowCap(v, P.snow, (x, z, y) => y === cap && Math.abs(x) + Math.abs(z) <= 1) : v;
  return { voxels: done(rotate(out, turn)), size: 0.18, emissive: [sand] };
}

/**
 * `time-gear`: an upright brass gear on a small wooden base, with a hub and an axle.
 * It represents the gears, the Tower of Time and the thread of time. Budget 80/200.
 */
export function timeGear(seed: Seed): GenModel {
  const r = new Rng(seed, "book-10-time-gear");
  const metal = r.pick([P.gold, V.goldDeep, P.stoneDark, P.coal] as const);
  const base = r.pick([P.wood, V.woodDark, P.stone] as const);
  const accent = r.pick([P.cream, P.coal, P.gold] as const);
  const radius = r.int(2, 3);
  const teeth = r.int(6, 8);
  const thick = radius === 3 ? 1 : r.int(1, 2);
  const turn = r.int(0, 3);
  const snow = r.chance(0.5);
  const centre = radius + 3;

  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, -1, 1, base);
  box(v, 0, 0, 1, 2, 0, 0, base);
  for (let z = 0; z < thick; z++) {
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        if (x * x + y * y <= radius * radius + radius * 0.5) v.push([x, centre + y, z, metal]);
      }
    }
  }
  for (let k = 0; k < teeth; k++) {
    const a = (2 * Math.PI * k) / teeth;
    const x = Math.round((radius + 1) * Math.cos(a));
    const y = Math.round((radius + 1) * Math.sin(a));
    for (let z = 0; z < thick; z++) v.push([x, centre + y, z, metal]);
  }
  for (let z = 0; z < thick; z++) v.push([0, centre, z, accent]);
  v.push([0, centre, thick, accent], [0, centre, thick + 1, metal]);
  const out = snow ? snowCap(v, P.snow, (_x, _z, y) => y === 0 || y === 2) : v;
  return { voxels: done(rotate(out, turn)), size: 0.18 };
}

/**
 * `short-candle`: a short candle in a small holder, with a drip and a two-voxel flame.
 * It represents the candles, the vigil and the snack hour. Budget 80/200.
 */
export function shortCandle(seed: Seed): GenModel {
  const r = new Rng(seed, "book-10-short-candle");
  const holder = r.pick([P.gold, V.goldDeep, P.stoneDark, P.wood] as const);
  const wax = r.pick([P.cream, P.red, P.pineLight, P.snow] as const);
  const flame = r.pick([P.gold, P.carrot] as const);
  const flameAlt = r.pick([P.bulbRed, P.gold] as const);
  const height = r.int(2, 4);
  const wide = r.chance(0.5);
  const dripSide = r.chance(0.5) ? 1 : -1;
  const lean = r.int(-1, 1);
  const turn = r.int(0, 3);
  const snow = r.chance(0.5);

  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, -1, 1, holder);
  for (const [x, z] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as const) v.push([x, 1, z, holder]);
  for (let y = 2; y <= height + 1; y++) {
    v.push([0, y, 0, wax]);
    if (wide) v.push([1, y, 0, wax]);
  }
  v.push([dripSide, 2, 0, wax], [dripSide, 3, 0, wax]);
  v.push([0, height + 2, 0, P.coal]);
  v.push([lean, height + 3, 0, flame], [lean, height + 4, 0, flameAlt]);
  const out = snow ? snowCap(v, P.snow, (x, z, y) => y === 0 && Math.abs(x) + Math.abs(z) <= 1) : v;
  return { voxels: done(rotate(out, turn)), size: 0.16, emissive: [flame, flameAlt] };
}

/**
 * `small-notebook`: a small closed or open notebook with a cover, pale pages, a spine and a ribbon.
 * It represents the notebooks, the lesson, the song and the promise. Budget 80/200.
 */
export function smallNotebook(seed: Seed): GenModel {
  const r = new Rng(seed, "book-10-small-notebook");
  const cover = r.pick([P.red, P.pine, V.blueNight, V.woodDark, V.redDeep] as const);
  const paper = r.pick([P.cream, V.creamShade, P.snow] as const);
  const ribbon = r.pick([P.gold, P.red, P.pine] as const);
  const open = r.chance(0.5);
  const wide = r.chance(0.5);
  const long = r.chance(0.5);
  const bookmark = r.chance(0.6);
  const turn = r.int(0, 3);
  const w = wide ? 2 : 1;
  const d = long ? 2 : 1;

  const v: Voxel[] = [];
  if (!open) {
    box(v, -w, w, 0, 0, -d, d, cover);
    box(v, -w + (w > 1 ? 1 : 0), w - (w > 1 ? 1 : 0), 1, 1, -d + (d > 1 ? 1 : 0), d - (d > 1 ? 1 : 0), paper);
    box(v, -w, w, 2, 2, -d, d, cover);
    for (let y = 0; y <= 2; y++) v.push([-w, y, 0, V.woodDark]);
    const bandZ = r.pick([-d, 0, d] as const);
    for (let x = -w; x <= w; x++) v.push([x, 1, bandZ, ribbon]);
    if (bookmark) v.push([w, 1, 0, ribbon]);
  } else {
    box(v, -w, w, 0, 0, -d, d, cover);
    for (let x = -w; x <= w; x++) {
      for (let z = -d + 1; z <= d - 1; z++) if (x !== 0) v.push([x, 1, z, paper]);
    }
    v.push([0, 1, 0, V.woodDark]);
    for (let z = -d + 1; z <= d - 1; z++) v.push([0, 1, z, ribbon]);
    if (bookmark) v.push([0, 2, d - 1, ribbon]);
  }
  return { voxels: done(rotate(v, turn)), size: 0.18 };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "lost-hour", category: "quest_item", name: "Hora perdida", generate: lostHour },
  { id: "time-gear", category: "quest_item", name: "Engrenagem do tempo", generate: timeGear },
  { id: "short-candle", category: "quest_item", name: "Vela curta", generate: shortCandle },
  { id: "small-notebook", category: "quest_item", name: "Caderno pequeno", generate: smallNotebook },
];
