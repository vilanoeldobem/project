/** Book II cosmetic layers and their catalogue wiring. */
import { describe, expect, it } from "vitest";

import { isPaid, type Cosmetic } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "@vila/shared/game/cosmetics-v2";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { COSMETICS } from "@vila/shared/game/quests-v2/books/book-02";
import { seedOf } from "../../rng";

import { measure } from "../../budget";
import { MODELS } from "./index";

const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const byId = (id: string): Cosmetic => COSMETICS.find((c) => c.id === id)!;

describe("book II cosmetics", () => {
  it("has the six layers with the right targets", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "blouse-garden",
      "blouse-quilt",
      "shoes-garden",
      "blouse-aurora",
      "blouse-velvet-night",
      "blouse-starlight",
    ]);
    expect(MODELS.every((m) => m.target === "body")).toBe(true);
  });

  it.each(MODELS.map((m) => [m.id, m] as const))("%s stays inside the cosmetic budget", (id, model) => {
    const voxels = model.layer.voxels;
    expect(voxels.length).toBeGreaterThan(0);
    expect(voxels.every(([x, y, z]) => Number.isInteger(x) && Number.isInteger(y) && Number.isInteger(z))).toBe(true);
    expect(new Set(voxels.map(([x, y, z]) => `${x},${y},${z}`)).size).toBe(voxels.length);
    const m = measure(voxels);
    expect(m.voxels, id).toBeLessThanOrEqual(40);
    expect(m.faces, id).toBeLessThanOrEqual(140);
  });

  it.each(MODELS.map((m) => [m.id, m] as const))("%s keeps its fixed layer", (id, model) => {
    expect(fingerprint(model.layer.voxels), id).toMatchSnapshot();
  });

  it("adds six catalogue entries with three paid and three free", () => {
    expect(COSMETICS).toHaveLength(6);
    expect(COSMETICS.filter((c) => isPaid(c))).toHaveLength(3);
    expect(COSMETICS.filter((c) => !isPaid(c))).toHaveLength(3);
    expect(new Set(COSMETICS_V2.map((c) => c.id)).size).toBe(COSMETICS_V2.length);
  });

  it("keeps the v1 prefix and appends each slot in book order", () => {
    const blouses = COSMETICS_V2.filter((c) => c.slot === "blouse").map((c) => c.id);
    expect(blouses.slice(-5)).toEqual(["blouse-garden", "blouse-quilt", "blouse-aurora", "blouse-velvet-night", "blouse-starlight"]);
    expect(COSMETICS_V2.filter((c) => c.slot === "shoes").at(-1)?.id).toBe("shoes-garden");
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const garden = byId("blouse-garden");
    const quilt = byId("blouse-quilt");
    const shoes = byId("shoes-garden");
    expect(isUnlockedIn(COSMETICS_V2, garden, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, garden, { ...EMPTY_PROGRESS, completed: { "b02-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, quilt, { ...EMPTY_PROGRESS, completed: { "b02-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, shoes, { ...EMPTY_PROGRESS, completed: { "b02-c3-04": true } })).toBe(true);
    for (const c of COSMETICS.filter(isPaid)) expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
  });

  it("never uses Math.random in the layers", () => {
    const files = import.meta.glob(["./*.ts", "!./*.test.ts"], { query: "?raw", import: "default", eager: true }) as Record<string, string>;
    expect(Object.keys(files).length).toBeGreaterThan(0);
    for (const [path, src] of Object.entries(files)) expect(/Math\.random\s*\(/.test(src), path).toBe(false);
  });
});
