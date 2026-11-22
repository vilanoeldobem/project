/** Book X cosmetic layers and their catalogue wiring. */
import { describe, expect, it } from "vitest";

import { COSMETICS as COSMETICS_V1, isPaid, type Cosmetic } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "@vila/shared/game/cosmetics-v2";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { COSMETICS } from "@vila/shared/game/quests-v2/books/book-10";
import { measure } from "../../budget";
import { seedOf } from "../../rng";

import { MODELS } from "./index";

const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const byId = (id: string): Cosmetic => COSMETICS.find((c) => c.id === id)!;

describe("book X cosmetics", () => {
  it("has the six layers with the right targets", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "hand-right-watch",
      "hand-right-candle",
      "dress-vigil",
      "special-star-guide",
      "special-dawn",
      "special-vigil-aurora",
    ]);
    expect(MODELS.map((m) => m.target)).toEqual(["armRight", "armRight", "body", "body", "body", "body"]);
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

  it("appends after the v1 prefix of each slot", () => {
    const ids = new Set(COSMETICS.map((c) => c.id));
    expect(COSMETICS_V2.filter((c) => ids.has(c.id)).map((c) => c.id)).toEqual(COSMETICS.map((c) => c.id));
    for (const slot of ["dress", "handRight", "special"] as const) {
      const v1 = COSMETICS_V1.filter((c) => c.slot === slot);
      expect(COSMETICS_V2.filter((c) => c.slot === slot).slice(0, v1.length)).toEqual(v1);
    }
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const watch = byId("hand-right-watch");
    const candle = byId("hand-right-candle");
    const dress = byId("dress-vigil");
    expect(isUnlockedIn(COSMETICS_V2, watch, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, watch, { ...EMPTY_PROGRESS, completed: { "b10-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, candle, { ...EMPTY_PROGRESS, completed: { "b10-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, dress, { ...EMPTY_PROGRESS, completed: { "b10-c2-04": true } })).toBe(true);
    for (const c of COSMETICS.filter(isPaid)) expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
  });

  it("keeps the prompt's colliding special-aurora id out of the catalogue", () => {
    expect(COSMETICS.some((c) => c.id === "special-aurora")).toBe(false);
    expect(COSMETICS.some((c) => c.id === "special-vigil-aurora")).toBe(true);
    expect(COSMETICS_V1.some((c) => c.id === "special-aurora")).toBe(true);
    expect(COSMETICS_V2.filter((c) => c.id === "special-aurora")).toHaveLength(1);
  });
});
