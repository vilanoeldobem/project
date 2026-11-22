/** Book IX cosmetic layers: three free rewards and three paid catalogue hand pieces. */
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

/** A small wooden mallet with a stone head and a gold band, held in the right hand. */
export function handRightHammer(): GenModel {
  const v: Voxel[] = [];
  for (let y = -1; y <= 1; y++) v.push([0, y, 0, V.woodDark]);
  for (let x = -1; x <= 1; x++) {
    for (let z = -1; z <= 1; z++) {
      if (Math.abs(x) + Math.abs(z) <= 1) v.push([x, 2, z, P.stoneDark]);
    }
  }
  v.push([0, 2, 0, P.gold], [0, 1, 0, P.wood]);
  return layer(v, [0, 0, 0], [P.gold]);
}

/** Two round gold-rimmed glasses with ice lenses and a thin arm. */
export function faceOriginGlasses(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-2, -1, 1, 2]) for (const y of [0, 2]) v.push([x, y, 0, P.gold]);
  v.push([-2, 1, 0, P.gold], [2, 1, 0, P.gold]);
  v.push([-1, 1, 0, P.ice], [1, 1, 0, P.ice]);
  v.push([0, 1, 0, P.gold], [-3, 1, 0, P.gold], [3, 1, 0, P.gold]);
  return layer(v, [0, 6, 2], [P.ice]);
}

/** Dark archive boots with parchment cuffs and gold laces. */
export function shoesArchive(): GenModel {
  const v: Voxel[] = [];
  for (const x of [-1, 1]) {
    v.push([x, 0, 0, V.woodDark], [x, 0, 1, V.woodDark], [x, 1, 0, V.woodDark]);
    v.push([x, 2, 0, P.cream], [x, 2, 1, P.cream], [x, 3, 0, P.gold]);
  }
  v.push([0, 0, 1, P.cream]);
  return layer(v, [0, -3, 0], [P.gold]);
}

/** A green-blue aurora ribbon with a gold star, held in the right hand. */
export function handRightAurora(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -2, 1, V.skyBlue], [0, -1, 1, P.pineLight], [0, 0, 1, P.bulbBlue]);
  v.push([-1, -1, 1, P.pineLight], [1, -1, 1, V.skyBlue], [0, 1, 1, P.gold], [0, 2, 1, P.cream]);
  return layer(v, [0, 0, 0], [P.bulbBlue, P.gold]);
}

/** An ice crystal in a pale cross, held in the right hand. */
export function handRightFrost(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -2, 1, P.ice], [0, -1, 1, P.snow], [0, 0, 1, P.ice], [0, 1, 1, P.snow]);
  v.push([-1, 0, 1, P.ice], [1, 0, 1, P.ice], [-1, -1, 1, V.skyBlue], [1, -1, 1, V.skyBlue]);
  return layer(v, [0, 0, 0], [P.ice]);
}

/** A gold origin star with a cream centre and a short trail, held in the right hand. */
export function handRightOriginStar(): GenModel {
  const v: Voxel[] = [];
  v.push([0, -1, 1, P.gold], [-1, 0, 1, P.gold], [1, 0, 1, P.gold], [0, 1, 1, P.gold]);
  v.push([0, 0, 1, P.cream], [0, -2, 1, P.cream], [0, 2, 1, P.cream]);
  v.push([0, -3, 1, P.gold]);
  return layer(v, [0, 0, 0], [P.gold]);
}

export const MODELS: readonly CosmeticModel[] = [
  { id: "hand-right-hammer", target: "armRight", layer: handRightHammer() },
  { id: "face-origin-glasses", target: "body", layer: faceOriginGlasses() },
  { id: "shoes-archive", target: "body", layer: shoesArchive() },
  { id: "hand-right-aurora", target: "armRight", layer: handRightAurora() },
  { id: "hand-right-frost", target: "armRight", layer: handRightFrost() },
  { id: "hand-right-origin-star", target: "armRight", layer: handRightOriginStar() },
];
