/**
 * Avatar colliders (pure, IMPL-0016): one shape, a rounded rectangle on the ground plane. A circle is the
 * rectangle with no core (`hx`/`hz` absent), a capsule has a core segment, a box has `r: 0`. Every solid
 * thing in the village is one or a few of these, and the same distance function feeds the physical
 * push-out (`motion.ts`) and the navigation grid (`navigation.ts`), so the two can never disagree.
 */

/** Radius of the avatar's body circle (world units). */
export const AVATAR_RADIUS = 0.45;

export interface Collider {
  x: number;
  z: number;
  /** Radius around the core: the whole shape for a circle, the corner rounding for a box. */
  r: number;
  /** Half extents of the core rectangle along its own axes (absent = a point, i.e. a circle). */
  hx?: number;
  hz?: number;
  /** Unit direction of the core's x axis in world space (absent = world +x). */
  ux?: number;
  uz?: number;
}

/** Where a drawn model stands: position and rotation around Y (rad), as passed to three.js. */
export interface Placed {
  x: number;
  z: number;
  rot?: number;
}

/**
 * Collider covering the model-local rectangle `[x0, x1] × [z0, z1]` (world units, outer bounds) of a
 * model placed at `at`, with corners rounded by `r`. Local axes follow three.js `rotation.y`: local +x is
 * `(cos rot, -sin rot)` and local +z is `(sin rot, cos rot)` in world space.
 */
export function footprint(at: Placed, x0: number, x1: number, z0: number, z1: number, r = 0): Collider {
  const rot = at.rot ?? 0;
  const ux = Math.cos(rot), uz = -Math.sin(rot);
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const x = at.x + cx * ux - cz * uz, z = at.z + cx * uz + cz * ux;
  const hx = Math.max(0, (x1 - x0) / 2 - r), hz = Math.max(0, (z1 - z0) / 2 - r);
  if (hx < 1e-9 && hz < 1e-9) return { x, z, r };
  return { x, z, r, hx, hz, ux, uz };
}

/** Signed distance from a point to the collider's surface (negative inside). */
export function distanceTo(c: Collider, x: number, z: number): number {
  const dx = x - c.x, dz = z - c.z;
  if (c.hx === undefined) return Math.sqrt(dx * dx + dz * dz) - c.r;
  const ux = c.ux ?? 1, uz = c.uz ?? 0;
  const lx = Math.abs(dx * ux + dz * uz) - c.hx;
  const lz = Math.abs(dz * ux - dx * uz) - (c.hz ?? 0);
  const ox = lx > 0 ? lx : 0, oz = lz > 0 ? lz : 0;
  return Math.sqrt(ox * ox + oz * oz) + Math.min(lx > lz ? lx : lz, 0) - c.r;
}

/** Radius of the circle around `(c.x, c.z)` that contains the whole collider. */
export const boundingRadius = (c: Collider): number => c.r + (c.hx === undefined ? 0 : Math.hypot(c.hx, c.hz ?? 0));

/**
 * Free room around an avatar centred on the point: distance from its body circle to the nearest collider
 * (negative = overlapping). Linear in the number of colliders; not for per-cell loops.
 */
export function clearance(colliders: readonly Collider[], x: number, z: number): number {
  let min = Infinity;
  for (let i = 0; i < colliders.length; i++) {
    const d = distanceTo(colliders[i], x, z);
    if (d < min) min = d;
  }
  return min - AVATAR_RADIUS;
}
