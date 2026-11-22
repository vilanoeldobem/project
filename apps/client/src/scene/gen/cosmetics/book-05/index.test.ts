/** Book V cosmetic layers and their catalogue wiring. */
import { describe, expect, it } from "vitest";

import { COSMETICS as COSMETICS_V1, isPaid, type Cosmetic } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "@vila/shared/game/cosmetics-v2";
import { EMPTY_PROGRESS } from "@vila/shared/game/progress";
import { COSMETICS as COSMETICS_B00 } from "@vila/shared/game/quests-v2/books/book-00-epilogue";
import { COSMETICS as COSMETICS_B01 } from "@vila/shared/game/quests-v2/books/book-01";
import { COSMETICS as COSMETICS_B02 } from "@vila/shared/game/quests-v2/books/book-02";
import { COSMETICS as COSMETICS_B03 } from "@vila/shared/game/quests-v2/books/book-03";
import { COSMETICS as COSMETICS_B04 } from "@vila/shared/game/quests-v2/books/book-04";
import { COSMETICS } from "@vila/shared/game/quests-v2/books/book-05";
import { measure } from "../../budget";
import { seedOf } from "../../rng";

import { MODELS } from "./index";

const fingerprint = (voxels: unknown) => seedOf(JSON.stringify(voxels)).toString(16);
const byId = (id: string): Cosmetic => COSMETICS.find((c) => c.id === id)!;

describe("book V cosmetics", () => {
  it("has the six layers with the right targets", () => {
    expect(MODELS.map((m) => m.id)).toEqual([
      "back-travel",
      "back-thread",
      "special-promise-book",
      "shoes-aurora",
      "shoes-frost",
      "shoes-dawn",
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

  it("appends after the v1 prefix of each slot", () => {
    const v1 = (slot: string) => COSMETICS_V1.filter((c) => c.slot === slot);
    const v2 = (slot: string) => COSMETICS_V2.filter((c) => c.slot === slot);
    for (const [slot, ids] of [
      ["back", ["back-travel", "back-thread"]],
      ["shoes", ["shoes-aurora", "shoes-frost", "shoes-dawn"]],
      ["special", ["special-promise-book"]],
    ] as const) {
      expect(v2(slot).slice(0, v1(slot).length)).toEqual(v1(slot));
      const start = v1(slot).length;
      const earlier = [...COSMETICS_B00, ...COSMETICS_B01, ...COSMETICS_B02, ...COSMETICS_B03, ...COSMETICS_B04].filter((c) => c.slot === slot).map((c) => c.id);
      const expected = [...earlier, ...ids];
      expect(v2(slot).slice(start, start + expected.length).map((c) => c.id)).toEqual(expected);
    }
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const travel = byId("back-travel");
    const thread = byId("back-thread");
    const book = byId("special-promise-book");
    expect(isUnlockedIn(COSMETICS_V2, travel, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, travel, { ...EMPTY_PROGRESS, completed: { "b05-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, thread, { ...EMPTY_PROGRESS, completed: { "b05-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, book, { ...EMPTY_PROGRESS, completed: { "b05-c3-04": true } })).toBe(true);
    for (const c of COSMETICS.filter(isPaid)) expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
  });
});
