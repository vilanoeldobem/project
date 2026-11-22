/** Book IV cosmetic layers: three free rewards and three paid catalogue dresses. */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { box, dedupe } from "../../parts";
import type { GenModel } from "../../types";
import type { CosmeticModel } from "../../cosmetics-v2";

const layer = (voxels: Voxel[], attach: [number, number, number], emissive?: string[]): GenModel => ({
  voxels: dedupe(voxels),
  size: 0.3,
  anchors: { attach },
  ...(emissive ? { emissive } : {}),
});

/** Dark snow trousers with a cream fur cuff and a sturdy boot on each leg. */
export function pantsSnowboot(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    box(v, x, x, 2, 3, 0, 0, V.navy);
    box(v, x, x, 1, 1, 0, 0, P.cream);
    box(v, x, x, 0, 0, 0, 1, V.woodDark);
    v.push([x, 0, 0, P.coal]);
  }
  return layer(v, [0, -3, 0]);
}

/** A small lake lantern held in the left hand: dark frame, warm core and a short handle. */
export function handLeftLakeLantern(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -2, 1, P.coal], [0, -1, 1, P.gold], [0, 0, 1, P.coal], [-1, -1, 1, P.coal], [1, -1, 1, P.coal]);
  v.push([0, 1, 1, P.coal], [0, 2, 1, P.coal], [-1, -2, 1, P.gold], [1, -2, 1, P.gold]);
  return layer(v, [0, 0, 0], [P.gold]);
}

/** A glowing ember with two small antler curves, pinned at the chest. */
export function specialBrasa(): GenModel {
  const v: Voxel[] = [];
  v.push([0, 0, 1, P.gold], [0, 1, 1, P.bulbRed], [-1, 0, 1, V.redDeep], [1, 0, 1, V.redDeep]);
  v.push([-1, 1, 1, P.gold], [-2, 2, 1, P.gold], [1, 1, 1, P.gold], [2, 2, 1, P.gold]);
  v.push([0, 2, 1, P.gold], [-1, 3, 1, P.cream], [1, 3, 1, P.cream]);
  return layer(v, [0, 5, 0], [P.gold, P.bulbRed]);
}

/** An aurora dress: a deep torso with green and blue bands and a clear hem. */
export function dressAurora(): GenModel {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = 3; y <= 5; y++) v.push([x, y, 0, y === 5 ? P.cream : V.blueNight]);
    for (let z = -1; z <= 1; z++) v.push([x, 2, z, P.pineLight], [x, 1, z, P.bulbBlue]);
  }
  v.push([-1, 4, 1, P.pineLight], [1, 4, 1, P.pineLight], [0, 3, 1, P.cream]);
  return layer(v, [0, 0, 0]);
}

/** An ice dress: pale blue, with a snowflake hem. */
export function dressIce(): GenModel {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = 3; y <= 5; y++) v.push([x, y, 0, y === 4 ? V.skyBlue : P.ice]);
    for (let z = -1; z <= 1; z++) v.push([x, 2, z, V.skyBlue], [x, 1, z, P.snow]);
  }
  v.push([0, 1, 1, P.ice], [-1, 1, -1, P.ice], [1, 1, -1, P.ice], [0, 2, 1, P.snow]);
  return layer(v, [0, 0, 0]);
}

/** A navy dress with one gold star at the chest. */
export function dressStar(): GenModel {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = 3; y <= 5; y++) v.push([x, y, 0, V.navy]);
    for (let z = -1; z <= 1; z++) v.push([x, 2, z, V.blueNight], [x, 1, z, V.navy]);
  }
  v.push([0, 4, 1, P.gold], [-1, 4, 1, P.gold], [1, 4, 1, P.gold], [0, 5, 1, P.gold], [0, 3, 1, P.gold]);
  return layer(v, [0, 0, 0], [P.gold]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "pants-snowboot", target: "body", layer: pantsSnowboot() },
  { id: "hand-left-lake-lantern", target: "armLeft", layer: handLeftLakeLantern() },
  { id: "special-brasa", target: "body", layer: specialBrasa() },
  { id: "dress-aurora", target: "body", layer: dressAurora() },
  { id: "dress-ice", target: "body", layer: dressIce() },
  { id: "dress-star", target: "body", layer: dressStar() },
];
