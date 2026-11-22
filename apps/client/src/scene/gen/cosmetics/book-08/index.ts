/** Book VIII cosmetic layers: three free rewards and three paid catalogue hand pieces. */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { dedupe } from "../../parts";
import type { GenModel } from "../../types";
import type { CosmeticModel } from "../../cosmetics-v2";

const layer = (voxels: Voxel[], attach: [number, number, number], emissive?: string[]): GenModel => ({
  voxels: dedupe(voxels),
  size: 0.3,
  anchors: { attach },
  ...(emissive ? { emissive } : {}),
});

/** A gold summer dress with a cream bodice, a green skirt band and a flower at the chest. */
export function dressSummer(): GenModel {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) {
    for (let y = 3; y <= 5; y++) v.push([x, y, 0, y === 5 ? P.cream : P.gold]);
    for (let z = -1; z <= 1; z++) v.push([x, 2, z, P.leaf], [x, 1, z, P.gold]);
  }
  v.push([0, 4, 1, P.cream], [-1, 4, 1, P.gold], [1, 4, 1, P.gold], [0, 3, 1, P.gold]);
  return layer(v, [0, 0, 0], [P.gold]);
}

/** A cream apron with two straps, a waist tie and a gold pocket. */
export function specialApron(): GenModel {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) for (let y = 1; y <= 4; y++) v.push([x, y, 1, y === 4 ? P.cream : V.creamShade]);
  v.push([-1, 5, 0, P.cream], [1, 5, 0, P.cream], [-2, 2, 0, P.gold], [2, 2, 0, P.gold]);
  v.push([0, 2, 2, P.gold], [0, 3, 2, V.redBright]);
  return layer(v, [0, 0, 0], [P.gold]);
}

/** Gold paint dots and a green leaf across the cheeks. */
export function facePaint(): GenModel {
  const v: Voxel[] = [];
  v.push([-1, 1, 0, P.gold], [-1, 0, 0, V.redBright], [1, 1, 0, P.gold], [1, 0, 0, V.redBright]);
  v.push([0, 2, 0, P.leaf], [-1, 2, 0, P.cream], [1, 2, 0, P.cream]);
  return layer(v, [0, 6, 2], [P.gold]);
}

/** A green-blue aurora ribbon with a gold star, held in the left hand. */
export function handLeftAurora(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -2, 1, V.skyBlue], [0, -1, 1, P.pineLight], [0, 0, 1, P.bulbBlue]);
  v.push([-1, -1, 1, P.pineLight], [1, -1, 1, V.skyBlue], [0, 1, 1, P.gold], [0, 2, 1, P.cream]);
  return layer(v, [0, 0, 0], [P.bulbBlue, P.gold]);
}

/** An ice crystal in a pale cross, held in the left hand. */
export function handLeftFrost(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -2, 1, P.ice], [0, -1, 1, P.snow], [0, 0, 1, P.ice], [0, 1, 1, P.snow]);
  v.push([-1, 0, 1, P.ice], [1, 0, 1, P.ice], [-1, -1, 1, V.skyBlue], [1, -1, 1, V.skyBlue]);
  return layer(v, [0, 0, 0], [P.ice]);
}

/** A gold summer star with a cream centre, held in the left hand. */
export function handLeftSummerStar(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -1, 1, P.gold], [-1, 0, 1, P.gold], [1, 0, 1, P.gold], [0, 1, 1, P.gold]);
  v.push([0, 0, 1, P.cream], [0, -2, 1, P.cream], [0, 2, 1, P.cream]);
  return layer(v, [0, 0, 0], [P.gold]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "dress-summer", target: "body", layer: dressSummer() },
  { id: "special-apron", target: "body", layer: specialApron() },
  { id: "face-paint", target: "body", layer: facePaint() },
  { id: "hand-left-aurora", target: "armLeft", layer: handLeftAurora() },
  { id: "hand-left-frost", target: "armLeft", layer: handLeftFrost() },
  { id: "hand-left-summer-star", target: "armLeft", layer: handLeftSummerStar() },
];
