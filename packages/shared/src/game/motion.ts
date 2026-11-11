/**
 * Avatar locomotion (pure, deterministic, fixed time step). Simulation only: no three.js, no React, no
 * clock. The same inputs and step produce the same trajectory on every device, which keeps it testable
 * and ready for server-side validation or client prediction if real-time multiplayer ever exists.
 *
 * Feel: velocity eases toward the wished velocity (quick start, slightly quicker stop), click/tap
 * targets slow down on arrival instead of snapping, heading turns along the shortest arc, and circle
 * colliders push the avatar out while keeping the tangential velocity (sliding along obstacles).
 */
import { clampToWorld } from "./world";

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
  radius: 0.45,
  /** Distance between footsteps. */
  stride: 0.75,
  /** A target is dropped after this long without real progress (walking into a wall). */
  stuckTime: 0.5,
} as const;

export interface Collider {
  x: number;
  z: number;
  r: number;
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
  /** Click/tap destination, used when there is no directional input. */
  target: { x: number; z: number } | null;
}

export interface StepResult {
  /** A footstep happened this step (position = body position). */
  step: boolean;
  /** The target was reached or abandoned: the caller should clear it. */
  targetDone: boolean;
}

export const createBody = (x: number, z: number, yaw = Math.PI): Body => ({
  x, z, vx: 0, vz: 0, yaw, strideAcc: 0, leftFoot: false, stuck: 0,
});

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Wished velocity from the intent (arrival slow-down for targets). */
export function wishedVelocity(b: Body, intent: Intent): [number, number, boolean] {
  const len = Math.hypot(intent.moveX, intent.moveZ);
  if (len > 0) return [(intent.moveX / len) * MOTION.maxSpeed, (intent.moveZ / len) * MOTION.maxSpeed, false];
  if (!intent.target) return [0, 0, false];
  const dx = intent.target.x - b.x, dz = intent.target.z - b.z;
  const dist = Math.hypot(dx, dz);
  if (dist < MOTION.arriveEpsilon) return [0, 0, true];
  const speed = MOTION.maxSpeed * Math.min(1, dist / MOTION.arriveRadius);
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
  for (const c of colliders) {
    const dx = x - c.x, dz = z - c.z;
    const min = c.r + MOTION.radius;
    const d2 = dx * dx + dz * dz;
    if (d2 >= min * min) continue;
    const d = Math.sqrt(d2) || 1e-6;
    const nx = d2 === 0 ? 1 : dx / d, nz = d2 === 0 ? 0 : dz / d;
    x = c.x + nx * min;
    z = c.z + nz * min;
    // Slide: drop only the velocity component pointing into the obstacle.
    const into = b.vx * nx + b.vz * nz;
    if (into < 0) {
      b.vx -= into * nx;
      b.vz -= into * nz;
    }
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
  return { step, targetDone };
}
