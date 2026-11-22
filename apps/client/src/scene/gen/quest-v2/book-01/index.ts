/**
 * Book I props (PROPOSTA): a silent plaza bell, the fallen bell parts, a recipe page and a panettone.
 * Seeded recipes only; colours come from PALETTE/V; every model is grounded on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { box, dedupe, disc, ground, rotate, snowCap, walls } from "../../parts";
import { Rng, type Seed } from "../../rng";
import type { GenModel } from "../../types";
import type { StoryPropGenerator } from "../catalog";

const done = (v: Voxel[]) => dedupe(ground(v));

/**
 * `silent-bell`: a timber frame with a broad bronze bell and no clapper. The missing clapper is the readable
 * silhouette: an empty dark mouth under a bell that cannot ring. Budget 220/600.
 */
export function silentBell(seed: Seed): GenModel {
  const r = new Rng(seed, "book-01-silent-bell");
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const woodAlt = wood === V.woodDark ? P.wood : V.woodDark;
  const metal = r.pick([P.gold, V.goldDeep, V.crust] as const);
  const metalAlt = metal === P.gold ? V.goldDeep : P.gold;
  const rope = r.pick([P.red, P.pine, P.cream] as const);
  const snowy = r.chance(0.5);
  const tall = r.chance(0.5);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  const top = tall ? 11 : 10;
  // Two posts and a crossbeam.
  for (const x of [-5, 5]) {
    box(v, x, x, 0, top, 0, 0, wood);
  }
  box(v, -6, 6, top, top, 0, 0, (x, _y, _z) => (x === -6 || x === 6 ? woodAlt : wood));
  // The bell: a stacked, tapering bronze body with an open mouth.
  disc(v, 0, 0, top - 1, 1, metal);
  disc(v, 0, 0, top - 2, 2, metal);
  disc(v, 0, 0, top - 3, 3, metal);
  disc(v, 0, 0, top - 4, 2, metalAlt);
  // Empty clapper slot and a visible rim.
  v.push([0, top - 4, 0, P.coal], [0, top - 5, 0, P.coal]);
  for (let x = -2; x <= 2; x++) v.push([x, top - 4, -2, metalAlt], [x, top - 4, 2, metalAlt]);
  // Rope from the beam to the bell crown, tied with a small bow.
  v.push([0, top, 0, rope], [0, top - 1, 0, rope]);
  v.push([-1, top - 1, 1, rope], [1, top - 1, 1, rope]);
  // Snow on the beam and post tops.
  if (snowy) {
    for (const x of [-6, -5, 5, 6]) v.push([x, top + 1, 0, P.snow]);
    v.push([0, top + 1, -1, P.snow], [0, top + 1, 1, P.snow]);
  }
  // A small red ribbon on one post marks the feast day.
  v.push([-5, Math.floor(top / 2), 2, P.red], [-5, Math.floor(top / 2) + 1, 2, V.redDeep]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(snowCap(out, P.snow, (_x, _z, y) => y >= top)), size: 0.25 };
}

/**
 * `bell-parts`: the clapper and two coiled ropes fallen on the snow. Budget 40/110.
 */
export function bellParts(seed: Seed): GenModel {
  const r = new Rng(seed, "book-01-bell-parts");
  const ropeA = r.pick([P.red, P.pine, P.cream] as const);
  const ropeB = r.pick([P.red, P.pine, P.cream].filter((c) => c !== ropeA) as string[]);
  const metal = r.pick([P.gold, V.goldDeep, V.crust] as const);
  const high = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  // Clapper: rod and ball.
  box(v, -3, -1, 0, 0, 0, 0, metal);
  v.push([-3, 1, 0, metal], [-3, 2, 0, V.goldDeep], [-2, 0, 1, V.crust]);
  // Two coiled ropes, each a small spiral on the ground.
  const coils = [
    { x: 1, z: 0, c: ropeA, h: high ? 1 : 0 },
    { x: 2, z: 2, c: ropeB, h: high ? 0 : 1 },
  ] as const;
  for (const coil of coils) {
    const y = coil.h;
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) if (Math.abs(dx) + Math.abs(dz) <= 1) v.push([coil.x + dx, y, coil.z + dz, coil.c]);
    v.push([coil.x + 1, y + 1, coil.z, coil.c], [coil.x, y + 1, coil.z + 1, coil.c]);
  }
  // A knot and a loose end.
  v.push([0, 0, -2, ropeA], [1, 0, -2, ropeB], [2, 0, -1, ropeB]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

/**
 * `recipe-page`: a folded page with ink lines, a flour stain and a small seal. No legible text. Budget 30/80.
 */
export function recipePage(seed: Seed): GenModel {
  const r = new Rng(seed, "book-01-recipe-page");
  const ink = r.pick([P.coal, V.blueNight] as const);
  const stain = r.pick([P.wood, V.woodDark, P.red] as const);
  const fold = r.pick([-1, 1] as const);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  // Page: 5 x 4 cells, with one folded corner.
  box(v, -2, 2, 0, 0, -2, 1, P.cream);
  v.push([fold * 2, 0, 1, V.creamShade], [fold * 2, 0, 0, V.creamShade]);
  // Folded corner rising one voxel.
  v.push([fold * 2, 1, 1, P.cream], [fold * 2, 1, 0, V.creamShade]);
  // Ink lines.
  for (let x = -1; x <= 1; x++) v.push([x, 1, -1, ink]);
  v.push([-1, 1, 0, ink], [1, 1, 0, ink], [0, 1, 0, stain]);
  // Stain and seal.
  v.push([-2, 1, 1, stain], [2, 1, -2, P.red]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

/**
 * `panettone`: a paper mould with a domed top, sugar and candied fruit. Budget 45/120.
 */
export function panettone(seed: Seed): GenModel {
  const r = new Rng(seed, "book-01-panettone");
  const paper = r.pick([P.cream, V.creamShade] as const);
  const paperAlt = paper === P.cream ? V.creamShade : P.cream;
  const tall = r.chance(0.5);
  const fruit = r.pick([P.red, P.gold, P.pine] as const);
  const fruitAlt = fruit === P.red ? P.gold : P.red;
  const sugar = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  // Paper mould: 4 x 4 base with pleated sides.
  box(v, -2, 1, 0, 0, -2, 1, (x, _y, z) => ((x + z) & 1 ? paper : paperAlt));
  walls(v, -2, 1, 1, 1, -2, 1, (x, _y, z) => (x + z) & 1 ? paperAlt : paper);
  // Domed top: a 3 x 3 crown and a soft centre.
  box(v, -1, 1, 2, 2, -1, 1, (x, _y, z) => (x === 0 && z === 0 ? P.cream : paper));
  v.push([0, 3, 0, tall ? P.cream : paperAlt]);
  // Candied fruit and sugar.
  v.push([-1, 2, -1, fruit], [1, 2, 1, fruitAlt], [1, 2, -1, fruit]);
  if (sugar) v.push([0, 3, -1, P.snow], [0, 3, 1, P.snow]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "silent-bell", category: "world_prop", name: "Sino mudo", generate: silentBell },
  { id: "bell-parts", category: "quest_item", name: "Peças do sino", generate: bellParts },
  { id: "recipe-page", category: "quest_item", name: "Página da receita", generate: recipePage },
  { id: "panettone", category: "quest_item", name: "Panetone", generate: panettone },
];
