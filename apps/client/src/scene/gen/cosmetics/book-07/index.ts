/** Book VII cosmetic layers: three free rewards and three paid catalogue faces. */
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

/** Dark trousers with an ice stripe and a gold cord. */
export function pantsBridge(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    for (let y = 0; y <= 2; y++) {
      v.push([x, y, 0, V.navy], [x, y, 1, y === 1 ? P.ice : V.blueNight]);
    }
  }
  box(v, -1, 1, 3, 3, 0, 0, P.gold);
  v.push([0, 3, 1, P.ice]);
  return layer(v, [0, -3, 0], [P.gold]);
}

/** A rose helmet with cream ear flaps and a small shell. */
export function helmetCoral(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 1, -1, 1, V.rose);
  for (const x of [-2, 2]) box(v, x, x, -1, 0, 0, 0, P.cream);
  v.push([0, 2, 0, P.cream], [0, 2, 1, V.rose], [0, 1, 1, P.cream]);
  return layer(v, [0, 9, 0], [P.cream]);
}

/** Ice-blue boots with gold laces and a pale toe. */
export function shoesBridge(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) v.push([x, 0, 0, V.navy], [x, 0, 1, P.ice], [x, 1, 0, P.gold]);
  v.push([0, 0, 1, P.ice]);
  return layer(v, [0, -3, 0], [P.gold]);
}

/** A green-blue aurora band across the eyes. */
export function faceAurora(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 1, 1, 0, 0, P.pineLight);
  v.push([0, 1, 0, P.bulbBlue], [-1, 2, 0, P.ice], [1, 2, 0, P.ice], [0, 0, 0, P.cream]);
  return layer(v, [0, 6, 2], [P.bulbBlue, P.ice]);
}

/** Ice crystals on the forehead and cheeks. */
export function faceBridgeFrost(): GenModel {
  const v: Voxel[] = [];
  v.push([0, 2, 0, P.ice], [-1, 1, 0, P.ice], [1, 1, 0, P.ice], [-1, 2, 0, P.snow], [1, 2, 0, P.snow], [0, 1, 0, P.snow]);
  return layer(v, [0, 6, 2], [P.ice]);
}

/** Five gold and cream stars around the eyes. */
export function faceStarlight(): GenModel {
  const v: Voxel[] = [];
  v.push([-1, 1, 0, P.gold], [1, 1, 0, P.gold], [0, 2, 0, P.gold], [0, 0, 0, P.cream], [-1, 2, 0, P.cream], [1, 2, 0, P.cream]);
  return layer(v, [0, 6, 2], [P.gold]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "pants-bridge", target: "body", layer: pantsBridge() },
  { id: "helmet-coral", target: "body", layer: helmetCoral() },
  { id: "shoes-bridge", target: "body", layer: shoesBridge() },
  { id: "face-aurora", target: "body", layer: faceAurora() },
  { id: "face-bridge-frost", target: "body", layer: faceBridgeFrost() },
  { id: "face-starlight", target: "body", layer: faceStarlight() },
];
