/**
 * Which side and which ring of the village a point is on (IMPL-0024, IMPL-0031). Pure. The scene bakes what
 * stands on the rings into one block per ring and side, so the renderer culls them one by one.
 */
import { sideFrame, VILLAGE, VILLAGE_PLAN } from "@vila/shared/game/world";

/** Side of the village a point belongs to (the sides are the sectors between two avenues). */
export function sideOf(x: number, z: number): number {
  const n = VILLAGE_PLAN.sides;
  return ((Math.round((Math.atan2(z, x) * n) / (2 * Math.PI)) % n) + n) % n;
}

/** Id of the ring a point stands on or just behind (its back yard counts); the last ring beyond every one. */
export function ringOf(x: number, z: number): string {
  const f = sideFrame(VILLAGE_PLAN, sideOf(x, z));
  const apothem = x * f.nx + z * f.nz;
  const rings = VILLAGE.rings;
  for (let i = 1; i < rings.length; i++) if (apothem < (i + 1 < rings.length ? rings[i + 1].street![0] : Infinity)) return rings[i].id;
  return rings[rings.length - 1].id;
}

/** The block a point belongs to: `<ring>:<side>`. */
export const blockOf = (x: number, z: number): string => `${ringOf(x, z)}:${sideOf(x, z)}`;
