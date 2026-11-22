/** The union catalog preserves every v1 index and appends the books' items. */
import { describe, expect, it } from "vitest";

import { COSMETICS, DEFAULT_LOOK, isPaid, SLOTS } from "./cosmetics";
import {
  COSMETICS_V2,
  isUnlockedIn,
  requirementIn,
  sanitizeLookIn,
  unlockedIdsIn,
  wearIn,
} from "./cosmetics-v2";
import { EMPTY_PROGRESS, MISSIONS } from "./progress";
import type { StoryCatalog, StoryQuest } from "./quests-v2/types";

const storyQuest: StoryQuest = {
  id: "v2-q",
  chainId: "v2",
  chainTitle: "V2",
  order: 1,
  track: "explore",
  title: "Uma missão v2",
  description: "Teste.",
  objectiveType: "collect",
  objectKind: "none",
  target: 1,
  unit: "peça",
  xp: 20,
  giverNpcId: "npc",
  turnInNpcId: "npc",
  dialogue: { offer: "Oferta.", turnIn: "Entrega." },
  objectiveEventIds: ["event"],
  book: 1,
  chapter: 1,
  region: "praca-grande-arvore",
  kind: "main",
  prerequisiteIds: [],
  worldState: null,
  theme: "chegada",
  audience: "todos",
  metricTag: "historia-principal",
  accessibility: "coleta",
  reward: null,
};
const story: StoryCatalog = { quests: [storyQuest], milestones: [], minigames: [], quickMissions: MISSIONS };

describe("cosmetics v2", () => {
  it("keeps the v1 array as its prefix", () => {
    expect(COSMETICS_V2.slice(0, COSMETICS.length)).toEqual(COSMETICS);
    expect(new Set(COSMETICS_V2.map((item) => item.id)).size).toBe(COSMETICS_V2.length);
    for (const slot of SLOTS) {
      const v1 = COSMETICS.filter((item) => item.slot === slot);
      const all = COSMETICS_V2.filter((item) => item.slot === slot);
      expect(all.slice(0, v1.length)).toEqual(v1);
    }
  });

  it("never unlocks or wears a paid item", () => {
    const paid = COSMETICS_V2.find((item) => isPaid(item))!;
    expect(isUnlockedIn(COSMETICS_V2, paid, { ...EMPTY_PROGRESS, xp: 10_000 })).toBe(false);
    expect(sanitizeLookIn(COSMETICS_V2, { ...DEFAULT_LOOK, helmet: paid.id }, EMPTY_PROGRESS).helmet).toBe(DEFAULT_LOOK.helmet);
  });

  it("keeps the dress overlap rule", () => {
    const dress = wearIn(COSMETICS_V2, DEFAULT_LOOK, "dress-red");
    expect(dress.dress).toBe("dress-red");
    expect(dress.blouse).toBe(DEFAULT_LOOK.blouse);
    const blouse = wearIn(COSMETICS_V2, dress, "blouse-stripes");
    expect(blouse.dress).toBe(DEFAULT_LOOK.dress);
  });

  it("unlocks defaults only on a fresh progress", () => {
    expect(unlockedIdsIn(COSMETICS_V2, EMPTY_PROGRESS).size).toBe(10);
  });

  it("resolves v1 and v2 requirement titles", () => {
    expect(requirementIn(story, COSMETICS_V2.find((item) => item.id === "helmet-beanie")!)).toContain("Encontre 2 presentes");
    expect(
      requirementIn(story, { id: "helmet-v2", slot: "helmet", name: "V2", unlock: { kind: "mission", missionId: "v2-q" } })
    ).toBe("Conclua: Uma missão v2");
  });
});
