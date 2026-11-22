/**
 * Book II props (PROPOSTA): the garden nameplate, the wooden reindeer, Alba's rose and the watering can.
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

/**
 * `nameplate`: a small wooden sign on two posts, with a carved rose medallion and snow on the beam. No text:
 * the name is DOM copy, never voxels. Budget 60/160.
 */
export function nameplate(seed: Seed): GenModel {
  const r = new Rng(seed, "book-02-nameplate");
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const woodAlt = wood === V.woodDark ? P.wood : V.woodDark;
  const rose = r.pick([P.red, V.redDeep, P.cream] as const);
  const tall = r.chance(0.5);
  const side = r.pick([-1, 1] as const);
  const snowy = r.chance(0.5);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  const top = tall ? 6 : 5;
  // Two posts and a crossbeam.
  for (const x of [-3, 3]) box(v, x, x, 0, top, 0, 0, wood);
  box(v, -4, 4, top, top, 0, 0, woodAlt);
  // The plate and the carved rose medallion.
  box(v, -2, 2, top - 3, top - 1, 1, 1, P.cream);
  v.push([side * 1, top - 2, 2, rose], [side * 2, top - 1, 2, P.pine], [side * 1, top - 1, 2, V.redDeep]);
  v.push([0, top - 2, 2, P.gold]);
  // Snow on the beam.
  if (snowy) v.push([-4, top + 1, 0, P.snow], [4, top + 1, 0, P.snow]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.2 };
}

/**
 * `toy-reindeer`: a wooden reindeer on four wheels, with antlers and a red harness stripe. The unfinished
 * part is the readable silhouette: one antler branch is shorter by a seed. Budget 70/180.
 */
export function toyReindeer(seed: Seed): GenModel {
  const r = new Rng(seed, "book-02-toy-reindeer");
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const woodAlt = wood === V.woodDark ? P.wood : V.woodDark;
  const wheel = r.pick([P.red, P.gold, P.pine] as const);
  const band = r.pick([P.red, V.redDeep, P.gold] as const);
  const antler = r.pick(["short", "long", "curled"] as const);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  // Body, neck and head.
  box(v, -2, 2, 2, 4, -1, 0, wood);
  box(v, 2, 3, 4, 6, 0, 0, woodAlt);
  box(v, 3, 4, 6, 7, -1, 1, wood);
  v.push([4, 7, 1, P.coal]);
  // Four wheels, one per corner.
  for (const x of [-2, 2]) for (const z of [-1, 1]) v.push([x, 0, z * 2, wheel]);
  // Legs joining body and wheels.
  for (const x of [-2, 2]) for (const z of [-1, 1]) v.push([x, 1, z, woodAlt]);
  // Antlers: the same base, one branch varying.
  for (const z of [-1, 1]) v.push([3, 8, z, P.cream], [3, 9, z, P.cream]);
  if (antler === "short") v.push([4, 9, 0, P.cream]);
  else if (antler === "long") v.push([3, 10, -1, P.cream], [4, 10, 1, P.cream]);
  else v.push([2, 9, -1, P.cream], [4, 9, 1, P.cream]);
  // Harness stripe.
  v.push([0, 3, 1, band]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.2 };
}

/**
 * `rose`: a stem with two leaves and a layered bloom. Variants change the bloom colour, height and leaf side.
 * Budget 30/90.
 */
export function rose(seed: Seed): GenModel {
  const r = new Rng(seed, "book-02-rose");
  const bloom = r.pick([P.red, V.redDeep, P.cream, P.gold] as const);
  const bloomAlt = bloom === P.red ? V.redDeep : P.red;
  const leaf = r.pick([P.pine, P.leaf, P.pineLight] as const);
  const tall = r.chance(0.5);
  const side = r.pick([-1, 1] as const);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  const stemTop = tall ? 5 : 4;
  // Stem and two leaves.
  for (let y = 0; y <= stemTop; y++) v.push([0, y, 0, P.pine]);
  v.push([side, 2, 0, leaf], [side * 2, 2, 0, leaf], [side, 3, 0, P.leaf]);
  v.push([-side, 3, 0, leaf], [-side * 2, 3, 0, leaf]);
  // Bloom: a small disc with a domed centre and a second colour on the rim.
  disc(v, 0, 0, stemTop + 1, 1, bloom);
  v.push([0, stemTop + 2, 0, bloomAlt], [-1, stemTop + 2, 0, bloom], [1, stemTop + 2, 0, bloom]);
  v.push([0, stemTop + 3, 0, P.gold]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

/**
 * `watering-can`: a metal can with a spout, a handle and a pierced rose. Budget 45/120.
 */
export function wateringCan(seed: Seed): GenModel {
  const r = new Rng(seed, "book-02-watering-can");
  const body = r.pick([P.stone, P.cream, P.pineLight] as const);
  const bodyAlt = body === P.stone ? P.stoneDark : P.stone;
  const trim = r.pick([P.gold, V.goldDeep] as const);
  const side = r.pick([-1, 1] as const);
  const handle = r.pick(["arc", "ring", "flat"] as const);
  const turn = r.int(0, 1);

  const v: Voxel[] = [];
  // Body: 3 x 3 x 3 with a shaded base and a gold band.
  box(v, -1, 1, 0, 2, -1, 1, (x, y, z) => (y === 0 ? bodyAlt : (x === 1 && z === 1 ? bodyAlt : body)));
  box(v, -1, 1, 2, 2, -1, 1, trim);
  // Spout, angled out from one side.
  v.push([side * 2, 1, 0, trim], [side * 3, 2, 0, trim], [side * 4, 3, 0, trim]);
  v.push([side * 4, 3, -1, P.gold], [side * 4, 3, 1, P.gold]);
  // Handle over the top, three styles.
  if (handle === "arc") v.push([-1, 4, 0, trim], [0, 4, 0, trim], [1, 4, 0, trim]);
  else if (handle === "ring") v.push([-1, 3, 0, trim], [-1, 4, 0, trim], [1, 4, 0, trim], [1, 3, 0, trim]);
  else v.push([-2, 3, 0, trim], [2, 3, 0, trim]);
  // Pierced rose: a few holes on the spout end.
  v.push([side * 3, 3, 0, P.coal], [side * 2, 2, 1, P.cream]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: done(out), size: 0.18 };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "nameplate", category: "world_prop", name: "Placa de Alba", generate: nameplate },
  { id: "toy-reindeer", category: "quest_item", name: "Rena de madeira", generate: toyReindeer },
  { id: "rose", category: "quest_item", name: "Roseira de Alba", generate: rose },
  { id: "watering-can", category: "quest_item", name: "Regador", generate: wateringCan },
];
