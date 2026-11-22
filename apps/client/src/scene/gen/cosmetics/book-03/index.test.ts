/** Book III cosmetic layers and their catalogue wiring. */
import { describe, expect, it } from "vitest";

import { COSMETICS as COSMETICS_V1, isPaid, type Cosmetic } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "@vila/shared/game/cosmetics-v2";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { COSMETICS as COSMETICS_B00 } from "@vila/shared/game/quests-v2/books/book-00-epilogue";
import { COSMETICS as COSMETICS_B01 } from "@vila/shared/game/quests-v2/books/book-01";
import { COSMETICS as COSMETICS_B02 } from "@vila/shared/game/quests-v2/books/book-02";
import { COSMETICS } from "@vila/shared/game/quests-v2/books/book-03";
import { measure } from "../../budget";
import { seedOf } from "../../rng";

import { MODELS } from "./index";

const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const byId = (id: string): Cosmetic => COSMETICS.find((c) => c.id === id)!;

describe("book III cosmetics", () => {
  it("has the six layers with the right targets", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "back-postbag",
      "helmet-bell",
      "blouse-post",
      "pants-aurora",
      "pants-frost",
      "pants-gold-thread",
    ]);
    expect(MODELS.map((m) => m.target)).toEqual(["body", "body", "body", "body", "body", "body"]);
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
    const start = (slot: string) =>
      COSMETICS_V1.filter((c) => c.slot === slot).length +
      [...COSMETICS_B00, ...COSMETICS_B01, ...COSMETICS_B02].filter((c) => c.slot === slot).length;
    const v2 = (slot: string) => COSMETICS_V2.filter((c) => c.slot === slot);
    expect(v2("helmet")[start("helmet")]?.id).toBe("helmet-bell");
    expect(v2("back")[start("back")]?.id).toBe("back-postbag");
    expect(v2("blouse")[start("blouse")]?.id).toBe("blouse-post");
    expect(v2("pants").slice(start("pants"), start("pants") + 3).map((c) => c.id)).toEqual([
      "pants-aurora",
      "pants-frost",
      "pants-gold-thread",
    ]);
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const bag = byId("back-postbag");
    const bell = byId("helmet-bell");
    const blouse = byId("blouse-post");
    expect(isUnlockedIn(COSMETICS_V2, bag, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, bag, { ...EMPTY_PROGRESS, completed: { "b03-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, bell, { ...EMPTY_PROGRESS, completed: { "b03-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, blouse, { ...EMPTY_PROGRESS, completed: { "b03-c3-04": true } })).toBe(true);
    for (const c of COSMETICS.filter(isPaid)) expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
  });
});
