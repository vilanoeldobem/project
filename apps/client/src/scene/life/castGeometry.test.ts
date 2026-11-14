/**
 * The cast as one mesh (IMPL-0025): every character's rig, the buffers they are appended to, and the index
 * buffer that holds only who is drawn.
 */
import { describe, expect, it } from "vitest";

import { isPerson, LIFE_CAST } from "@vila/shared/game/life";
import { PALETTE as P } from "@vila/shared/game/world";

import { bird, cat, dog, owl, rabbit } from "../gen/animals";
import { castRig } from "../gen/cast";
import { villager } from "../gen/characters";
import { AVATAR_SIZE, avatarParts, HIP_Y } from "../models";
import { buildCast, packVisible } from "./castGeometry";

const RIGS = LIFE_CAST.map((c) => castRig(c.kind, c.seed));
const CAST = buildCast(RIGS, () => [1, 1, 1]);
const TRIANGLES = 12_516;
const cells = (voxels: ReadonlyArray<readonly [number, number, number, string]>) => new Set(voxels.map(([x, y, z, c]) => `${x},${y},${z},${c}`));

describe("the rigs of the cast", () => {
  it("keeps the look of the villagers and animals that were decor: same seed, same voxels, now in parts", () => {
    const was = { "villager-1": villager, "villager-2": villager, "villager-3": villager, "dog-1": dog, "cat-1": cat, "bird-1": bird, "bird-2": bird, "rabbit-1": rabbit, "owl-1": owl };
    for (const [id, generate] of Object.entries(was)) {
      const def = LIFE_CAST.find((c) => c.id === id)!;
      const rig = castRig(def.kind, def.seed);
      const model = generate(def.seed);
      expect(rig.size, id).toBe(model.size);
      const parts = rig.parts.flatMap((p) => p.voxels);
      expect(parts.length, id).toBe(model.voxels.length);
      if (def.kind === "villager") expect(cells(parts), id).toEqual(cells(model.voxels));
      // The animals' generators face +x; the rig faces +z, a quarter turn: (x, z) → (-z, x).
      else expect(cells(parts), id).toEqual(cells(model.voxels.map(([x, y, z, c]) => [-z, y, x, c])));
    }
  });

  it("cuts a person into a body and four limbs that turn about the hips and shoulders, and an animal into legs, head and tail", () => {
    LIFE_CAST.forEach((c, i) => {
      const rig = RIGS[i];
      expect(rig.parts.length, c.id).toBeGreaterThanOrEqual(1);
      for (const p of rig.parts) expect(p.voxels.length, c.id).toBeGreaterThan(0);
      if (isPerson(c.kind)) {
        const [body, legL, legR, armL, armR] = rig.parts;
        expect([body.swing, legL.swing, legR.swing, armL.swing, armR.swing], c.id).toEqual([0, 1, -1, -0.8, 0.8]);
        // Legs hang from the hips, arms from the shoulders, on either side of the body.
        for (const leg of [legL, legR]) for (const v of leg.voxels) expect(v[1], c.id).toBeLessThan(leg.pivot[0]);
        for (const arm of [armL, armR]) for (const v of arm.voxels) expect(v[1], c.id).toBeLessThan(arm.pivot[0]);
        expect(Math.max(...legL.voxels.map((v) => v[0]))).toBeLessThan(0);
        expect(Math.min(...armR.voxels.map((v) => v[0]))).toBeGreaterThan(0);
        expect(rig.shadow).toBe(true);
        expect(rig.height).toBeGreaterThan(1.8);
        // Everyone is under 4 u but Santa, who is built larger on purpose.
        expect(rig.height).toBeLessThan(c.kind === "santa" ? 4.6 : 4);
      }
    });
    const parts = (id: string) => RIGS[LIFE_CAST.findIndex((c) => c.id === id)].parts;
    for (const id of ["reindeer-1", "dog-1", "dog-2", "cat-1"]) {
      expect(parts(id).map((p) => [p.swing, p.first, p.second]), id).toEqual([[0, 0, 0], [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, 0, 1]]);
      // The head is in front of its pivot and the tail behind its own: the nod and the wag turn them the right way.
      const [, , , head, tail] = parts(id);
      expect(Math.max(...head.voxels.map((v) => v[2])), id).toBeGreaterThan(head.pivot[1]);
      expect(Math.max(...tail.voxels.map((v) => v[2])), id).toBeLessThan(tail.pivot[1]);
    }
    // What is held is a part of its own: the elves' gift, the lumberjack's firewood, the shopkeepers' broom.
    for (const [id, held] of [["elf-1", true], ["lumberjack", true], ["shopkeeper-1", true], ["santa", false], ["villager-4", false], ["visitor-1", false]] as const) {
      expect(parts(id).some((p) => p.prop), id).toBe(held);
    }
    // Tiny animals cast no shadow, as the tiny decor did not.
    for (const id of ["cat-1", "bird-1", "rabbit-1", "owl-1"]) expect(RIGS[LIFE_CAST.findIndex((c) => c.id === id)].shadow, id).toBe(false);
  });

  it("makes Santa unmistakable next to the visitor's default avatar, which also wears a red coat and a Santa hat", () => {
    const santa = RIGS[LIFE_CAST.findIndex((c) => c.id === "santa")];
    const body = santa.parts[0].voxels;
    const avatar = avatarParts();
    const span = (voxels: ReadonlyArray<readonly [number, number, number, string]>, axis: 0 | 1 | 2) => Math.max(...voxels.map((v) => v[axis])) - Math.min(...voxels.map((v) => v[axis])) + 1;
    /** The widest row of the coat: the torso, without the arms (which are parts of their own). */
    const torso = (voxels: ReadonlyArray<readonly [number, number, number, string]>, rows: [number, number]) => voxels.filter((v) => v[1] >= rows[0] && v[1] <= rows[1]);
    // Silhouette: a third taller than the avatar in its hat, a body more than twice as wide and four times as
    // deep (belly in front, sack behind).
    const top = (voxels: ReadonlyArray<readonly [number, number, number, string]>) => Math.max(...voxels.map((v) => v[1])) + 1;
    expect(HIP_Y).toBe(3 * AVATAR_SIZE);
    expect((top(body) * santa.size) / (top(avatar.body) * AVATAR_SIZE)).toBeGreaterThan(1.3);
    const coat = torso(body, [3, 4]), avatarCoat = torso(avatar.body, [3, 5]);
    expect((span(coat, 0) * santa.size) / (span(avatarCoat, 0) * AVATAR_SIZE)).toBeGreaterThan(2);
    expect((span(coat, 2) * santa.size) / (span(avatarCoat, 2) * AVATAR_SIZE)).toBeGreaterThan(4);
    // What no avatar has: a white beard over the chest, a black belt all the way round with a gold buckle,
    // white fur at the hem, and the sack of gifts on the back.
    const at = (test: (v: readonly [number, number, number, string]) => boolean, color: string) => body.filter((v) => test(v) && v[3] === color).length;
    expect(at((v) => v[2] >= 2 && v[1] >= 5 && v[1] <= 7, P.cream)).toBeGreaterThanOrEqual(8);
    expect(at((v) => v[1] === 3, P.coal)).toBeGreaterThanOrEqual(12);
    expect(at((v) => v[1] === 3 && v[2] === 2, P.gold)).toBe(1);
    expect(at((v) => v[1] === 2, P.cream)).toBeGreaterThanOrEqual(10);
    expect(at((v) => v[2] <= -2 && v[1] >= 3 && v[1] <= 6, P.wood)).toBeGreaterThanOrEqual(20);
    expect(avatar.body.some((v) => v[2] <= -2 || v[2] >= 2)).toBe(false);
    // And he is the largest person of the cast.
    LIFE_CAST.forEach((c, i) => {
      if (isPerson(c.kind) && c.id !== "santa") expect(RIGS[i].size, c.id).toBeLessThan(santa.size);
    });
  });

  it("gives each character of a kind a look of its own", () => {
    const look = (i: number) => [...cells(RIGS[i].parts.flatMap((p) => p.voxels))].sort().join("|");
    for (const kind of ["villager", "elf", "shopkeeper", "visitor"] as const) {
      const ids = LIFE_CAST.map((c, i) => ({ c, i })).filter(({ c }) => c.kind === kind);
      expect(new Set(ids.map(({ i }) => look(i))).size, kind).toBe(ids.length);
    }
  });
});

describe("the cast as one mesh", () => {
  it("appends every part of every character, each vertex tagged with its character, pivot and weights", () => {
    const vertices = CAST.positions.length / 3;
    expect(CAST.normals.length).toBe(vertices * 3);
    expect(CAST.colors.length).toBe(vertices * 3);
    expect(CAST.rig.length).toBe(vertices * 4);
    expect(CAST.anim.length).toBe(vertices * 3);
    expect(CAST.ranges).toHaveLength(LIFE_CAST.length);
    // Ranges tile the index buffer, and a character's indices only reach its own vertices.
    let at = 0;
    CAST.ranges.forEach((range, character) => {
      expect(range.start).toBe(at);
      expect(range.count % 6).toBe(0);
      expect(range.count).toBeGreaterThan(0);
      for (let k = range.start; k < range.start + range.count; k++) expect(CAST.rig[CAST.indices[k] * 4]).toBe(character);
      at += range.count;
    });
    expect(at).toBe(CAST.indices.length);
    // The pivot is in world units: a villager's legs turn about a hip 0.6 to 0.9 u up.
    const villagerIndex = LIFE_CAST.findIndex((c) => c.id === "villager-1");
    const pivots = new Set<number>();
    for (let v = 0; v < vertices; v++) if (CAST.rig[v * 4] === villagerIndex && CAST.anim[v * 3] === 1) pivots.add(Math.round(CAST.rig[v * 4 + 1] * 100) / 100);
    expect([...pivots]).toEqual([Math.round(RIGS[villagerIndex].parts[1].pivot[0] * 0.3 * 100) / 100]);
    expect([0.6, 0.9]).toContain([...pivots][0]);
  });

  it("costs a small, fixed number of triangles: the whole cast is lighter than one residential block", () => {
    const triangles = CAST.indices.length / 3;
    // 12 516 triangles for the 30 characters, all drawn (the number is pinned so that a heavier cast is a decision).
    expect(triangles).toBe(TRIANGLES);
    expect(triangles).toBeLessThan(14_000);
    for (const [i, range] of CAST.ranges.entries()) expect(range.count / 3, LIFE_CAST[i].id).toBeLessThan(1_200);
  });

  it("packs only the characters that are drawn into the index buffer", () => {
    const into = new Uint32Array(CAST.indices.length);
    expect(packVisible(CAST, new Uint8Array(LIFE_CAST.length), into)).toBe(0);
    const some = new Uint8Array(LIFE_CAST.length);
    some[2] = some[7] = some[LIFE_CAST.length - 1] = 1;
    const n = packVisible(CAST, some, into);
    expect(n).toBe(CAST.ranges[2].count + CAST.ranges[7].count + CAST.ranges[LIFE_CAST.length - 1].count);
    const who = new Set<number>();
    for (let k = 0; k < n; k++) who.add(CAST.rig[into[k] * 4]);
    expect([...who].sort((a, b) => a - b)).toEqual([2, 7, LIFE_CAST.length - 1]);
    expect(packVisible(CAST, new Uint8Array(LIFE_CAST.length).fill(1), into)).toBe(CAST.indices.length);
  });
});
