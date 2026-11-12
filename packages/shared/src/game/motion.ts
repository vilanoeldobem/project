/**
 * Avatar locomotion (pure, deterministic, fixed time step). Simulation only: no three.js, no React, no
 * clock. The same inputs and step produce the same trajectory on every device, which keeps it testable
 * and ready for server-side validation or client prediction if real-time multiplayer ever exists.
 *
 * Feel: velocity eases toward the wished velocity (quick start, slightly quicker stop), click/tap
 * targets slow down on arrival instead of snapping, heading turns along the shortest arc, and colliders
 * (rounded rectangles, see `collision.ts`) push the avatar out while keeping the tangential velocity
 * (sliding along obstacles). Where to walk is decided by `navigation.ts`; this module only moves the body.
 */
import { AVATAR_RADIUS, clearance, type Collider } from "./collision";
import { clampToWorld } from "./world";

export type { Collider } from "./collision";

export const STEP = 1 / 60;

export const MOTION = {
  maxSpeed: 8.5,
  /** Exponential response (1/s) when speeding up and when braking. */
  accel: 11,
  brake: 16,
  /** Distance over which a click/tap target slows the avatar down. */
  arriveRadius: 1.6,
  /** Close enough to a target to stop. */
  arriveEpsilon: 0.15,
  turnRate: 14,
  radius: AVATAR_RADIUS,
  /** Distance between footsteps. */
  stride: 0.75,
  /** A target is dropped after this long without real progress (walking into a wall). Last resort. */
  stuckTime: 0.5,
} as const;

/** Push-out passes per step: enough to settle in the corner between two colliders. */
const PASSES = 3;
/** Overlap left after the passes that means "squeezed": the gap ahead is narrower than the body. */
const SQUEEZED = 0.01;

/** Where the body is steered: a destination, or a waypoint on the way to one. */
export interface Target {
  x: number;
  z: number;
  /** Path length still to walk after this point (0 or absent = the final destination). */
  rest?: number;
}

export interface Body {
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  /** Distance walked since the last footstep. */
  strideAcc: number;
  /** Alternates every step (false = right foot). */
  leftFoot: boolean;
  stuck: number;
}

export interface Intent {
  /** Raw directional input (keys/stick), any length; zero when idle. */
  moveX: number;
  moveZ: number;
  /** Click/tap destination or route waypoint, used when there is no directional input. */
  target: Target | null;
}

export interface StepResult {
  /** A footstep happened this step (position = body position). */
  step: boolean;
  /** The target was reached or abandoned: the caller should clear it. */
  targetDone: boolean;
  /** The final destination was reached (`targetDone` without it = gave up after `stuckTime`). */
  arrived: boolean;
}

export const createBody = (x: number, z: number, yaw = Math.PI): Body => ({
  x, z, vx: 0, vz: 0, yaw, strideAcc: 0, leftFoot: false, stuck: 0,
});

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Wished velocity from the intent. The slow-down counts the whole remaining path (`rest`), so the avatar
 * keeps its pace through waypoints and eases only into the final destination.
 */
export function wishedVelocity(b: Body, intent: Intent): [number, number, boolean] {
  const len = Math.hypot(intent.moveX, intent.moveZ);
  if (len > 0) return [(intent.moveX / len) * MOTION.maxSpeed, (intent.moveZ / len) * MOTION.maxSpeed, false];
  if (!intent.target) return [0, 0, false];
  const rest = intent.target.rest ?? 0;
  const dx = intent.target.x - b.x, dz = intent.target.z - b.z;
  const dist = Math.hypot(dx, dz);
  if (rest <= 0 && dist < MOTION.arriveEpsilon) return [0, 0, true];
  if (dist < 1e-9) return [0, 0, false];
  const speed = MOTION.maxSpeed * Math.min(1, (dist + rest) / MOTION.arriveRadius);
  return [(dx / dist) * speed, (dz / dist) * speed, false];
}

/** Advances the body by one fixed step. Mutates `b`. */
export function stepBody(b: Body, intent: Intent, colliders: readonly Collider[], dt = STEP): StepResult {
  const [wx, wz, arrived] = wishedVelocity(b, intent);
  const speeding = wx * wx + wz * wz > b.vx * b.vx + b.vz * b.vz;
  const k = 1 - Math.exp(-(speeding ? MOTION.accel : MOTION.brake) * dt);
  b.vx += (wx - b.vx) * k;
  b.vz += (wz - b.vz) * k;
  if (Math.abs(b.vx) < 1e-3 && Math.abs(b.vz) < 1e-3 && wx === 0 && wz === 0) b.vx = b.vz = 0;

  const px = b.x, pz = b.z;
  let x = b.x + b.vx * dt, z = b.z + b.vz * dt;
  let hit = false;
  for (let pass = 0; pass < PASSES; pass++) {
    hit = false;
    for (let i = 0; i < colliders.length; i++) {
      const c = colliders[i];
      const dx = x - c.x, dz = z - c.z;
      const min = c.r + MOTION.radius;
      let nx: number, nz: number;
      if (c.hx === undefined) {
        const d2 = dx * dx + dz * dz;
        if (d2 >= min * min) continue;
        const d = Math.sqrt(d2) || 1e-6;
        nx = d2 === 0 ? 1 : dx / d;
        nz = d2 === 0 ? 0 : dz / d;
        x = c.x + nx * min;
        z = c.z + nz * min;
      } else {
        // Rounded rectangle: work in the core's own axes, push away from the closest core point.
        const ux = c.ux ?? 1, uz = c.uz ?? 0, hx = c.hx, hz = c.hz ?? 0;
        const lx = dx * ux + dz * uz, lz = dz * ux - dx * uz;
        const ex = lx - (lx < -hx ? -hx : lx > hx ? hx : lx), ez = lz - (lz < -hz ? -hz : lz > hz ? hz : lz);
        const d2 = ex * ex + ez * ez;
        if (d2 >= min * min) continue;
        let ax: number, az: number, px: number, pz: number;
        if (d2 > 1e-18) {
          const d = Math.sqrt(d2);
          ax = ex / d;
          az = ez / d;
          px = lx - ex + ax * min;
          pz = lz - ez + az * min;
        } else if (hx - Math.abs(lx) < hz - Math.abs(lz)) {
          // Centre inside the core (never by walking): leave through the nearest face.
          ax = lx < 0 ? -1 : 1;
          az = 0;
          px = ax * (hx + min);
          pz = lz;
        } else {
          ax = 0;
          az = lz < 0 ? -1 : 1;
          px = lx;
          pz = az * (hz + min);
        }
        nx = ax * ux - az * uz;
        nz = ax * uz + az * ux;
        x = c.x + px * ux - pz * uz;
        z = c.z + px * uz + pz * ux;
      }
      // Slide: drop only the velocity component pointing into the obstacle.
      const into = b.vx * nx + b.vz * nz;
      if (into < 0) {
        b.vx -= into * nx;
        b.vz -= into * nz;
      }
      hit = true;
    }
    if (!hit) break;
  }
  // Still overlapping after every pass: two colliders are closer than the body is wide, and each pushes it
  // into the other. Stay put instead of being squeezed through (unless the body started out overlapping,
  // e.g. scenery appeared on top of it: then any way out is fine).
  if (hit && clearance(colliders, x, z) < -SQUEEZED && clearance(colliders, px, pz) >= -SQUEEZED) {
    x = px;
    z = pz;
    b.vx = b.vz = 0;
  }
  [x, z] = clampToWorld(x, z);
  b.x = x;
  b.z = z;

  const moved = Math.hypot(b.x - px, b.z - pz);
  const speed = Math.hypot(b.vx, b.vz);
  if (speed > 0.3) b.yaw += wrapAngle(Math.atan2(b.vx, b.vz) - b.yaw) * (1 - Math.exp(-MOTION.turnRate * dt));

  let step = false;
  b.strideAcc += moved;
  if (b.strideAcc >= MOTION.stride) {
    b.strideAcc -= MOTION.stride;
    b.leftFoot = !b.leftFoot;
    step = true;
  }

  let targetDone = arrived;
  if (intent.target && !arrived && Math.hypot(intent.moveX, intent.moveZ) === 0) {
    const wished = Math.hypot(wx, wz) * dt;
    b.stuck = moved < wished * 0.25 && wished > 0.02 ? b.stuck + dt : 0;
    if (b.stuck >= MOTION.stuckTime) targetDone = true;
  } else b.stuck = 0;
  if (targetDone) b.stuck = 0;
  return { step, targetDone, arrived };
}
