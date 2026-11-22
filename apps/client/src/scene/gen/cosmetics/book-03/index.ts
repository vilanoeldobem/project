/** Book III cosmetic layers: three free rewards and three paid catalogue trousers. */
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

/** A leather postbag with a strap, a brass buckle and a letter peeking out. */
export function backPostbag(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, V.woodDark);
  box(v, -1, 1, 3, 3, 0, 0, P.wood);
  box(v, -1, 1, 4, 4, 0, 0, V.woodDark);
  v.push([0, 2, 1, P.gold], [0, 1, 1, P.cream], [-2, 1, 0, V.woodDark], [2, 1, 0, V.woodDark]);
  v.push([-1, 4, 0, P.gold], [1, 4, 0, P.gold]);
  return layer(v, [0, 3, -1]);
}

/** A knit cap with a small brass bell and a red band. */
export function helmetBell(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, -1, 1, P.red);
  box(v, -1, 1, 1, 1, -1, 1, V.redDeep);
  box(v, -2, 2, 0, 0, 0, 0, P.cream);
  v.push([0, 2, 0, P.gold], [0, 3, 0, P.gold], [0, 1, 2, P.cream], [-1, 1, 2, P.cream], [1, 1, 2, P.cream]);
  return layer(v, [0, 9, 0], [P.gold]);
}

/** A postal-blue coat with a cream collar, brass buttons and a gold pocket thread. */
export function blousePost(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, V.blueNight);
  box(v, -1, 1, 3, 3, 0, 0, P.cream);
  v.push([0, 1, 1, P.gold], [0, 2, 1, P.gold], [1, 0, 1, P.gold], [-1, 1, 1, P.cream], [1, 1, 1, P.cream]);
  return layer(v, [0, 3, 0]);
}

/** Deep-blue trousers with a green-blue aurora band on both legs. */
export function pantsAurora(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    v.push([x, 0, 0, V.navy], [x, 1, 0, P.pineLight], [x, 2, 0, P.bulbBlue], [x, 0, 1, V.navy], [x, 1, 1, P.pineLight]);
  }
  box(v, -1, 1, 3, 3, 0, 0, V.navy);
  return layer(v, [0, -3, 0], [P.pineLight, P.bulbBlue]);
}

/** Ice-blue trousers with a snow cuff. */
export function pantsFrost(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    v.push([x, 0, 0, P.snow], [x, 1, 0, P.ice], [x, 2, 0, V.blueNight], [x, 0, 1, P.snow], [x, 1, 1, P.ice]);
  }
  box(v, -1, 1, 3, 3, 0, 0, V.blueNight);
  return layer(v, [0, -3, 0]);
}

/** Dark trousers with a single gold thread down the front. */
export function pantsGoldThread(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    v.push([x, 0, 0, P.coal], [x, 1, 0, P.coal], [x, 2, 0, P.coal], [x, 1, 1, P.gold]);
  }
  box(v, -1, 1, 3, 3, 0, 0, P.coal);
  return layer(v, [0, -3, 0], [P.gold]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "back-postbag", target: "body", layer: backPostbag() },
  { id: "helmet-bell", target: "body", layer: helmetBell() },
  { id: "blouse-post", target: "body", layer: blousePost() },
  { id: "pants-aurora", target: "body", layer: pantsAurora() },
  { id: "pants-frost", target: "body", layer: pantsFrost() },
  { id: "pants-gold-thread", target: "body", layer: pantsGoldThread() },
];
