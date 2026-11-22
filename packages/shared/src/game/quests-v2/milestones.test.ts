/** Milestones complete from counters, grant XP once and never accept or turn in. */
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, MISSIONS } from "../progress";
import { milestoneProgressIn, milestoneStateIn, settleMilestonesIn } from "./milestones";
import type { StoryCatalog, Milestone } from "./types";

const milestone = (over: Partial<Milestone> & Pick<Milestone, "id">): Milestone => ({
  book: 1,
  chainId: "b01-m1",
  order: 6,
  title: "Promessas",
  counterKey: "missions",
  threshold: 3,
  xp: 10,
  reward: { kind: "cosmetic", cosmeticId: "helmet-star" },
  region: "praca-grande-arvore",
  ...over,
});

const catalog: StoryCatalog = {
  quests: [],
  milestones: [milestone({ id: "m1" }), milestone({ id: "m2", counterKey: "trades", threshold: 2 })],
  minigames: [],
  quickMissions: MISSIONS,
};

describe("milestones", () => {
  it("derives locked, ready and completed from the counter", () => {
    expect(milestoneStateIn(catalog, { missions: 2 }, EMPTY_PROGRESS, "m1")).toBe("locked");
    expect(milestoneStateIn(catalog, { missions: 3 }, EMPTY_PROGRESS, "m1")).toBe("ready");
    const settled = settleMilestonesIn(catalog, { missions: 3 }, EMPTY_PROGRESS);
    expect(milestoneStateIn(catalog, { missions: 3 }, settled.progress, "m1")).toBe("completed");
    expect(milestoneProgressIn(catalog, { missions: 4 }, "m1")).toEqual({ value: 4, threshold: 3 });
  });

  it("adds XP once and is idempotent", () => {
    const first = settleMilestonesIn(catalog, { missions: 3, trades: 2 }, EMPTY_PROGRESS);
    expect(first.completed.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(first.progress.xp).toBe(20);
    expect(first.progress.completed).toEqual({ m1: true, m2: true });
    const again = settleMilestonesIn(catalog, { missions: 3, trades: 2 }, first.progress);
    expect(again.progress).toBe(first.progress);
    expect(again.completed).toEqual([]);
  });

  it("does not accept or turn in a quest", () => {
    const settled = settleMilestonesIn(catalog, { missions: 3 }, EMPTY_PROGRESS);
    expect(settled.progress.seen).toBe(EMPTY_PROGRESS.seen);
    expect(settled.progress.counters).toBe(EMPTY_PROGRESS.counters);
  });
});
