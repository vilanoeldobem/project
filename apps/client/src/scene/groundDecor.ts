/**
 * Ground detail (IMPL-0035, pure: no three.js): small voxel things scattered over the grass, the parks and the
 * snow, so the ground between the houses is not flat paint. Tufts of grass, flowers, pebbles and clumps of snow,
 * chosen cell by cell from an integer hash of the cell: the same ground for every visitor, nothing random.
 *
 * Only on unpaved ground (`YARD_KINDS`): never on a road, a path, the square or a pad. Nothing here is solid or
 * taller than a hand (`DETAIL_MAX_HEIGHT`): the avatar walks through it, so it needs no collider (IMPL-0016) and
 * never hides a road from the camera.
 */
import { type GroundKind, groundAt, PALETTE as P } from "@vila/shared/game/world";

import { V } from "./gen/palette";
import { YARD_KINDS } from "./groundRuns";
import type { Voxel } from "./models";

/** Edge of one voxel of ground detail (world units). */
export const DETAIL_VOXEL = 0.15;
/** The tallest detail, in world units. */
export const DETAIL_MAX_HEIGHT = 0.6;

export type DetailKind = "tuft" | "tuft-tall" | "flower-red" | "flower-gold" | "flower-rose" | "flower-white" | "pebbles" | "snow";

const tuft = (a: string, b: string): Voxel[] => [
  [0, 0, 0, a], [0, 1, 0, a], [1, 0, 0, b], [1, 1, 0, b], [1, 2, 0, b], [-1, 0, 1, a], [0, 0, -1, b], [0, 1, -1, b],
];
const flower = (petal: string): Voxel[] => [
  [0, 0, 0, P.leaf], [0, 1, 0, P.leaf], [0, 2, 0, P.leaf], [1, 0, 0, V.grassDark],
  [0, 3, 0, P.gold], [1, 3, 0, petal], [-1, 3, 0, petal], [0, 3, 1, petal], [0, 3, -1, petal],
];

/** The models, in voxels of `DETAIL_VOXEL`, standing on y = 0. */
export const DETAIL_MODELS: Record<DetailKind, Voxel[]> = {
  tuft: tuft(P.leaf, V.pineMoss),
  "tuft-tall": [...tuft(V.grassDark, P.leaf), [1, 3, 0, P.leaf], [0, 2, -1, V.grassDark]],
  "flower-red": flower(P.red),
  "flower-gold": flower(P.gold),
  "flower-rose": flower(V.rose),
  "flower-white": flower(P.cream),
  pebbles: [[0, 0, 0, P.stone], [1, 0, 0, P.stoneDark], [0, 0, 1, P.stoneDark], [-1, 0, 0, P.stone], [0, 1, 0, P.stone]],
  snow: [[0, 0, 0, P.snow], [1, 0, 0, P.snow], [0, 0, 1, P.snow], [1, 0, 1, P.snowShade], [-1, 0, 0, P.snowShade], [0, 1, 0, P.snow], [1, 1, 0, P.snow]],
};

export interface DetailPlacement {
  kind: DetailKind;
  x: number;
  z: number;
  rot: number;
}

/** An integer hash of a cell and a salt, in [0, 1). */
export function cellHash(x: number, z: number, salt: number): number {
  let h = Math.imul(x | 0, 73856093) ^ Math.imul(z | 0, 19349663) ^ Math.imul(salt | 0, 83492791);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 0x100000000;
}

const YARDS = new Set<GroundKind>(YARD_KINDS);
const FLOWERS: DetailKind[] = ["flower-red", "flower-gold", "flower-rose", "flower-white"];

/** What, if anything, grows on one ground cell. Snow ground gets clumps; the rest grass, flowers and pebbles. */
export function detailAt(x: number, z: number, kind: GroundKind = groundAt(x, z)): DetailKind | null {
  if (!YARDS.has(kind)) return null;
  const roll = cellHash(x, z, 1);
  if (kind === "snow") return roll < 0.06 ? "snow" : roll < 0.08 ? "pebbles" : null;
  const flowery = kind === "park" || kind === "yard-premium" || kind === "yard-lot";
  if (roll < (flowery ? 0.1 : 0.04)) return FLOWERS[Math.floor(cellHash(x, z, 2) * FLOWERS.length)];
  if (roll < 0.17) return cellHash(x, z, 3) < 0.35 ? "tuft-tall" : "tuft";
  if (roll < 0.19) return "pebbles";
  return null;
}

/** Every detail within `radius` of the middle, placed off the cell centre by a little, turned a quarter at a time. */
export function groundDetail(radius: number): DetailPlacement[] {
  const out: DetailPlacement[] = [];
  for (let z = -radius; z <= radius; z++)
    for (let x = -radius; x <= radius; x++) {
      if (Math.hypot(x, z) > radius) continue;
      const kind = detailAt(x, z);
      if (!kind) continue;
      // Off-centre by up to a quarter of a cell, on the detail grid so blades stay crisp.
      const dx = Math.round((cellHash(x, z, 4) - 0.5) * 4) * DETAIL_VOXEL;
      const dz = Math.round((cellHash(x, z, 5) - 0.5) * 4) * DETAIL_VOXEL;
      out.push({ kind, x: x + dx, z: z + dz, rot: Math.floor(cellHash(x, z, 6) * 4) * (Math.PI / 2) });
    }
  return out;
}
