/**
 * Book IX props: the old tool, the blank page, the stone mark and the first book.
 * Seeded recipes only; colours come from PALETTE/V; every model is grounded on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { box, dedupe, disc, ground, rotate } from "../../parts";
import { Rng, type Seed } from "../../rng";
import type { GenModel } from "../../types";
import type { StoryPropGenerator } from "../catalog";

const done = (v: Voxel[]) => dedupe(ground(v));
const DIRS: ReadonlyArray<readonly [number, number]> = [[1, 0], [0, 1], [-1, 0], [0, -1]];

/**
 * `old-tool`: a wooden handle with a heavy head, a gold band and a chip. It is the old tool, the beam and
 * the pencil of the first works. Budget 80/200.
 */
export function oldTool(seed: Seed): GenModel {
  const r = new Rng(seed, "book-09-old-tool");
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const head = r.pick([P.stoneDark, V.stoneWarm, P.coal] as const);
  const band = r.pick([P.gold, V.goldDeep, P.cream] as const);
  const chipColor = r.pick([P.coal, P.stoneDark] as const);
  const alongX = r.chance(0.5);
  const sign = r.chance(0.5) ? 1 : -1;
  const length = r.int(4, 6);

  const v: Voxel[] = [];
  for (let i = 0; i < length; i++) v.push(alongX ? [sign * i, 1, 0, wood] : [0, 1, sign * i, wood]);
  const hx = alongX ? sign * (length - 1) : 0;
  const hz = alongX ? 0 : sign * (length - 1);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) {
      if (Math.abs(dx) + Math.abs(dz) > 1) continue;
      for (let dy = 0; dy <= 1; dy++) v.push([hx + dx, dy, hz + dz, head]);
    }
  }
  v.push([hx, 1, hz, band]);
  const mid = Math.floor(length / 2);
  v.push(alongX ? [sign * mid, 1, 1, band] : [1, 1, sign * mid, band]);
  if (r.chance(0.7)) v.push(alongX ? [sign * mid, 2, 0, chipColor] : [0, 2, sign * mid, chipColor]);
  return { voxels: done(rotate(v, r.int(0, 3))), size: 0.14, emissive: [band] };
}

/**
 * `blank-page`: a parchment sheet with a folded corner, a pencil across it and an ink dot. It is the blank
 * page, the old pencil and the first word. Budget 80/200.
 */
export function blankPage(seed: Seed): GenModel {
  const r = new Rng(seed, "book-09-blank-page");
  const paper = r.pick([P.cream, V.creamShade, P.snow] as const);
  const edge = r.pick([V.stoneWarm, P.stone] as const);
  const pencil = r.pick([V.woodDark, P.wood, V.woodLight] as const);
  const ink = r.pick([V.blueNight, P.gold, P.coal] as const);
  const width = r.int(4, 5);
  const depth = r.int(3, 4);
  const corner = r.int(0, 3);
  const [cx, cz] = DIRS[corner];
  const pencilAlongX = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  for (let x = -Math.floor(width / 2); x <= Math.ceil(width / 2) - 1; x++) {
    for (let z = -Math.floor(depth / 2); z <= Math.ceil(depth / 2) - 1; z++) v.push([x, 0, z, paper]);
  }
  v.push([cx * Math.ceil(width / 2), 1, cz * Math.ceil(depth / 2), edge]);
  v.push([-cx * Math.ceil(width / 2), 0, -cz * Math.ceil(depth / 2), edge]);
  if (pencilAlongX) {
    for (let x = -1; x <= 2; x++) v.push([x, 1, 0, pencil]);
    v.push([3, 1, 0, ink]);
  } else {
    for (let z = -1; z <= 2; z++) v.push([0, 1, z, pencil]);
    v.push([0, 1, 3, ink]);
  }
  if (r.chance(0.7)) v.push([cx, 1, cz, ink]);
  if (r.chance(0.5)) v.push([0, 0, 0, edge]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [ink] };
}

/**
 * `stone-mark`: a small two-layer stone with a carved mark, moss and a chip. It is the mark, the small
 * stone, the foundation and the name on the stone. Budget 80/200.
 */
export function stoneMark(seed: Seed): GenModel {
  const r = new Rng(seed, "book-09-stone-mark");
  const stone = r.pick([P.stone, V.stoneWarm, P.stoneDark] as const);
  const mark = r.pick([P.cream, P.snow, P.gold] as const);
  const moss = r.pick([P.leaf, V.pineMoss] as const);
  const chip = r.pick([P.coal, P.stoneDark] as const);
  const pattern = r.int(0, 2);
  const mossDir = r.int(0, 3);
  const [mx, mz] = DIRS[mossDir];
  const tall = r.chance(0.6);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, stone);
  if (tall) disc(v, 0, 0, 1, 1, stone);
  const top = tall ? 2 : 1;
  if (pattern === 0) {
    v.push([0, top, 0, mark], [1, top, 0, mark], [-1, top, 0, mark], [0, top, 1, mark], [0, top, -1, mark]);
  } else if (pattern === 1) {
    v.push([0, top, 0, mark], [1, top, 0, mark], [2, top, 0, mark]);
  } else {
    v.push([0, top, 0, mark], [1, top, 1, mark], [-1, top, -1, mark]);
  }
  v.push([mx * 2, 0, mz * 2, moss], [mx * 2, 1, mz * 2, moss]);
  if (r.chance(0.7)) v.push([-mx * 2, 0, -mz * 2, chip]);
  return { voxels: done(rotate(v, r.int(0, 3))), size: 0.14 };
}

/**
 * `first-book`: an open book on a stone or wooden pedestal, with a dark cover, pale pages, a gold spine and
 * a bookmark. It is the book, the shelf, the letter and the promise. Budget 220/600.
 */
export function firstBook(seed: Seed): GenModel {
  const r = new Rng(seed, "book-09-first-book");
  const base = r.pick([P.stone, V.stoneWarm, P.wood, V.woodDark] as const);
  const cover = r.pick([V.redDeep, P.pine, P.wood, V.navy] as const);
  const paper = r.pick([P.cream, V.creamShade, P.snow] as const);
  const spine = r.pick([P.gold, V.goldDeep] as const);
  const line = r.pick([V.stoneWarm, P.stoneDark] as const);
  const wing = r.int(1, 2);
  const bookmark = r.chance(0.6);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  box(v, -2, 2, 0, 0, -2, 2, base);
  box(v, -1, 1, 1, 2, -1, 1, base);
  box(v, -2, 2, 3, 3, -2, 1, cover);
  box(v, -2, -1, 4, 4, -1, 0, paper);
  box(v, 1, wing, 4, 4, -1, 0, paper);
  v.push([0, 3, 0, spine], [0, 4, 0, spine], [0, 4, -1, spine], [0, 3, -2, spine]);
  for (let x = -2; x <= -1; x++) v.push([x, 5, 0, line]);
  for (let x = 1; x <= wing; x++) v.push([x, 5, 0, line]);
  if (bookmark) v.push([0, 5, 1, spine], [0, 6, 1, spine]);
  return { voxels: done(rotate(v, turn)), size: 0.24, emissive: [spine] };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "old-tool", category: "quest_item", name: "Ferramenta antiga", generate: oldTool },
  { id: "blank-page", category: "quest_item", name: "Página em branco", generate: blankPage },
  { id: "stone-mark", category: "quest_item", name: "Marca de pedra", generate: stoneMark },
  { id: "first-book", category: "world_prop", name: "Primeiro livro", generate: firstBook },
];
