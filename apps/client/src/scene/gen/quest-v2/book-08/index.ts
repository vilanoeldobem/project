/**
 * Book VIII props: the sun seed, the glass flower, the season spice and the summer flower.
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
const RING: ReadonlyArray<readonly [number, number]> = [[2, 0], [1, 1], [0, 2], [-1, 1], [-2, 0], [-1, -1], [0, -2], [1, -1]];

/**
 * `sun-seed`: a golden seed with a glowing tip, two leaves and a spark. It is the seed of the garden, the
 * heater and the inner sun. Budget 80/200.
 */
export function sunSeed(seed: Seed): GenModel {
  const r = new Rng(seed, "book-08-sun-seed");
  const body = r.pick([P.gold, V.mustard, P.cream] as const);
  const glow = r.pick([P.gold, P.bulbRed, P.cream] as const);
  const leaf = r.pick([P.leaf, P.pineLight, V.pineMoss] as const);
  const dir = r.int(0, 3);
  const [dx, dz] = DIRS[dir];
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 1, body);
  v.push([0, 1, 0, body], [0, 2, 0, body], [0, 3, 0, glow]);
  v.push([dx, 1, dz, leaf], [dx * 2, 1, dz * 2, leaf]);
  if (r.chance(0.6)) v.push([-dx, 2, -dz, leaf], [0, 4, 0, glow]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [glow] };
}

/**
 * `glass-flower`: a pale flower with a glass stem, four or five petals and a gold centre. It is the glass
 * flower of the dome and the thaw. Budget 80/200.
 */
export function glassFlower(seed: Seed): GenModel {
  const r = new Rng(seed, "book-08-glass-flower");
  const stem = r.pick([P.ice, V.skyBlue] as const);
  const petal = r.pick([P.ice, P.snow, V.skyBlue] as const);
  const centre = r.pick([P.gold, P.cream] as const);
  const height = r.int(3, 4);
  const petals = r.int(4, 5);
  const start = r.int(0, 7);
  const extra = r.chance(0.5);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 1, P.stoneDark);
  for (let y = 1; y <= height; y++) v.push([0, y, 0, stem]);
  for (let i = 0; i < petals; i++) {
    const [px, pz] = RING[(start + i * 2) % RING.length];
    v.push([px, height, pz, petal]);
  }
  v.push([0, height + 1, 0, centre]);
  if (extra) v.push([0, height + 2, 0, petal]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [P.ice, centre] };
}

/**
 * `season-spice`: a cream jar with a coloured body, a gold lid and a paper tag. It is the spring goods, the
 * scale, the stall and the ice cream. Budget 80/200.
 */
export function seasonSpice(seed: Seed): GenModel {
  const r = new Rng(seed, "book-08-season-spice");
  const jar = r.pick([V.redDeep, P.cream, V.mustard] as const);
  const lid = r.pick([P.gold, V.goldDeep, P.cream] as const);
  const tag = r.pick([P.cream, V.goldDeep, P.snow] as const);
  const mound = r.pick([P.carrot, V.redBright, P.gold] as const);
  const turn = r.int(0, 3);

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, P.cream);
  disc(v, 0, 0, 1, 2, jar);
  disc(v, 0, 0, 2, 1, jar);
  disc(v, 0, 0, 3, 1, lid);
  v.push([0, 1, 2, tag], [0, 2, 2, tag]);
  if (r.chance(0.7)) v.push([0, 4, 0, mound]);
  return { voxels: done(rotate(v, turn)), size: 0.14, emissive: [lid] };
}

/**
 * `summer-flower`: a large flower in a wooden pot, with a tall stem, two leaves, eight petals and a gold
 * centre. It is the summer bloom, the channel, the shade, the bee and the parasol. Budget 220/600.
 */
export function summerFlower(seed: Seed): GenModel {
  const r = new Rng(seed, "book-08-summer-flower");
  const pot = r.pick([P.wood, V.woodDark, P.pineDark] as const);
  const soil = r.pick([P.coal, P.trunk] as const);
  const stem = r.pick([P.pine, P.pineLight, P.leaf] as const);
  const petal = r.pick([P.gold, V.mustard, P.cream] as const);
  const centre = r.pick([P.gold, P.carrot, V.mustard] as const);
  const height = r.int(5, 7);
  const start = r.int(0, 7);
  const extra = r.chance(0.5);
  const turn = r.int(0, 3);
  const [lx, lz] = DIRS[start % 4];

  const v: Voxel[] = [];
  disc(v, 0, 0, 0, 2, pot);
  disc(v, 0, 0, 1, 1, soil);
  box(v, 0, 0, 2, height - 1, 0, 0, stem);
  v.push([lx, 3, lz, P.leaf], [lx * 2, 3, lz * 2, P.leaf], [-lx, 4, -lz, P.leaf]);
  for (let i = 0; i < RING.length; i++) {
    const [px, pz] = RING[(start + i) % RING.length];
    v.push([px, height, pz, petal]);
  }
  disc(v, 0, 0, height, 1, centre);
  if (extra) v.push([0, height + 1, 0, petal]);
  return { voxels: done(rotate(v, turn)), size: 0.24, emissive: [centre] };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "sun-seed", category: "quest_item", name: "Semente de sol", generate: sunSeed },
  { id: "glass-flower", category: "quest_item", name: "Flor de vidro", generate: glassFlower },
  { id: "season-spice", category: "quest_item", name: "Aroma da estação", generate: seasonSpice },
  { id: "summer-flower", category: "world_prop", name: "Flor de verão", generate: summerFlower },
];
