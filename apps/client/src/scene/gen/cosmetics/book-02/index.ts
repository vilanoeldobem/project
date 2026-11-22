/** Book II cosmetic layers: three free rewards and three paid catalogue blouses. */
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

/** A sage blouse with a rose at the collar and leaf stitches. */
export function blouseGarden(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, (x, y) => (y === 1 && x === 0 ? P.cream : P.leaf));
  box(v, -1, 1, 2, 2, 0, 0, P.pine);
  v.push([-1, 1, 0, P.pine], [1, 1, 0, P.pine], [0, 2, 0, P.red], [-1, 3, 0, P.pine], [1, 3, 0, P.pine]);
  return layer(v, [0, 3, 0]);
}

/** A patchwork blouse in cream, red and gold. */
export function blouseQuilt(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, (x, y) => ((x + y) % 3 === 0 ? P.red : (x + y) % 3 === 1 ? P.cream : P.gold));
  box(v, -1, 1, 2, 2, 0, 0, P.red);
  v.push([-1, 1, 0, P.gold], [1, 1, 0, P.gold], [0, 1, 0, P.cream], [-1, 3, 0, P.cream], [1, 3, 0, P.cream]);
  return layer(v, [0, 3, 0]);
}

/** Two garden shoes with a small flower on the toe. */
export function shoesGarden(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    v.push([x, 0, 0, P.wood], [x, 0, 1, P.wood], [x, 1, 0, P.pine], [x, 1, 1, P.pine]);
    v.push([x, 1, 2, P.cream]);
  }
  v.push([0, 1, 2, P.red], [-1, 0, 2, P.leaf], [1, 0, 2, P.leaf]);
  return layer(v, [0, -3, 0]);
}

/** A high aurora blouse: deep blue bands with pine and gold light. */
export function blouseAurora(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, (x, y) => (y === 1 ? V.blueNight : (x === 0 ? P.pineLight : P.bulbBlue)));
  box(v, -1, 1, 2, 2, 0, 0, P.gold);
  v.push([-1, 3, 0, P.pineLight], [0, 3, 0, P.bulbBlue], [1, 3, 0, P.pineLight], [0, 1, 0, P.gold]);
  return layer(v, [0, 3, 0], [P.gold, P.bulbBlue, P.pineLight]);
}

/** A deep velvet blouse with one gold star at the centre. */
export function blouseVelvetNight(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, (x, y) => (x === 0 && y === 1 ? P.gold : V.blueNight));
  box(v, -1, 1, 2, 2, 0, 0, P.cream);
  v.push([-1, 3, 0, V.blueNight], [0, 3, 0, P.gold], [1, 3, 0, V.blueNight], [0, 2, 0, P.cream]);
  return layer(v, [0, 3, 0], [P.gold]);
}

/** A cream starlight blouse with a blue yoke and three gold stars. */
export function blouseStarlight(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 1, 0, 0, P.cream);
  box(v, -1, 1, 2, 2, 0, 0, V.blueNight);
  v.push([-1, 1, 0, P.gold], [0, 1, 0, P.gold], [1, 1, 0, P.gold], [0, 3, 0, P.gold], [-1, 3, 0, P.cream], [1, 3, 0, P.cream]);
  return layer(v, [0, 3, 0], [P.gold, P.cream]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "blouse-garden", target: "body", layer: blouseGarden() },
  { id: "blouse-quilt", target: "body", layer: blouseQuilt() },
  { id: "shoes-garden", target: "body", layer: shoesGarden() },
  { id: "blouse-aurora", target: "body", layer: blouseAurora() },
  { id: "blouse-velvet-night", target: "body", layer: blouseVelvetNight() },
  { id: "blouse-starlight", target: "body", layer: blouseStarlight() },
];
