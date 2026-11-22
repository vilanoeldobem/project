/**
 * Book VI props (PROPOSTA): the dawn bell, the sun cord, the dew map and the path stone.
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
 * `dawn-bell`: a gold bell between two wooden posts, with a clapper, a crack and a little snow. It is the
 * bell of the Vila do Amanhecer and the three broken pieces of the first morning. Budget 220/600.
 */
export function dawnBell(seed: Seed): GenModel {
  const r = new Rng(seed, "book-06-dawn-bell");
  const metal = r.pick([P.gold, V.goldDeep, P.cream] as const);
  const wood = r.pick([P.wood, V.woodDark, P.pineDark] as const);
  const stone = r.pick([P.stone, P.stoneDark, P.snowShade] as const);
  const half = r.int(2, 3);
  const bodyH = r.int(3, 4);
  const crack = r.int(0, 3);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 3, stone);
  for (const x of [-half - 1, half + 1]) box(v, x, x, 1, 4, 0, 0, wood);
  box(v, -half - 1, half + 1, 5, 5, 0, 0, wood);
  for (let i = 0; i < bodyH; i++) {
    const width = i === 0 ? half : i === 1 ? Math.max(1, half - 1) : 1;
    disc(v, 0, 0, i + 2, width, metal);
  }
  box(v, -1, 1, bodyH + 2, bodyH + 2, 0, 0, metal);
  v.push([0, bodyH + 3, 0, metal], [0, 1, 0, metal]);
  const crackDir = [[1, 0], [0, 1], [-1, 0], [0, -1]][crack];
  for (let i = 1; i < bodyH; i++) {
    const width = i === 1 ? Math.max(1, half - 1) : 1;
    v.push([crackDir[0] * width, i + 2, crackDir[1] * width, P.coal]);
  }
  const out = snow ? snowCap(v, P.snow, (x, z, y) => y >= 5 && (x + z) % 2 === 0) : v;
  return { voxels: done(rotate(out, turn)), size: 0.24, emissive: [metal] };
}

/**
 * `sun-cord`: a coiled golden cord with a loop and a tassel. It is the three cords of the first toll.
 * Budget 80/200.
 */
export function sunCord(seed: Seed): GenModel {
  const r = new Rng(seed, "book-06-sun-cord");
  const cord = r.pick([P.gold, P.cream, V.redDeep] as const);
  const accent = r.pick([P.gold, P.cream, P.bulbRed] as const);
  const base = r.pick([P.stone, P.stoneDark, P.wood] as const);
  const loopH = r.int(2, 3);
  const loopSide = r.int(0, 3);
  const tasselSide = (loopSide + r.int(1, 3)) % 4;
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 1, base);
  disc(v, 0, 0, 1, 1, cord);
  disc(v, 0, 0, 2, 1, accent);
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const [lx, lz] = dirs[loopSide];
  for (let i = 1; i <= loopH; i++) v.push([lx * 2, i, lz * 2, cord]);
  v.push([lx * 2, loopH + 1, lz * 2, accent]);
  const [tx, tz] = dirs[tasselSide];
  for (let i = 1; i <= 2; i++) v.push([tx * 2, i, tz * 2, accent]);
  v.push([tx * 3, 0, tz * 3, accent]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [accent] };
}

/**
 * `dew-map`: a pale folded map with a gold path and a dew drop. It is the map of the Estrada do Orvalho and
 * the three drops. Budget 80/200.
 */
export function dewMap(seed: Seed): GenModel {
  const r = new Rng(seed, "book-06-dew-map");
  const panel = r.pick([P.ice, P.snow, V.skyBlue] as const);
  const drop = r.pick([P.bulbBlue, P.cream, P.gold] as const);
  const frame = r.pick([P.wood, V.woodDark, P.stone] as const);
  const halfW = r.int(2, 3);
  const fold = r.int(0, 3);
  const path = r.int(0, 3);
  const tall = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 1, frame);
  box(v, -halfW, halfW, 1, 1, -1, 1, panel);
  const corners: Array<[number, number]> = [[-halfW, -1], [halfW, -1], [-halfW, 1], [halfW, 1]];
  const [fx, fz] = corners[fold];
  v.push([fx, 2, fz, panel]);
  if (path === 0) for (let x = -halfW + 1; x <= halfW - 1; x++) v.push([x, 2, 0, P.gold]);
  else if (path === 1)
    v.push(
      [-halfW + 1, 2, -1, P.gold],
      [-halfW + 1, 2, 0, P.gold],
      [0, 2, 0, P.gold],
      [0, 2, 1, P.gold],
      [halfW - 1, 2, 1, P.gold]
    );
  else if (path === 2) v.push([-halfW + 1, 2, 1, P.gold], [0, 2, 0, P.gold], [halfW - 1, 2, -1, P.gold]);
  else for (let x = -halfW + 1; x <= halfW - 1; x += 2) v.push([x, 2, 0, P.gold]);
  v.push([-halfW, 1, -1, drop], [-halfW, 1, 0, drop]);
  if (tall) v.push([-halfW, 2, -1, drop]);
  return { voxels: done(rotate(v, turn)), size: 0.16, emissive: [P.gold] };
}

/**
 * `path-stone`: a carved standing stone with a gold groove, moss and a snow cap. It marks the road and the
 * first step. Budget 80/200.
 */
export function pathStone(seed: Seed): GenModel {
  const r = new Rng(seed, "book-06-path-stone");
  const stone = r.pick([P.stone, P.stoneDark, P.snowShade] as const);
  const inlay = r.pick([P.gold, P.cream, V.goldDeep] as const);
  const moss = r.pick([P.pine, P.pineLight, P.leaf] as const);
  const base = r.pick([P.stoneDark, P.stone, P.snowShade] as const);
  const half = r.int(1, 2);
  const height = half === 2 ? 2 : r.int(2, 3);
  const side = r.int(0, 3);
  const mossy = r.chance(0.5);
  const snow = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 1, base);
  box(v, -half, half, 1, height, -half, half, stone);
  v.push([0, height + 1, 0, stone]);
  const [dx, dz] = [[1, 0], [0, 1], [-1, 0], [0, -1]][side];
  for (let i = 1; i <= height; i++) v.push([dx * half, i, dz * half, inlay]);
  if (mossy) v.push([-half, height, half, moss], [half, 1, -half, moss]);
  const out = snow ? snowCap(v, P.snow, (x, z, y) => y === height && (x + z) % 2 === 0) : v;
  return { voxels: done(rotate(out, turn)), size: 0.15, emissive: [inlay] };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "dawn-bell", category: "world_prop", name: "Sino do amanhecer", generate: dawnBell },
  { id: "sun-cord", category: "quest_item", name: "Corda de sol", generate: sunCord },
  { id: "dew-map", category: "quest_item", name: "Mapa de orvalho", generate: dewMap },
  { id: "path-stone", category: "quest_item", name: "Pedra do caminho", generate: pathStone },
];
