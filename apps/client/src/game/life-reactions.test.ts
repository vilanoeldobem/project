/**
 * The local reaction layer (IMPL-0025): what one visitor sees of a character around its shared position.
 * Bounded, decaying, and never fed back into the simulation.
 */
import { describe, expect, it } from "vitest";

import { AVATAR_RADIUS } from "@vila/shared/game/collision";
import { LIFE_KINDS, LIFE_RADIUS, type LifeKind } from "@vila/shared/game/life";
import { mulberry32 } from "@vila/shared/environment/random";

import { createReactions, forget, react, REACT } from "./life-reactions";

const DT = 1 / 60;
/** Runs `seconds` of frames for one character at `(sx, sz)` with the avatars at `visitors`. */
function run(kind: LifeKind, visitors: Array<[number, number]>, seconds: number, opts: { moving?: boolean; calm?: boolean; y?: number; r?: ReturnType<typeof createReactions> } = {}) {
  const r = opts.r ?? createReactions(1);
  const vx = Float32Array.from(visitors, (v) => v[0]), vz = Float32Array.from(visitors, (v) => v[1]);
  let most = 0;
  for (let t = 0; t < seconds; t += DT) {
    react(r, 0, kind, LIFE_RADIUS[kind], 0, 0, opts.y ?? 0, opts.moving ?? false, vx, vz, visitors.length, DT, opts.calm ?? false);
    most = Math.max(most, Math.hypot(r.ox[0], r.oz[0]));
  }
  return { r, most, offset: Math.hypot(r.ox[0], r.oz[0]), ox: r.ox[0], oz: r.oz[0] };
}

describe("the local reaction layer", () => {
  it("never draws a character farther than the bound from its shared position, whatever the avatars do", { timeout: 30_000 }, () => {
    const rnd = mulberry32(2026);
    for (const kind of LIFE_KINDS) {
      const r = createReactions(1);
      const vx = new Float32Array(24), vz = new Float32Array(24);
      for (let frame = 0; frame < 4000; frame++) {
        // A crowd that jumps around, on top of the character and all around it, at any frame time.
        const n = Math.floor(rnd() * 24);
        for (let v = 0; v < n; v++) (vx[v] = (rnd() - 0.5) * (rnd() < 0.3 ? 0.2 : 8)), (vz[v] = (rnd() - 0.5) * (rnd() < 0.3 ? 0.2 : 8));
        react(r, 0, kind, LIFE_RADIUS[kind], 0, 0, 0, rnd() < 0.5, vx, vz, n, rnd() * 0.1, rnd() < 0.2);
        expect(Math.hypot(r.ox[0], r.oz[0]), `${kind}, frame ${frame}`).toBeLessThanOrEqual(REACT.maxOffset + 1e-6);
        expect(r.face[0]).toBeGreaterThanOrEqual(0);
        expect(r.face[0]).toBeLessThanOrEqual(1);
        expect(r.alert[0]).toBeLessThanOrEqual(1);
      }
    }
    expect(REACT.maxOffset).toBeLessThanOrEqual(1);
  });

  it("steps out of an avatar's way and comes back when the avatar leaves", () => {
    for (const kind of ["villager", "santa", "elf", "reindeer"] as const) {
      // An avatar standing almost on the character: it ends up a body away, as far as the bound allows.
      const aside = run(kind, [[0.3, 0]], 2);
      const need = LIFE_RADIUS[kind] + AVATAR_RADIUS + REACT.gap;
      expect(aside.ox, kind).toBeLessThan(0);
      expect(aside.offset, kind).toBeCloseTo(Math.min(REACT.maxOffset, need - 0.3), 2);
      // It decays: three seconds after the avatar has gone, the character is back where everyone sees it.
      const back = run(kind, [[30, 30]], 3, { r: aside.r });
      expect(back.offset, kind).toBeLessThan(0.01);
      const gone = run(kind, [], 3, { r: run(kind, [[0.3, 0]], 2).r });
      expect(gone.offset, kind).toBeLessThan(0.01);
    }
    // An avatar exactly on the spot still gets out of the way (in a direction of the character's own).
    expect(run("villager", [[0, 0]], 2).offset).toBeGreaterThan(0.8);
  });

  it("gives way to other visitors' avatars too, not only to this visitor's", () => {
    const far: [number, number] = [20, 20];
    const other = run("villager", [far, [0, 0.4]], 2);
    expect(other.oz).toBeLessThan(-0.5);
    // Walking as well as standing.
    expect(run("villager", [far, [0, 0.4]], 2, { moving: true }).oz).toBeLessThan(-0.5);
    // A perched bird is over every head: nobody is in its way.
    expect(run("bird", [[0, 0.1]], 2, { y: 4.5 }).offset).toBe(0);
  });

  it("reacts by kind to this visitor's avatar: a dog comes closer and wags, a cat keeps its distance, a bird hops away, a reindeer lifts its head", () => {
    const dog = run("dog", [[3, 0]], 2);
    expect(dog.ox).toBeGreaterThan(0.9); // towards the avatar, to the bound
    expect(dog.r.alert[0]).toBeGreaterThan(0.9);
    // It stops short of the avatar: never into it.
    const close = run("dog", [[1.5, 0]], 2);
    expect(1.5 - close.ox).toBeGreaterThanOrEqual(LIFE_RADIUS.dog + AVATAR_RADIUS);
    // Another visitor's avatar at the same place: no approach (only this visitor's own draws the dog).
    expect(run("dog", [[30, 30], [3, 0]], 2).offset).toBe(0);

    const cat = run("cat", [[1.5, 0]], 2);
    expect(cat.ox).toBeLessThan(-0.9); // away
    expect(run("cat", [[REACT.shy + 0.5, 0]], 2).offset).toBe(0);
    expect(run("rabbit", [[1.5, 0]], 2).ox).toBeLessThan(-0.9);

    const bird = run("bird", [[2, 0]], 2);
    expect(bird.ox).toBeLessThan(-0.9);
    expect(bird.r.alert[0]).toBeGreaterThan(0.9);

    const deer = run("reindeer", [[3.5, 0]], 2);
    expect(deer.offset).toBe(0);
    expect(deer.r.alert[0]).toBeGreaterThan(0.9);
    expect(run("reindeer", [[REACT.notice + 1, 0]], 2).r.alert[0]).toBe(0);
  });

  it("has a person who stands turn to the avatar and wave once per approach; one who walks keeps walking", () => {
    const standing = run("villager", [[0, 3]], 0.5);
    expect(standing.r.face[0]).toBeGreaterThan(0.9);
    expect(standing.r.faceYaw[0]).toBeCloseTo(0); // +z
    expect(standing.r.wave[0]).toBeGreaterThan(0);
    // The wave ends, and staying near does not start another.
    const later = run("villager", [[0, 3]], 3, { r: standing.r });
    expect(later.r.wave[0]).toBe(0);
    // Leaving and coming back: one more.
    run("villager", [[0, 9]], 1, { r: later.r });
    expect(later.r.face[0]).toBeLessThan(0.01);
    expect(run("villager", [[0, 3]], 0.2, { r: later.r }).r.wave[0]).toBeGreaterThan(0);
    // On the move: no turn and no wave.
    const walking = run("villager", [[0, 3]], 0.5, { moving: true });
    expect([walking.r.face[0], walking.r.wave[0]]).toEqual([0, 0]);
  });

  it("with less motion asked for: nothing waves, wags or hops, and characters still give way", () => {
    expect(run("villager", [[0, 3]], 0.5, { calm: true }).r.wave[0]).toBe(0);
    expect(run("dog", [[3, 0]], 2, { calm: true }).r.alert[0]).toBe(0);
    expect(run("bird", [[2, 0]], 2, { calm: true }).r.alert[0]).toBe(0);
    expect(run("villager", [[0.3, 0]], 2, { calm: true }).offset).toBeGreaterThan(0.5);
  });

  it("forgets a character that is no longer drawn", () => {
    const { r } = run("villager", [[0.3, 0]], 2);
    forget(r, 0);
    expect([r.ox[0], r.oz[0], r.face[0], r.wave[0], r.alert[0], r.near[0]]).toEqual([0, 0, 0, 0, 0, 0]);
  });
});
