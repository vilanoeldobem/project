/**
 * Book X cosmetic layers. Each layer is a small voxel set in avatar coordinates; the wardrobe and the
 * avatar apply it to the body or the right arm. Budget: 40 voxels and 140 faces per layer.
 */
import { PALETTE as P } from "@vila/shared/game/world";

import type { Voxel } from "../../../models";
import { V } from "../../palette";
import { dedupe } from "../../parts";
import type { CosmeticModel } from "../../cosmetics-v2";

const layer = (voxels: Voxel[], target: CosmeticModel["target"]): CosmeticModel => ({
  id: "",
  target,
  layer: { voxels: dedupe(voxels), size: 0.3 },
});

/** A thin band with a pale face on the wrist. */
export function watchLayer(): CosmeticModel {
  const v: Voxel[] = [
    [0, -2, 0, P.gold],
    [-1, -2, 0, P.gold],
    [1, -2, 0, P.gold],
    [0, -2, -1, P.gold],
    [0, -2, 1, P.cream],
    [0, -2, 2, V.goldDeep],
  ];
  return { ...layer(v, "armRight"), id: "hand-right-watch" };
}

/** A short candle in a gold holder, held in front of the hand. */
export function handCandleLayer(): CosmeticModel {
  const v: Voxel[] = [
    [0, -3, 1, P.gold],
    [0, -3, 2, V.goldDeep],
    [0, -2, 1, P.cream],
    [0, -1, 1, P.cream],
    [0, 0, 1, P.coal],
    [0, 1, 1, P.gold],
  ];
  return { ...layer(v, "armRight"), id: "hand-right-candle" };
}

/** A cream and gold vigil dress with a pine sash and a small star. */
export function dressVigilLayer(): CosmeticModel {
  const v: Voxel[] = [];
  for (let y = 3; y <= 5; y++) {
    for (let x = -1; x <= 1; x++) v.push([x, y, 1, y === 3 ? P.gold : P.cream]);
    v.push([-1, y, 0, y === 3 ? P.pine : P.cream], [1, y, 0, y === 3 ? P.pine : P.cream]);
  }
  for (let x = -1; x <= 1; x++) v.push([x, 2, 1, P.gold]);
  v.push([-1, 2, 0, P.cream], [1, 2, 0, P.cream]);
  for (let x = -2; x <= 2; x++) v.push([x, 1, 1, P.cream], [x, 0, 1, P.gold]);
  v.push([-2, 1, 0, P.cream], [2, 1, 0, P.cream], [-2, 0, 0, P.gold], [2, 0, 0, P.gold]);
  v.push([0, 4, 2, P.gold]);
  return { ...layer(v, "body"), id: "dress-vigil" };
}

/** A small star above the head with two short rays. */
export function starGuideLayer(): CosmeticModel {
  const v: Voxel[] = [
    [0, 10, 0, P.gold],
    [-1, 10, 0, P.gold],
    [1, 10, 0, P.gold],
    [0, 10, -1, P.gold],
    [0, 10, 1, P.gold],
    [0, 11, 0, P.cream],
    [0, 9, 0, V.ice],
  ];
  return { ...layer(v, "body"), id: "special-star-guide" };
}

/** A warm arc behind the shoulders, from gold to rose and ice. */
export function dawnLayer(): CosmeticModel {
  const v: Voxel[] = [
    [-2, 5, -1, V.rose],
    [-1, 6, -1, P.gold],
    [0, 7, -1, P.cream],
    [1, 8, -1, P.gold],
    [2, 9, -1, V.rose],
    [-1, 4, -1, V.ice],
    [1, 4, -1, V.ice],
    [0, 10, -1, P.gold],
  ];
  return { ...layer(v, "body"), id: "special-dawn" };
}

/** Two aurora bands behind the body, in pine, ice blue and gold. */
export function vigilAuroraLayer(): CosmeticModel {
  const v: Voxel[] = [
    [-2, 5, -1, P.pineLight],
    [-1, 6, -1, P.bulbBlue],
    [0, 7, -1, P.pineLight],
    [1, 8, -1, P.bulbBlue],
    [2, 9, -1, P.pineLight],
    [-1, 8, -1, P.bulbBlue],
    [1, 6, -1, P.pineLight],
    [0, 10, -1, P.gold],
  ];
  return { ...layer(v, "body"), id: "special-vigil-aurora" };
}

export const MODELS: readonly CosmeticModel[] = [
  watchLayer(),
  handCandleLayer(),
  dressVigilLayer(),
  starGuideLayer(),
  dawnLayer(),
  vigilAuroraLayer(),
];
