/**
 * Book IV props (PROPOSTA): the named frost flower, the lake lantern, the bridge planks and the ice duck.
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
 * `frost-flower`: an ice flower with a warm heart, a short stem and a snow base. The heart is the readable
 * silhouette: a small light where the name of Brasa was written. Budget 80/200.
 */
export function frostFlower(seed: Seed): GenModel {
  const r = new Rng(seed, "book-04-frost-flower");
  const petal = r.pick([P.snow, P.ice, V.skyBlue] as const);
  const heart = r.pick([P.gold, V.goldDeep, P.bulbBlue] as const);
  const stem = r.pick([P.pineDark, V.blueNight] as const);
  const base = r.pick([P.ice, P.snowShade] as const);
  const height = r.int(2, 3);
  const wide = r.chance(0.5);
  const snow = r.chance(0.5);
  const leafSide = r.chance(0.5) ? 1 : -1;
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, base);
  for (let y = 1; y <= height; y++) v.push([0, y, 0, stem]);
  v.push([leafSide, height - 1, 0, P.pine], [leafSide, height, 0, P.pineLight]);
  const top = height + 1;
  disc(v, 0, 0, top, wide ? 2 : 1, petal);
  v.push([0, top, 0, heart]);
  for (const [x, z] of [[-2, 0], [2, 0], [0, -2], [0, 2]] as const) {
    if (wide) v.push([x, top, z, petal]);
  }
  if (snow) {
    const out = snowCap(v, P.snow, (x, z, y) => y === 0 && (x + z) % 2 === 0);
    return { voxels: dedupe(ground(rotate(out, turn))), size: 0.18, emissive: [heart] };
  }
  return { voxels: done(rotate(v, turn)), size: 0.18, emissive: [heart] };
}

/**
 * `lake-lantern`: a short post, a glowing core, a dark frame and a snow roof. It lights the lake margin and
 * the far bank of the bridge. Budget 180/480.
 */
export function lakeLantern(seed: Seed): GenModel {
  const r = new Rng(seed, "book-04-lake-lantern");
  const frame = r.pick([P.coal, P.pine, P.red, V.woodDark] as const);
  const glow = r.pick([P.gold, V.goldDeep] as const);
  const post = r.int(0, 3);
  const wide = r.chance(0.5);
  const tall = r.chance(0.5);
  const cap = r.chance(0.5);
  const finial = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, -1, 1, frame);
  for (let y = 1; y <= post; y++) v.push([0, y, 0, frame]);
  const y0 = post + 1;
  const s = wide ? 1 : 0;
  const h = tall ? 3 : 2;
  box(v, -s, s, y0, y0 + h - 1, -s, s, glow);
  const c = s + 1;
  for (const [x, z] of [[-c, -c], [c, -c], [-c, c], [c, c]] as const) box(v, x, x, y0, y0 + h - 1, z, z, frame);
  const top = y0 + h;
  box(v, -c, c, top, top, -c, c, frame);
  if (cap) box(v, -c + 1, c - 1, top + 1, top + 1, -c + 1, c - 1, frame);
  if (finial) v.push([0, top + 2, 0, P.gold]);
  const out = snowCap(v, P.snow, (x, z, y) => y === top && Math.abs(x) <= c && Math.abs(z) <= c && (x + z) % 2 === 0);
  return { voxels: dedupe(ground(rotate(out, turn))), size: 0.22, emissive: [glow] };
}

/**
 * `bridge-plank`: two to four planks stacked with a small offset, tied by two ropes and dusted with snow.
 * It is the collectable plank and the bridge interaction model. Budget 60/160.
 */
export function bridgePlank(seed: Seed): GenModel {
  const r = new Rng(seed, "book-04-bridge-plank");
  const wood = r.pick([P.wood, V.woodLight, V.woodDark] as const);
  const woodAlt = wood === V.woodDark ? P.wood : V.woodDark;
  const rope = r.pick([P.red, P.cream, P.gold] as const);
  const count = r.int(2, 4);
  const length = r.int(4, 6);
  const shift = r.chance(0.5) ? 1 : 0;
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  const half = Math.floor(length / 2);
  for (let i = 0; i < count; i++) {
    const y = i;
    const z = i - 1 + (shift && i > 0 ? 1 : 0);
    box(v, -half, half, y, y, z, z, i % 2 === 0 ? wood : woodAlt);
    for (const x of [-2, 2]) if (x >= -half && x <= half) v.push([x, y, z + 1, rope]);
  }
  for (const x of [-2, 2]) {
    if (x < -half || x > half) continue;
    for (let y = 0; y < count; y++) v.push([x, y, y - 1 + (shift && y > 0 ? 1 : 0) + 1, rope]);
  }
  if (snow) {
    const out = snowCap(v, P.snow, (x, z, y) => y === count - 1 && Math.abs(x) <= half && (x + z) % 2 === 0);
    return { voxels: dedupe(ground(rotate(out, turn))), size: 0.2 };
  }
  return { voxels: done(rotate(v, turn)), size: 0.2 };
}

/**
 * `ice-duck`: an ice duck on a snow base, with a warm light under one wing. The duck guards the second lake
 * light and is turned upright in the side quest. Budget 160/420.
 */
export function iceDuck(seed: Seed): GenModel {
  const r = new Rng(seed, "book-04-ice-duck");
  const body = r.pick([P.ice, V.skyBlue, P.snow] as const);
  const bodyAlt = body === P.snow ? P.ice : P.snow;
  const base = r.pick([P.snow, P.snowShade] as const);
  const beak = r.pick([P.carrot, P.gold] as const);
  const side = r.chance(0.5) ? 1 : -1;
  const headSide = r.chance(0.5) ? 1 : -1;
  const wing = r.chance(0.5);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, base);
  box(v, -1, 1, 1, 2, -1, 1, body);
  v.push([-2, 1, 0, bodyAlt], [-2, 1, 1, bodyAlt]);
  v.push([1, 3, 0, body], [1, 3, 1, body], [2, 3, 0, body]);
  v.push([headSide * 2, 3, 1, body], [headSide * 2, 3, 0, body]);
  v.push([headSide * 3, 3, 0, beak]);
  if (wing) box(v, -1, 1, 2, 2, side * 2, side * 2, bodyAlt);
  v.push([0, 1, side * 2, P.gold]);
  if (snow) {
    const out = snowCap(v, P.snow, (x, z, y) => y === 0 && (x + z) % 2 === 0);
    return { voxels: dedupe(ground(rotate(out, turn))), size: 0.22, emissive: [P.gold] };
  }
  return { voxels: done(rotate(v, turn)), size: 0.22, emissive: [P.gold] };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "frost-flower", category: "quest_item", name: "Flor de gelo", generate: frostFlower },
  { id: "lake-lantern", category: "world_prop", name: "Lanterna do lago", generate: lakeLantern },
  { id: "bridge-plank", category: "quest_item", name: "Tábua da ponte", generate: bridgePlank },
  { id: "ice-duck", category: "world_prop", name: "Pato de gelo", generate: iceDuck },
];
