/**
 * Which visitor a click on the scene points at (PROPOSTA, IMPL-0021). Pure geometry, no three.js: the avatar is
 * taken for an upright capsule standing on its pose, and the click for the ray the scene already casts for
 * click-to-walk. Used only in moderation mode; everybody else's clicks never reach it.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Height of an avatar in world units (nine voxels of 0.3) and how far from its axis a click still counts. */
export const AVATAR_HEIGHT = 2.7;
export const PICK_RADIUS = 0.75;

/** Distance between the ray `origin + t·direction` (t ≥ 0) and the upright segment over `(x, z)`, and that `t`. */
function rayToAvatar(origin: Vec3, direction: Vec3, x: number, z: number): { distance: number; along: number } {
  // Closest points of two lines: the ray and the vertical axis of the avatar, the second clamped to the avatar.
  const wx = origin.x - x, wy = origin.y, wz = origin.z - z;
  const a = direction.x * direction.x + direction.y * direction.y + direction.z * direction.z;
  const b = direction.y;
  const d = direction.x * wx + direction.y * wy + direction.z * wz;
  const e = wy;
  const denominator = a - b * b;
  // A ray straight up or down runs along the axis: any height will do.
  let height = denominator > 1e-9 ? (a * e - b * d) / denominator : 0;
  height = Math.min(AVATAR_HEIGHT, Math.max(0, height));
  const along = Math.max(0, (b * height - d) / a);
  const px = origin.x + direction.x * along - x;
  const py = origin.y + direction.y * along - height;
  const pz = origin.z + direction.z * along - z;
  return { distance: Math.hypot(px, py, pz), along };
}

/** The id of the avatar the ray passes through (the nearest to the camera when several), or null. */
export function pickAvatar(origin: Vec3, direction: Vec3, avatars: Iterable<{ id: number; x: number; z: number }>): number | null {
  let best: number | null = null;
  let nearest = Infinity;
  for (const avatar of avatars) {
    const { distance, along } = rayToAvatar(origin, direction, avatar.x, avatar.z);
    if (distance <= PICK_RADIUS && along < nearest) {
      best = avatar.id;
      nearest = along;
    }
  }
  return best;
}
