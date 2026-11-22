/** Book V cosmetic layers: three free rewards and three paid catalogue pairs of boots. */
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

/** A travel pack with a flap, two shoulder straps and a pale ticket. */
export function backTravel(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 2, 0, 0, P.pine);
  box(v, -1, 1, 3, 3, 0, 0, P.gold);
  box(v, -1, 0, 2, 2, 1, 1, P.cream);
  for (const x of [-2, 2]) box(v, x, x, 0, 3, 0, 0, V.woodDark);
  v.push([1, 1, 1, P.cream], [1, 0, 1, P.gold]);
  return layer(v, [0, 3, -1]);
}

/** A silver spool with a loop of thread and a small blue glint. */
export function backThread(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 1, 0, 0, P.stone);
  v.push([-1, 2, 0, P.cream], [0, 2, 0, P.cream], [1, 2, 0, P.cream]);
  v.push([0, 2, 1, P.bulbBlue], [0, 1, 1, P.cream], [1, 1, 1, P.bulbBlue]);
  box(v, -1, 1, 0, 0, 1, 1, P.ice);
  return layer(v, [0, 3, -1], [P.bulbBlue]);
}

/** A small open promise book at the chest, with a gold bookmark. */
export function specialPromiseBook(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, 1, 1, P.cream);
  box(v, -1, 1, 1, 1, 1, 1, P.snow);
  box(v, 0, 0, 0, 1, 1, 1, P.gold);
  v.push([0, 2, 1, P.gold], [0, 3, 1, P.red]);
  v.push([-1, 0, 2, P.ice], [1, 0, 2, P.ice]);
  return layer(v, [0, 5, 0], [P.gold]);
}

const boots = (base: string, accent: string, toe: string): GenModel => {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    box(v, x, x, 0, 0, 0, 1, base);
    box(v, x, x, 1, 1, 0, 0, accent);
    box(v, x, x, 2, 2, 0, 0, base);
    v.push([x, 0, 2, toe]);
  }
  return layer(v, [0, -3, 0]);
};

/** Green and blue boots with a pale band. */
export function shoesAurora(): GenModel {
  return boots(P.pine, P.ice, P.cream);
}

/** White and ice boots with a snowflake glint. */
export function shoesFrost(): GenModel {
  return boots(P.snow, V.skyBlue, P.ice);
}

/** Gold and red boots with a sunrise toe. */
export function shoesDawn(): GenModel {
  return boots(P.gold, V.redDeep, P.cream);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "back-travel", target: "body", layer: backTravel() },
  { id: "back-thread", target: "body", layer: backThread() },
  { id: "special-promise-book", target: "body", layer: specialPromiseBook() },
  { id: "shoes-aurora", target: "body", layer: shoesAurora() },
  { id: "shoes-frost", target: "body", layer: shoesFrost() },
  { id: "shoes-dawn", target: "body", layer: shoesDawn() },
];
