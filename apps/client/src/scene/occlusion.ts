/**
 * What stands between the camera and a point of the scene (pure: no three.js). IMPL-0024.
 *
 * The camera looks north from above, so a building south of the avatar can hide it. The see-through outline
 * of the avatar and the "look at the sky" camera both need to know when: here a tall thing of the scene (a
 * chalet, a shop, the tree, a pine) is an `Occluder`, the column map of its voxel model placed in the world,
 * and a straight segment is tested against it by walking the segment in steps of half a voxel. A column is
 * solid from its lowest voxel to its highest one, so the open air under an eave or under the boughs of a
 * pine hides nothing, while a roof does.
 *
 * Cheap on purpose: a segment only walks the part of it that is over an occluder's footprint and below its
 * top, and the callers ask again only when the avatar or the camera has moved.
 */

/** A voxel as the models store it: `[x, y, z, …]`, centred on `(x, z)` and standing on `y`. */
type VoxelLike = readonly [number, number, number, ...unknown[]];

/** Column map of a voxel model, in the model's own frame. Shared by every copy of the model. */
export interface Columns {
  /** Voxel edge in world units. */
  size: number;
  /** Lowest column index on each axis and the number of columns. */
  x0: number;
  z0: number;
  nx: number;
  nz: number;
  /** Bottom and top of each column in world units (`tops[i] === 0`: nothing stands there). */
  bottoms: Float32Array;
  tops: Float32Array;
  /** Highest top, and the farthest a column reaches from the model's axis (world units). */
  height: number;
  reach: number;
}

/** A model standing in the world: its columns, where it stands and how it is turned (three.js `rotation.y`). */
export interface Occluder extends Columns {
  x: number;
  z: number;
  cos: number;
  sin: number;
}

/** Builds the column map of a voxel model drawn with voxels of `size`. */
export function columnsOf(voxels: readonly VoxelLike[], size: number): Columns {
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const [x, , z] of voxels) {
    x0 = Math.min(x0, Math.round(x));
    x1 = Math.max(x1, Math.round(x));
    z0 = Math.min(z0, Math.round(z));
    z1 = Math.max(z1, Math.round(z));
  }
  if (x0 > x1) return { size, x0: 0, z0: 0, nx: 0, nz: 0, bottoms: new Float32Array(0), tops: new Float32Array(0), height: 0, reach: 0 };
  const nx = x1 - x0 + 1, nz = z1 - z0 + 1;
  const bottoms = new Float32Array(nx * nz).fill(Infinity), tops = new Float32Array(nx * nz);
  let height = 0, reach = 0;
  for (const [x, y, z] of voxels) {
    const i = (Math.round(z) - z0) * nx + (Math.round(x) - x0);
    bottoms[i] = Math.min(bottoms[i], y * size);
    tops[i] = Math.max(tops[i], (y + 1) * size);
    height = Math.max(height, tops[i]);
    reach = Math.max(reach, Math.hypot(Math.abs(x) + 0.5, Math.abs(z) + 0.5) * size);
  }
  return { size, x0, z0, nx, nz, bottoms, tops, height, reach };
}

/** A copy of a model at `(x, z)`, turned by `rot` around the vertical. */
export function occluderAt(columns: Columns, at: { x: number; z: number; rot?: number }): Occluder {
  return { ...columns, x: at.x, z: at.z, cos: Math.cos(at.rot ?? 0), sin: Math.sin(at.rot ?? 0) };
}

/**
 * True when the straight segment from `a` to `b` passes through a column of the occluder. Allocation-free.
 * The ends themselves count: a point inside a column is hidden by it.
 */
export function blocksSegment(o: Occluder, ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  if (o.nx === 0 || (ay >= o.height && by >= o.height)) return false;
  const dx = bx - ax, dy = by - ay, dz = bz - az;
  // The stretch of the segment over the occluder's footprint (a circle of `reach` around its axis)…
  const fx = ax - o.x, fz = az - o.z;
  const qa = dx * dx + dz * dz, qb = 2 * (fx * dx + fz * dz), qc = fx * fx + fz * fz - o.reach * o.reach;
  let t0 = 0, t1 = 1;
  if (qa < 1e-12) {
    if (qc > 0) return false;
  } else {
    const disc = qb * qb - 4 * qa * qc;
    if (disc < 0) return false;
    const root = Math.sqrt(disc);
    t0 = Math.max(t0, (-qb - root) / (2 * qa));
    t1 = Math.min(t1, (-qb + root) / (2 * qa));
  }
  // …and below its top.
  if (dy !== 0) {
    const top = (o.height - ay) / dy;
    if (dy < 0) t0 = Math.max(t0, top);
    else t1 = Math.min(t1, top);
  }
  if (t0 > t1) return false;
  const length = Math.sqrt(qa + dy * dy) * (t1 - t0);
  const steps = Math.max(1, Math.ceil(length / (o.size * 0.5)));
  for (let k = 0; k <= steps; k++) {
    const t = t0 + ((t1 - t0) * k) / steps;
    const px = ax + dx * t - o.x, pz = az + dz * t - o.z;
    // World → model (the inverse of three.js `rotation.y`).
    const ix = Math.round((px * o.cos - pz * o.sin) / o.size) - o.x0;
    const iz = Math.round((px * o.sin + pz * o.cos) / o.size) - o.z0;
    if (ix < 0 || iz < 0 || ix >= o.nx || iz >= o.nz) continue;
    const i = iz * o.nx + ix, y = ay + dy * t;
    if (y < o.tops[i] && y >= o.bottoms[i]) return true;
  }
  return false;
}

/** True when any of the occluders stands on the segment from `a` to `b`. */
export function segmentBlocked(occluders: readonly Occluder[], ax: number, ay: number, az: number, bx: number, by: number, bz: number): boolean {
  // An occluder farther from both ends than the segment is long, plus its reach, cannot be on it.
  const span = Math.hypot(bx - ax, bz - az);
  for (let i = 0; i < occluders.length; i++) {
    const o = occluders[i];
    if (Math.hypot(o.x - bx, o.z - bz) > span + o.reach) continue;
    if (blocksSegment(o, ax, ay, az, bx, by, bz)) return true;
  }
  return false;
}

/**
 * Heights (world units) of the two points of the avatar the outline cares about: the chest (the torso spans
 * 0.9 to 1.8 u) and the head (1.8 to 2.7 u), both taken low, where a roof edge reaches them first. They are the
 * heights the review of this rule measured with rays in the real scene, so the test cases compare like for like.
 */
export const AVATAR_CHEST = 1.1;
export const AVATAR_HEAD = 1.95;

/**
 * True when the camera at `(cx, cy, cz)` cannot see the chest or the head of an avatar standing at `(x, z)`:
 * the see-through outline is drawn then, and only then. An avatar whose feet alone are behind something, or
 * that merely walks near a building, is in plain view.
 */
export function avatarHidden(occluders: readonly Occluder[], cx: number, cy: number, cz: number, x: number, z: number): boolean {
  return segmentBlocked(occluders, cx, cy, cz, x, AVATAR_CHEST, z) || segmentBlocked(occluders, cx, cy, cz, x, AVATAR_HEAD, z);
}

/** An offset from the point the camera follows (the avatar, 1 u above the ground). */
export interface Offset {
  x: number;
  y: number;
  z: number;
}

/**
 * Where in its picture the "look at the sky" camera must see no building: offsets from the point it aims at
 * (50 u away), from the middle of the view out to its side edges (30° on a wide screen) and down to its lower
 * edge. The camera looks up, so whatever blocks it is beside or below the middle of the view.
 */
const SKY_RAYS: ReadonlyArray<readonly [dx: number, dy: number]> = [
  [0, 0], [-12, 0], [12, 0], [-27, 0], [27, 0], [-27, 10], [27, 10],
  [0, -8], [0, -18], [-12, -18], [12, -18], [-27, -18], [27, -18],
];

/**
 * The "look at the sky" camera sits low behind (south of) the avatar and looks up over the village. On a
 * residential street a chalet stands right there: the camera would be inside it or would look at its back
 * wall. This picks the first candidate offset whose camera is clear: not inside a column and with nothing
 * within `reach` along its view. The candidates rise (and the last ones come closer), so in the open the first
 * one, the usual low view, is kept, and next to a row the camera goes up over the roofs. When none is clear
 * the last, highest one is used.
 */
export function clearSkyOffset(occluders: readonly Occluder[], x: number, z: number, candidates: readonly Offset[], look: Offset, reach = 20): Offset {
  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const cx = x + c.x, cy = 1 + c.y, cz = z + c.z;
    let clear = true;
    for (let r = 0; r < SKY_RAYS.length && clear; r++) {
      const vx = x + look.x + SKY_RAYS[r][0] - cx, vy = 1 + look.y + SKY_RAYS[r][1] - cy, vz = z + look.z - cz;
      const k = reach / Math.hypot(vx, vy, vz);
      clear = !segmentBlocked(occluders, cx, cy, cz, cx + vx * k, cy + vy * k, cz + vz * k);
    }
    if (clear) return c;
  }
  return candidates[candidates.length - 1];
}
