/**
 * Live simulation state read every frame by presentation systems (camera, light, snow, footprints).
 * Plain mutable objects, deliberately outside zustand: writing to a store every frame would re-run every
 * UI selector 60 times per second. React UI keeps using the store for discrete state only.
 */
import { createBody } from "./motion";
import { SPAWN } from "./world";

export const sim = {
  /** Authoritative fixed-step body (see `motion.ts`). */
  body: createBody(SPAWN.x, SPAWN.z),
  /** Render pose, interpolated between the last two fixed steps. */
  pose: { x: SPAWN.x as number, z: SPAWN.z as number, yaw: Math.PI, speed: 0 },
};
