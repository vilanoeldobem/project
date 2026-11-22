/**
 * Book V props (PROPOSTA): the ownerless suitcase, the silver shuttle, the ice flower and the star map.
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
 * `suitcase`: a rounded travel case with a handle, two straps and a little snow. It is the ownerless
 * suitcase of the platform and the three forgotten bags of the regional arc. Budget 220/600.
 */
export function suitcase(seed: Seed): GenModel {
  const r = new Rng(seed, "book-05-suitcase");
  const body = r.pick([P.wood, V.woodLight, P.coal, V.redDeep] as const);
  const trim = r.pick([P.gold, P.cream, P.ice] as const);
  const handle = r.pick([P.coal, V.woodDark, P.gold] as const);
  const width = r.int(2, 3);
  const height = r.int(2, 3);
  const depth = r.int(1, 2);
  const straps = r.chance(0.5);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, V.woodDark);
  box(v, -width, width, 1, height, -depth, depth, body);
  box(v, -width, width, height + 1, height + 1, -depth, depth, trim);
  for (const x of [-width, width]) {
    for (const z of [-depth, depth]) v.push([x, height + 1, z, trim]);
  }
  if (straps) {
    for (const x of [-1, 1]) box(v, x, x, 1, height, -depth - 1, -depth - 1, trim);
  }
  box(v, -1, 1, height + 2, height + 2, 0, 0, handle);
  v.push([-1, height + 1, 0, handle], [1, height + 1, 0, handle]);
  if (snow) {
    const out = snowCap(v, P.snow, (x, z, y) => y === height + 1 && (x + z) % 2 === 0);
    return { voxels: dedupe(ground(rotate(out, turn))), size: 0.2 };
  }
  return { voxels: done(rotate(v, turn)), size: 0.2 };
}

/**
 * `silver-shuttle`: the loom shuttle, a tapered silver hull with a gold band, a spool and a bright
 * thread. It is collected in the Vale and used again at the loom. Budget 80/200.
 */
export function silverShuttle(seed: Seed): GenModel {
  const r = new Rng(seed, "book-05-silver-shuttle");
  const hull = r.pick([P.stone, P.snow, P.ice] as const);
  const band = r.pick([P.gold, V.goldDeep] as const);
  const thread = r.pick([P.cream, P.bulbBlue, P.red] as const);
  const length = r.int(3, 4);
  const tall = r.chance(0.5);
  const spool = r.chance(0.5) ? 1 : -1;
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  for (let x = -length; x <= length; x++) {
    const edge = Math.abs(x) === length;
    for (let z = -1; z <= 1; z++) {
      if (edge && Math.abs(z) === 1) continue;
      v.push([x, 0, z, hull]);
      if (!edge) v.push([x, 1, z, z === 0 ? thread : hull]);
    }
  }
  for (let x = -length + 1; x <= length - 1; x++) v.push([x, 2, 0, band]);
  const sx = spool * (length + 1);
  for (let y = 1; y <= (tall ? 3 : 2); y++) v.push([sx, y, 0, band]);
  v.push([sx, 1, 1, thread], [sx, 2, 1, thread], [sx + spool, 2, 0, thread]);
  return { voxels: done(rotate(v, turn)), size: 0.16, emissive: [band] };
}

/**
 * `ice-flower`: a pale flower with a warm heart and a snow base, taller than the frost flower of Book IV.
 * It carries the names in the Vale. Budget 80/200.
 */
export function iceFlower(seed: Seed): GenModel {
  const r = new Rng(seed, "book-05-ice-flower");
  const petal = r.pick([P.ice, P.snow, V.skyBlue] as const);
  const heart = r.pick([P.gold, V.goldDeep, P.bulbBlue] as const);
  const stem = r.pick([P.pineDark, V.blueNight] as const);
  const base = r.pick([P.snow, P.snowShade] as const);
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
 * `star-map`: a small standing board with a dark sky, a wooden frame and a handful of gold stars. It is
 * the platform timetable and the route of the last departure. Budget 220/600.
 */
export function starMap(seed: Seed): GenModel {
  const r = new Rng(seed, "book-05-star-map");
  const frame = r.pick([P.wood, V.woodDark, P.pine] as const);
  const panel = r.pick([V.navy, V.blueNight, P.coal] as const);
  const star = r.pick([P.gold, P.cream, P.bulbBlue] as const);
  const post = r.int(1, 3);
  const halfW = r.int(2, 3);
  const halfH = r.int(1, 2);
  const crown = r.chance(0.5);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, V.woodDark);
  for (let y = 1; y <= post; y++) v.push([0, y, 0, frame]);
  const y0 = post + 1;
  box(v, -halfW, halfW, y0, y0 + halfH * 2, 0, 0, panel);
  box(v, -halfW - 1, halfW + 1, y0 - 1, y0 - 1, 0, 0, frame);
  box(v, -halfW - 1, halfW + 1, y0 + halfH * 2 + 1, y0 + halfH * 2 + 1, 0, 0, frame);
  for (let y = y0; y <= y0 + halfH * 2; y++) {
    v.push([-halfW - 1, y, 0, frame], [halfW + 1, y, 0, frame]);
  }
  const stars: Array<[number, number]> = [
    [-halfW, y0],
    [halfW, y0],
    [0, y0 + 1],
    [-1, y0 + halfH * 2],
    [halfW - 1, y0 + halfH],
    [1 - halfW, y0 + halfH],
  ];
  const count = r.int(4, 5);
  for (let i = 0; i < count; i++) {
    const [x, y] = stars[i % stars.length];
    if (x >= -halfW && x <= halfW) v.push([x, y, 1, star]);
  }
  if (crown) v.push([0, y0 + halfH * 2 + 2, 0, star]);
  if (snow) {
    const out = snowCap(v, P.snow, (x, z, y) => y === y0 - 1 && (x + z) % 2 === 0);
    return { voxels: dedupe(ground(rotate(out, turn))), size: 0.22, emissive: [star] };
  }
  return { voxels: done(rotate(v, turn)), size: 0.22, emissive: [star] };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "suitcase", category: "world_prop", name: "Mala sem dono", generate: suitcase },
  { id: "silver-shuttle", category: "quest_item", name: "Naveta de prata", generate: silverShuttle },
  { id: "ice-flower", category: "quest_item", name: "Flor de gelo", generate: iceFlower },
  { id: "star-map", category: "world_prop", name: "Mapa das estrelas", generate: starMap },
];
