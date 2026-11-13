/**
 * Which big static blocks of the village can cast a shadow that is seen this frame (pure: no three.js).
 *
 * The key light's shadow map covers a box around the avatar (`Lighting`). The renderer decides what goes into
 * it with one bounding sphere per mesh, and a merged block (a row of chalets, a sector of the forest) is long
 * and thin: its sphere reaches the box when none of its chalets or pines does. With the larger village
 * (IMPL-0023) about half of the triangles of a frame were such blocks, drawn into the shadow map for nothing.
 * Here a block is a caster only while one of its parts (a sphere around one chalet, one pine)
 *
 * 1. reaches the box (`reachesShadowBox`): a part outside it cannot write a texel of the shadow map; and
 * 2. has a shadow that reaches what the camera sees (`shadowReachesView`): the shadow of a part is the part
 *    swept away from the light down to the ground, and a pixel can only be darkened by a part whose sweep it
 *    lies in.
 *
 * Both tests only ever keep more than needed, so the picture is the same.
 */

/** Sphere around one part of a merged block (world units). */
export interface CasterPart {
  x: number;
  y: number;
  z: number;
  r: number;
}

/** The orthographic box the key light draws its shadow map from. `Lighting` sets up the same camera. */
export const SHADOW_BOX = {
  /** Half the width and half the height of the box, across the light. */
  extent: 30,
  /** From the light to what it looks at (the avatar's feet). */
  distance: 60,
  /** Depth range, from the light. */
  near: 1,
  far: 140,
} as const;

/**
 * The box of this frame, written by `Lighting` when it moves the light: where the light looks at, the unit
 * vector from there to the light, and whether the preset draws shadows at all. A plain mutable object read by
 * the frame loop, like `sim` and `perf`.
 */
export const keyShadow = { on: false, x: 0, z: 0, dx: 0, dy: 1, dz: 0 };
export type KeyShadow = typeof keyShadow;

/**
 * Slack added to every part. The tests run with the light and the camera of the very frame being drawn
 * (`ShadowCulling`), so this only has to cover what the spheres do not: the sway of the foliage (under 0.5 u)
 * and the soft edge of a shadow (a few texels of 0.06 u). The rest is margin.
 */
export const CASTER_SLACK = 1.5;

/**
 * True when the sphere reaches the shadow box. The box's axes are those of the light's camera, which looks
 * down the light with the world's up: `right = up × d`, `top = d × right`. Straight overhead the camera has
 * no stable right, so the test falls back to the circle around the square (it only ever keeps more).
 */
export function reachesShadowBox(light: KeyShadow, part: CasterPart, slack = CASTER_SLACK): boolean {
  const { extent, distance, near, far } = SHADOW_BOX;
  const r = part.r + slack;
  const vx = part.x - light.x, vy = part.y, vz = part.z - light.z;
  const along = vx * light.dx + vy * light.dy + vz * light.dz;
  const depth = distance - along;
  if (depth < near - r || depth > far + r) return false;
  const flat = Math.hypot(light.dx, light.dz);
  if (flat < 1e-3) return Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along)) <= extent * Math.SQRT2 + r;
  // right = (0, 1, 0) × d = (dz, 0, -dx), normalised; top = d × right.
  const rx = light.dz / flat, rz = -light.dx / flat;
  if (Math.abs(vx * rx + vz * rz) > extent + r) return false;
  const tx = light.dy * rz, ty = light.dz * rx - light.dx * rz, tz = -light.dy * rx;
  return Math.abs(vx * tx + vy * ty + vz * tz) <= extent + r;
}

/** The six planes of a view frustum, four numbers each: `nx, ny, nz, d`, with `n·p + d ≥ 0` inside. */
export type ViewPlanes = Float64Array;

/**
 * Planes of a camera from its view-projection matrix (`projectionMatrix × matrixWorldInverse`, column-major as
 * three.js stores it; clip-space depth from -1 to 1, as WebGL has it). Written into `out` (24 numbers).
 */
export function viewPlanes(viewProjection: ArrayLike<number>, out: ViewPlanes = new Float64Array(24)): ViewPlanes {
  const m = viewProjection;
  for (let p = 0; p < 6; p++) {
    // Rows 0..2 of the matrix (x, y, z of clip space) taken from, then added to, the last row.
    const row = p >> 1, sign = p & 1 ? 1 : -1;
    const x = m[3] + sign * m[row], y = m[7] + sign * m[4 + row], z = m[11] + sign * m[8 + row], d = m[15] + sign * m[12 + row];
    const n = Math.hypot(x, y, z) || 1;
    out.set([x / n, y / n, z / n, d / n], p * 4);
  }
  return out;
}

const sphereInView = (planes: ViewPlanes, x: number, y: number, z: number, r: number): boolean => {
  for (let p = 0; p < 24; p += 4) if (planes[p] * x + planes[p + 1] * y + planes[p + 2] * z + planes[p + 3] < -r) return false;
  return true;
};

/**
 * True when the shadow of the part can fall on something the camera sees. The shadow is the sphere swept away
 * from the light until it is under the ground (nothing that takes a shadow lies below y = 0) or past the far
 * side of the shadow box; the sweep is covered with spheres no farther apart than the radius, each tested
 * against the six planes of the view.
 */
export function shadowReachesView(light: KeyShadow, view: ViewPlanes, part: CasterPart, slack = CASTER_SLACK): boolean {
  const r = part.r + slack;
  const along = (part.x - light.x) * light.dx + part.y * light.dy + (part.z - light.z) * light.dz;
  const toGround = (part.y + r) / Math.max(light.dy, 1e-3);
  const toFar = along + SHADOW_BOX.far - SHADOW_BOX.distance + r;
  const reach = Math.max(0, Math.min(toGround, toFar));
  const steps = Math.max(1, Math.ceil(reach / r));
  const step = reach / steps;
  const cover = Math.hypot(r, step / 2);
  for (let i = 0; i <= steps; i++) {
    const t = i * step;
    if (sphereInView(view, part.x - light.dx * t, part.y - light.dy * t, part.z - light.dz * t, cover)) return true;
  }
  return false;
}

/**
 * True when the preset draws shadows and at least one part of the block reaches the shadow box with a shadow
 * the camera can see.
 */
export function castsShadow(light: KeyShadow, view: ViewPlanes, parts: readonly CasterPart[], slack = CASTER_SLACK): boolean {
  if (!light.on) return false;
  for (let i = 0; i < parts.length; i++) if (reachesShadowBox(light, parts[i], slack) && shadowReachesView(light, view, parts[i], slack)) return true;
  return false;
}

/**
 * Sphere around a voxel model standing at `(x, z)`, whatever its turn around the vertical: `reach` is the
 * farthest a voxel gets from the model's axis and `height` its top, both in world units.
 */
export function partAt(x: number, z: number, reach: number, height: number): CasterPart {
  return { x, y: height / 2, z, r: Math.hypot(reach, height / 2) };
}

/** `reach` and `height` (see `partAt`) of a voxel model drawn with voxels of `size`. */
export function modelExtent(voxels: ReadonlyArray<readonly [number, number, number, ...unknown[]]>, size: number): { reach: number; height: number } {
  let reach = 0, top = 0;
  for (const [x, y, z] of voxels) {
    // A voxel is centred on (x, z) and stands on y: its far corner is half a voxel out and one voxel up.
    reach = Math.max(reach, Math.hypot(Math.abs(x) + 0.5, Math.abs(z) + 0.5));
    top = Math.max(top, y + 1);
  }
  return { reach: reach * size, height: top * size };
}
