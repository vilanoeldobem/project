/**
 * Live simulation state read every frame by presentation systems (camera, light, snow, footprints).
 * Plain mutable objects, deliberately outside zustand: writing to a store every frame would re-run every
 * UI selector 60 times per second. React UI keeps using the store for discrete state only.
 */
import { createBody } from "@vila/shared/game/motion";
import { createNavField, createRoute, type NavField, planRoute } from "@vila/shared/game/navigation";
import { OBSTACLES, SPAWN } from "@vila/shared/game/world";

export const sim = {
  /** Authoritative fixed-step body (see `motion.ts`). */
  body: createBody(SPAWN.x, SPAWN.z),
  /** Render pose, interpolated between the last two fixed steps. */
  pose: { x: SPAWN.x as number, z: SPAWN.z as number, yaw: Math.PI, speed: 0 },
  /** Navigation field of the colliders in the scene (`Player` keeps it current; IMPL-0016). */
  nav: null as NavField | null,
  /** The walk in progress: planned once per click, read by the fixed-step loop. */
  route: createRoute(),
  /**
   * What the camera is doing, written by `Player` for whoever needs to know (the dev hooks of the verify
   * scripts): whether the avatar is drawn see-through because something hides it, and how high the "look at the
   * sky" camera sits over the avatar (0 while that view is off).
   */
  view: { seeThrough: false, skyHeight: 0 },
};

/**
 * The walk the fixed-step loop follows this frame (`Player`): the planned route, or none while a panel is open
 * (the route is kept and the walk goes on when the panel closes). Only a panel holds the walk: the game menu
 * (IMPL-0022) is not one, so the avatar, the other visitors and the environment go on behind it.
 */
export const walkRoute = (state: { panel: { kind: string } }) => (state.panel.kind === "none" ? sim.route : null);

/**
 * Plans the walk from where the avatar stands to `(x, z)` and returns where it will actually end: the
 * point itself, or the nearest walkable spot when the click landed on an obstacle or outside the world.
 */
export function planWalk(x: number, z: number): { x: number; z: number } {
  const { body, route } = sim;
  // Before the scene mounts (it is lazy-loaded) the static scenery is all there is to walk around.
  planRoute((sim.nav ??= createNavField(OBSTACLES)), route, body.x, body.z, x, z);
  return { x: route.x, z: route.z };
}
