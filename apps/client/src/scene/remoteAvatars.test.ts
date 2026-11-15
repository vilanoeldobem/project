import { Matrix4, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import { COSMETICS, DEFAULT_LOOK, isPaid, type Look, SLOTS } from "@vila/shared/game/cosmetics";
import { ROOM_CAPACITY } from "@vila/shared/net/protocol";

import { AVATAR_SIZE, avatarParts } from "./models";
import { mergeRemoteAvatars, REMOTE_PARTS, remoteTexture, writePart } from "./remoteAvatars";
import { voxelGeometries } from "./Voxels";

const KEYS = ["body", "legL", "legR", "armL", "armR"] as const;
const partsOf = (look: Look) => {
  const voxels = avatarParts(look);
  return KEYS.map((k) => voxelGeometries(voxels[k], AVATAR_SIZE)[0] ?? null);
};

/**
 * `count` distinct wearable looks, in a fixed order: look `i` is `i` written in mixed radix over the free items of
 * each slot. (The full product of the catalogue is far too large to enumerate.)
 */
function allLooks(count = ROOM_CAPACITY): Look[] {
  const options = SLOTS.map((slot) => COSMETICS.filter((c) => c.slot === slot && !isPaid(c)).map((c) => c.id));
  return Array.from({ length: count }, (_, i) => {
    const look = { ...DEFAULT_LOOK };
    let n = i;
    SLOTS.forEach((slot, s) => {
      look[slot] = options[s]![n % options[s]!.length]!;
      n = Math.floor(n / options[s]!.length);
    });
    return look;
  });
}

describe("remote avatars as one mesh", () => {
  it("draws a full room of distinct looks as one geometry, with a row per part of every slot", () => {
    const looks = allLooks();
    const remotes = ROOM_CAPACITY - 1;
    expect(looks.length).toBeGreaterThanOrEqual(remotes);
    const slots = looks.slice(0, remotes).map(partsOf);
    const merged = mergeRemoteAvatars(slots);
    const expected = slots.flat().reduce((n, g) => n + (g ? g.getAttribute("position").count : 0), 0);
    expect(merged.getAttribute("position").count).toBe(expected);
    const rows = new Set(merged.getAttribute("aRow").array as Float32Array);
    expect(Math.max(...rows)).toBeLessThan(remotes * REMOTE_PARTS);
    // One draw call, and a triangle cost that leaves the village most of the 250 000 budget even twice
    // (scene and shadow pass).
    const triangles = merged.getIndex()!.count / 3;
    expect(2 * triangles).toBeLessThan(100_000);
    // Indices point inside the merged vertices.
    const index = merged.getIndex()!.array;
    let max = 0;
    for (const i of index) max = Math.max(max, i);
    expect(max).toBeLessThan(expected);
  });

  it("keeps each part's vertices on its own row", () => {
    const a = partsOf(allLooks()[0]!);
    const b = partsOf(allLooks()[5]!);
    const merged = mergeRemoteAvatars([a, b]);
    const row = merged.getAttribute("aRow").array as Float32Array;
    let v = 0;
    [a, b].forEach((parts, slot) =>
      parts.forEach((g, part) => {
        if (!g) return;
        const n = g.getAttribute("position").count;
        expect(row[v]).toBe(slot * REMOTE_PARTS + part);
        expect(row[v + n - 1]).toBe(slot * REMOTE_PARTS + part);
        v += n;
      })
    );
  });

  it("an empty room merges to an empty geometry", () => {
    const merged = mergeRemoteAvatars([]);
    expect(merged.getAttribute("position").count).toBe(0);
    expect(merged.getIndex()!.count).toBe(0);
  });

  it("writes a part's matrix column by column into its row", () => {
    const texture = remoteTexture(ROOM_CAPACITY);
    const data = texture.image.data as Float32Array;
    expect(texture.image.height).toBe(ROOM_CAPACITY * REMOTE_PARTS);
    const m = new Matrix4().makeTranslation(new Vector3(1, 2, 3));
    writePart(data, 3, 2, m);
    const at = (3 * REMOTE_PARTS + 2) * 16;
    expect(Array.from(data.subarray(at, at + 16))).toEqual(m.elements);
    // The translation is the fourth texel (column), as the shader reads it.
    expect(Array.from(data.subarray(at + 12, at + 15))).toEqual([1, 2, 3]);
  });
});
