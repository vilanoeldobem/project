/** Book I cosmetic layers: three free rewards and three paid catalogue crowns. */
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

/** A gold band with a five-point star: the first promise of the book. */
export function starCrown(): GenModel {
  const v: Voxel[] = [];
  for (let x = -1; x <= 1; x++) v.push([x, 0, -1, P.gold], [x, 0, 1, P.gold]);
  for (const z of [-1, 1]) v.push([-2, 0, z, V.goldDeep], [2, 0, z, V.goldDeep]);
  v.push([-1, 1, 0, P.gold], [1, 1, 0, P.gold], [0, 1, 0, P.cream], [0, 2, 0, P.gold], [0, 2, 1, P.cream], [0, 0, 2, P.red]);
  return layer(v, [0, 9, 0], [P.gold, P.cream]);
}

/** A small fair basket with bread and a red cloth. */
export function fairBasket(): GenModel {
  const v: Voxel[] = [];
  box(v, -1, 1, 0, 0, 0, 1, P.wood);
  box(v, -1, 1, 1, 1, 0, 0, V.woodDark);
  v.push([-1, 2, 0, V.woodDark], [1, 2, 0, V.woodDark], [0, 2, 0, P.red], [0, 1, 1, P.cream], [0, 0, 1, P.cream], [-1, 1, 1, P.red], [1, 1, 1, P.red]);
  return layer(v, [0, -3, 0]);
}

/** Ice-blue freckles on both cheeks and the nose, with one flake on the brow. */
export function snowFreckles(): GenModel {
  const v: Voxel[] = [];
  v.push([-1, 1, 0, P.snow], [1, 1, 0, P.snow], [0, 1, 0, P.ice], [-1, 2, 0, P.ice], [1, 2, 0, P.snow], [0, 3, 0, P.ice]);
  return layer(v, [0, 6, 2]);
}

/** A high crown of aurora bands. */
export function auroraCrown(): GenModel {
  const v: Voxel[] = [];
  for (let x = -2; x <= 2; x++) v.push([x, 0, -1, V.blueNight], [x, 0, 1, V.blueNight]);
  for (const x of [-2, 2]) v.push([x, 1, 0, P.bulbBlue], [x, 2, 0, P.pineLight]);
  v.push([-1, 1, 0, P.pineLight], [0, 2, 0, P.gold], [1, 1, 0, P.bulbGreen], [0, 3, 0, P.bulbBlue], [-1, 3, 0, P.pineLight], [1, 3, 0, P.bulbGreen]);
  return layer(v, [0, 9, 0], [P.gold, P.bulbBlue, P.pineLight, P.bulbGreen]);
}

/** A jagged ice crown with two hanging icicles. */
export function frostCrown(): GenModel {
  const v: Voxel[] = [];
  for (let x = -2; x <= 2; x++) v.push([x, 0, -1, P.ice], [x, 0, 1, P.snow]);
  v.push([-2, 1, 0, P.ice], [-1, 2, 0, P.snow], [0, 3, 0, P.ice], [1, 2, 0, P.snow], [2, 1, 0, P.ice]);
  v.push([-2, -1, 0, P.ice], [2, -1, 0, P.ice], [0, 1, -1, V.blueNight], [0, 1, 1, V.blueNight]);
  return layer(v, [0, 9, 0], [P.ice, P.snow]);
}

/** A crown of dawn rays around a small golden disc. */
export function dawnCrown(): GenModel {
  const v: Voxel[] = [];
  for (let x = -2; x <= 2; x++) v.push([x, 0, -1, V.mustard], [x, 0, 1, V.mustard]);
  for (const x of [-2, -1, 0, 1, 2]) v.push([x, 1, 0, P.gold]);
  v.push([-2, 2, 0, P.cream], [-1, 2, 0, P.gold], [0, 3, 0, P.cream], [1, 2, 0, P.gold], [2, 2, 0, P.cream], [0, 2, 0, P.red]);
  return layer(v, [0, 9, 0], [P.gold, P.cream, V.mustard]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "helmet-star", target: "body", layer: starCrown() },
  { id: "hand-left-fair", target: "armLeft", layer: fairBasket() },
  { id: "face-snow-freckles", target: "body", layer: snowFreckles() },
  { id: "helmet-aurora", target: "body", layer: auroraCrown() },
  { id: "helmet-frost", target: "body", layer: frostCrown() },
  { id: "helmet-dawn", target: "body", layer: dawnCrown() },
];
