/**
 * How the village's characters react to visitors (IMPL-0025, PROPOSTA): a local, visual-only layer over the
 * shared simulation. Pure and tested.
 *
 * Where a character **is** comes from `sampleLife` (`@vila/shared/game/life`) and is the same for every
 * visitor. What is computed here is seen by this visitor only: a small offset from that place, and a few poses.
 *
 * - **Giving way.** Characters are not obstacles: the avatar is never blocked by one and the navigation grid
 *   does not know them. A character steps aside when an avatar (this visitor's or another's) comes within its
 *   body: it is pushed out along the line between the two, by no more than `REACT.maxOffset`.
 * - **By kind**, towards this visitor's own avatar: a dog comes closer and wags, a cat and the rabbit keep their
 *   distance, a bird on the ground hops away, a reindeer lifts its head, a person who stands turns to look and
 *   waves once.
 * - **Bounded, and it decays.** The offset never exceeds `REACT.maxOffset` (it is clamped after every step) and
 *   eases back to nothing when the avatar leaves. It is never fed back into the simulation.
 */
import { AVATAR_RADIUS } from "@vila/shared/game/collision";
import { isPerson, type LifeKind } from "@vila/shared/game/life";

export const REACT = {
  /** The most a character is ever drawn away from its shared position (u). */
  maxOffset: 1,
  /** Room a character leaves between its body and an avatar's when it steps aside (u). */
  gap: 0.2,
  /** How fast the offset follows its target (1/s): quick out of the way, slow back. */
  rise: 9,
  fall: 2.5,
  /** A person or a reindeer notices the avatar within this distance (u). */
  notice: 4.5,
  /** A person waves when the avatar first comes this close, for this long. */
  wave: 3.2,
  waveSeconds: 1.4,
  /** A dog comes towards an avatar within this distance, and stops this far from it. */
  dogNotice: 5.5,
  dogStop: 0.4,
  /** A cat and the rabbit keep this far from the avatar; a bird on the ground hops away within this distance. */
  shy: 2.8,
  flutter: 3,
} as const;

export interface Reactions {
  ox: Float32Array;
  oz: Float32Array;
  /** 0..1: how much the character has turned to the avatar, and the heading that looks at it. */
  face: Float32Array;
  faceYaw: Float32Array;
  /** Seconds of waving left. */
  wave: Float32Array;
  /** 0..1: the avatar has its attention (a wagging tail, a lifted head, a hop). */
  alert: Float32Array;
  /** The avatar is within waving distance: a wave is given once per approach. */
  near: Uint8Array;
}

export const createReactions = (count: number): Reactions => ({
  ox: new Float32Array(count), oz: new Float32Array(count), face: new Float32Array(count), faceYaw: new Float32Array(count),
  wave: new Float32Array(count), alert: new Float32Array(count), near: new Uint8Array(count),
});

/** Lets go of a character that is no longer drawn: it comes back with no offset and no pose. */
export function forget(r: Reactions, i: number): void {
  r.ox[i] = r.oz[i] = r.face[i] = r.wave[i] = r.alert[i] = 0;
  r.near[i] = 0;
}

/**
 * One step of one character. `(sx, sz, sy)` is its shared position, read only. `vx`/`vz` are the avatars in the
 * village, this visitor's own first (`visitors` of them; 0 = nobody, e.g. before the scene has a pose). `calm`:
 * the visitor asked for less motion, so nothing waves, hops or wags; characters still give way.
 */
export function react(r: Reactions, i: number, kind: LifeKind, radius: number, sx: number, sz: number, sy: number, moving: boolean, vx: ArrayLike<number>, vz: ArrayLike<number>, visitors: number, dt: number, calm: boolean): void {
  let tx = 0, tz = 0, face = 0, alert = 0;
  // Perched birds and the owl are over every head: nobody is in their way.
  const ground = sy < 1;
  const need = radius + AVATAR_RADIUS + REACT.gap;
  if (ground) {
    for (let v = 0; v < visitors; v++) {
      const dx = sx - vx[v], dz = sz - vz[v];
      const d = Math.sqrt(dx * dx + dz * dz);
      if (d >= need) continue;
      // An avatar standing exactly on the spot: step off in a direction of the character's own.
      const ux = d > 1e-3 ? dx / d : Math.cos(i * 2.4), uz = d > 1e-3 ? dz / d : Math.sin(i * 2.4);
      tx += ux * (need - d);
      tz += uz * (need - d);
    }
  }
  if (visitors > 0) {
    const dx = sx - vx[0], dz = sz - vz[0];
    const d = Math.sqrt(dx * dx + dz * dz);
    const ux = d > 1e-3 ? dx / d : 1, uz = d > 1e-3 ? dz / d : 0;
    if (kind === "dog") {
      if (d < REACT.dogNotice) {
        alert = 1;
        // Towards the avatar, as far as the bound allows, stopping short of it.
        const step = Math.min(REACT.maxOffset, Math.max(0, d - need - REACT.dogStop));
        if (d >= need) (tx -= ux * step), (tz -= uz * step);
      }
    } else if (kind === "cat" || kind === "rabbit") {
      if (d < REACT.shy) (tx += ux * (REACT.shy - d)), (tz += uz * (REACT.shy - d)), (alert = 1);
    } else if (kind === "bird" || kind === "owl") {
      if (d < REACT.flutter) {
        alert = 1;
        if (ground) (tx += ux * REACT.maxOffset), (tz += uz * REACT.maxOffset);
      }
    } else if (kind === "reindeer") {
      if (d < REACT.notice) alert = 1;
    } else if (isPerson(kind) && !moving && d < REACT.notice) {
      face = 1;
      r.faceYaw[i] = Math.atan2(vx[0] - sx, vz[0] - sz);
    }
    if (isPerson(kind)) {
      if (d < REACT.wave && !r.near[i]) {
        r.near[i] = 1;
        if (!moving && !calm) r.wave[i] = REACT.waveSeconds;
      } else if (d > REACT.wave + 0.8) r.near[i] = 0;
    }
  }
  if (calm) alert = 0;
  const reach = Math.sqrt(tx * tx + tz * tz);
  if (reach > REACT.maxOffset) (tx *= REACT.maxOffset / reach), (tz *= REACT.maxOffset / reach);
  const now = Math.sqrt(r.ox[i] * r.ox[i] + r.oz[i] * r.oz[i]);
  const k = 1 - Math.exp(-(Math.min(reach, REACT.maxOffset) > now ? REACT.rise : REACT.fall) * dt);
  let ox = r.ox[i] + (tx - r.ox[i]) * k, oz = r.oz[i] + (tz - r.oz[i]) * k;
  // The bound holds whatever the step did.
  const len = Math.sqrt(ox * ox + oz * oz);
  if (len > REACT.maxOffset) (ox *= REACT.maxOffset / len), (oz *= REACT.maxOffset / len);
  r.ox[i] = ox;
  r.oz[i] = oz;
  const ease = 1 - Math.exp(-6 * dt);
  r.face[i] += (face - r.face[i]) * ease;
  r.alert[i] += (alert - r.alert[i]) * ease;
  r.wave[i] = Math.max(0, r.wave[i] - dt);
}
