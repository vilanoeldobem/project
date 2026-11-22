/** Book I cosmetic layers and their catalogue wiring. */
import { describe, expect, it } from "vitest";

import { isPaid, type Cosmetic } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "@vila/shared/game/cosmetics-v2";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { COSMETICS } from "@vila/shared/game/quests-v2/books/book-01";
import { seedOf } from "../../rng";

import { measure } from "../../budget";
import { MODELS } from "./index";

const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const byId = (id: string): Cosmetic => COSMETICS.find((c) => c.id === id)!;

describe("book I cosmetics", () => {
  it("has the six layers with the right targets", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "helmet-star",
      "hand-left-fair",
      "face-snow-freckles",
      "helmet-aurora",
      "helmet-frost",
      "helmet-dawn",
    ]);
    expect(MODELS.map((m) => m.target)).toEqual(["body", "armLeft", "body", "body", "body", "body"]);
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
    const helmets = COSMETICS_V2.filter((c) => c.slot === "helmet").map((c) => c.id);
    expect(helmets.slice(-4)).toEqual(["helmet-star", "helmet-aurora", "helmet-frost", "helmet-dawn"]);
    expect(COSMETICS_V2.filter((c) => c.slot === "handLeft").at(-1)?.id).toBe("hand-left-fair");
    expect(COSMETICS_V2.filter((c) => c.slot === "face").at(-1)?.id).toBe("face-snow-freckles");
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const star = byId("helmet-star");
    const fair = byId("hand-left-fair");
    const freckles = byId("face-snow-freckles");
    expect(isUnlockedIn(COSMETICS_V2, star, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, star, { ...EMPTY_PROGRESS, completed: { "b01-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, fair, { ...EMPTY_PROGRESS, completed: { "b01-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, freckles, { ...EMPTY_PROGRESS, completed: { "b01-c3-04": true } })).toBe(true);
    for (const c of COSMETICS.filter(isPaid)) expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
  });
});
