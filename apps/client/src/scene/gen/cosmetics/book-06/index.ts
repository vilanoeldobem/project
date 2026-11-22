/** Book VI cosmetic layers: three free rewards and three paid catalogue capes. */
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

/** A dawn dress: gold skirt, red hem, cream collar and a small sun on the chest. */
export function dressDawn(): GenModel {
  const v: Voxel[] = [];
  for (const y of [0, 1]) {
    for (let x = -1; x <= 1; x++) {
      for (let z = -1; z <= 1; z++) {
        if (Math.max(Math.abs(x), Math.abs(z)) === 1) v.push([x, y, z, y === 1 ? V.redDeep : P.gold]);
      }
    }
  }
  box(v, -1, 1, 2, 4, 0, 0, P.gold);
  box(v, -1, 1, 4, 4, 0, 0, P.cream);
  v.push([0, 3, 1, P.cream], [-1, 2, 1, P.gold], [1, 2, 1, P.gold]);
  return layer(v, [0, 1, 0], [P.gold]);
}

/** A folded map held in the left hand, with a gold path and a cream fold. */
export function handLeftMap(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 1, 1, 1, P.cream);
  v.push([1, 1, 1, P.ice], [0, 0, 1, P.gold], [1, 0, 1, P.gold]);
  return layer(v, [0, -3, 0], [P.gold]);
}

/** Dark trousers with a small gold lantern on one leg. */
export function pantsLantern(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    for (let y = 0; y <= 2; y++) v.push([x, y, 0, V.navy]);
    for (let y = 0; y <= 1; y++) v.push([x, y, 1, V.blueNight]);
  }
  box(v, -1, 1, 3, 3, 0, 0, V.navy);
  v.push([1, 1, 2, P.gold], [1, 2, 2, P.cream]);
  return layer(v, [0, -3, 0], [P.gold]);
}

/** An aurora cape: pine, blue and gold bands over a red hem. */
export function backAuroraCape(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 4, 0, 0, V.blueNight);
  box(v, -1, 1, 1, 1, 0, 0, P.pineLight);
  box(v, -1, 1, 2, 2, 0, 0, P.bulbBlue);
  box(v, -1, 1, 3, 3, 0, 0, P.gold);
  box(v, -1, 1, 0, 0, 0, 0, V.redDeep);
  for (const x of [-2, 2]) box(v, x, x, 0, 3, 0, 0, P.pineLight);
  return layer(v, [0, 3, -1], [P.pineLight, P.bulbBlue, P.gold]);
}

/** A deep blue cloak with a cream hem and five gold stars. */
export function backStarCloak(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 4, 0, 0, V.navy);
  box(v, -1, 1, 0, 0, 0, 0, P.cream);
  v.push([0, 2, 0, P.gold], [-1, 4, 0, P.gold], [1, 4, 0, P.gold], [-1, 1, 0, P.gold], [1, 1, 0, P.gold]);
  return layer(v, [0, 3, -1], [P.gold]);
}

/** A cream mantle with gold sun rays and a red tie at the shoulder. */
export function backDawnMantle(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 4, 0, 0, P.cream);
  box(v, -1, 1, 4, 4, 0, 0, P.gold);
  v.push([-1, 3, 0, P.gold], [1, 3, 0, P.gold], [0, 2, 0, P.gold], [-1, 1, 0, V.redDeep], [1, 1, 0, V.redDeep]);
  return layer(v, [0, 3, -1], [P.gold]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "dress-dawn", target: "body", layer: dressDawn() },
  { id: "hand-left-map", target: "armLeft", layer: handLeftMap() },
  { id: "pants-lantern", target: "body", layer: pantsLantern() },
  { id: "back-aurora-cape", target: "body", layer: backAuroraCape() },
  { id: "back-star-cloak", target: "body", layer: backStarCloak() },
  { id: "back-dawn-mantle", target: "body", layer: backDawnMantle() },
];
