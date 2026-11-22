/**
 * Book III props (PROPOSTA): the memory gear, the letter bundle, the old stamp and the clock face of the
 * Campanário. Seeded recipes only; colours come from PALETTE/V; every model is grounded on y = 0.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { box, dedupe, disc, ground, rotate } from "../../parts";
import { Rng, type Seed } from "../../rng";
import type { GenModel } from "../../types";
import type { StoryPropGenerator } from "../catalog";

/**
 * `memory-gear`: a standing brass cog with a missing tooth and a patina spot. The missing tooth is the
 * readable silhouette: a gear that remembers a time it cannot complete. Budget 60/160.
 */
export function memoryGear(seed: Seed): GenModel {
  const r = new Rng(seed, "book-03-memory-gear");
  const metal = r.pick([P.gold, V.goldDeep, V.crust] as const);
  const metalAlt = metal === P.gold ? V.goldDeep : P.gold;
  const patina = r.chance(0.5);
  const ribbon = r.chance(0.5);
  const missing = r.int(0, 7);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  // Two-layer cog body with a central pin.
  disc(v, 0, 0, 0, 2, metal);
  disc(v, 0, 0, 1, 2, metalAlt);
  v.push([0, 2, 0, metal], [0, 3, 0, metalAlt]);
  // Eight teeth around the rim; one is missing.
  const teeth = [[3, 0], [2, 2], [0, 3], [-2, 2], [-3, 0], [-2, -2], [0, -3], [2, -2]] as const;
  for (let i = 0; i < teeth.length; i++) {
    if (i === missing) continue;
    const [x, z] = teeth[i];
    v.push([x, 0, z, metal], [x, 1, z, metalAlt]);
  }
  if (patina) {
    v.push([-1, 0, 0, V.pineMoss], [1, 1, -1, V.pineMoss]);
  }
  if (ribbon) {
    const color = r.pick([P.red, P.pine, P.cream] as const);
    v.push([0, 2, 1, color], [0, 3, 1, color]);
  }
  const out = turn ? rotate(v, 1) : v;
  return { voxels: dedupe(ground(out)), size: 0.2 };
}

/**
 * `letter-bundle`: three to five crossed envelopes tied with string, a wax seal and a little snow.
 * Budget 45/120.
 */
export function letterBundle(seed: Seed): GenModel {
  const r = new Rng(seed, "book-03-letter-bundle");
  const string = r.pick([P.red, P.gold, P.cream] as const);
  const seal = string === P.red ? P.gold : P.red;
  const count = r.int(3, 5);
  const snow = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  for (let i = 0; i < count; i++) {
    const paper = i % 2 === 0 ? P.cream : V.creamShade;
    const dx = i % 2 === 0 ? 0 : 1;
    box(v, -1 + dx, 1 + dx, i, i, -1, 0, paper);
    v.push([1 + dx, i, 1, V.creamShade]);
  }
  // String around the stack and a seal on the top envelope.
  for (let i = 0; i < count; i++) v.push([0, i, 1, string]);
  v.push([0, count - 1, 0, seal], [1, count - 1, 0, seal]);
  if (snow) v.push([-1, count - 1, 1, P.snow], [1, count - 1, 1, P.snow], [0, count, 1, P.snow]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: dedupe(ground(out)), size: 0.2 };
}

/**
 * `old-stamp`: a perforated paper stamp with an abstract profile and a worn ink mark. No text. Budget 25/70.
 */
export function oldStamp(seed: Seed): GenModel {
  const r = new Rng(seed, "book-03-old-stamp");
  const ink = r.pick([P.coal, V.blueNight, V.crust] as const);
  const perforated = r.chance(0.5);
  const curled = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  // Four by three paper field.
  box(v, -2, 1, 0, 0, -1, 1, P.cream);
  if (perforated) {
    for (let x = -2; x <= 1; x += 2) v.push([x, 0, -1, V.creamShade], [x, 0, 1, V.creamShade]);
    for (let z = -1; z <= 1; z += 2) v.push([-2, 0, z, V.creamShade], [1, 0, z, V.creamShade]);
  } else {
    v.push([-2, 0, -1, V.creamShade], [1, 0, 1, V.creamShade]);
  }
  // Abstract profile and a worn ink line.
  v.push([0, 1, 0, ink], [-1, 1, 0, ink], [1, 1, 0, ink], [0, 1, 1, ink]);
  if (curled) v.push([1, 1, -1, P.cream], [1, 1, 0, V.creamShade]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: dedupe(ground(out)), size: 0.2 };
}

/**
 * `clock-face`: a round face in a timber frame, standing on a small base, hands at 23:59 and snow on the
 * top. Budget 150/420.
 */
export function clockFace(seed: Seed): GenModel {
  const r = new Rng(seed, "book-03-clock-face");
  const wood = r.pick([P.wood, V.woodDark, V.woodLight] as const);
  const woodAlt = wood === P.wood ? V.woodDark : P.wood;
  const face = r.pick([P.cream, V.creamShade] as const);
  const snow = r.chance(0.5);
  const wide = r.chance(0.5);
  const turn = r.int(0, 1);
  const v: Voxel[] = [];
  // Base and post.
  box(v, wide ? -2 : -1, wide ? 2 : 1, 0, 0, -2, 2, woodAlt);
  box(v, -1, 1, 1, 4, -1, -1, wood);
  // Frame, face, ticks and hands.
  disc(v, 0, 0, 5, 4, wood);
  disc(v, 0, 0, 5, 3, face);
  const ticks = [[0, 3], [2, 2], [3, 0], [2, -2], [0, -3], [-2, -2], [-3, 0], [-2, 2]] as const;
  for (const [x, z] of ticks) v.push([x, 6, z, P.gold]);
  v.push([0, 6, 0, P.coal], [-1, 6, 0, P.coal], [0, 6, 1, P.coal], [1, 6, 1, P.cream]);
  if (snow) v.push([-2, 6, -2, P.snow], [0, 7, -3, P.snow], [2, 6, -2, P.snow]);
  const out = turn ? rotate(v, 1) : v;
  return { voxels: dedupe(ground(out)), size: 0.25 };
}

export const PROPS: readonly StoryPropGenerator[] = [
  { id: "memory-gear", category: "quest_item", name: "Engrenagem da memória", generate: memoryGear },
  { id: "letter-bundle", category: "quest_item", name: "Maço de cartas", generate: letterBundle },
  { id: "old-stamp", category: "quest_item", name: "Selo antigo", generate: oldStamp },
  { id: "clock-face", category: "world_prop", name: "Relógio do Campanário", generate: clockFace },
];
