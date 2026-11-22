/** The unified catalog keeps the v1 behavior and exposes the same engine with the catalog parameter. */
import { describe, expect, it } from "vitest";

import { applyEvent, EMPTY_PROGRESS } from "../progress";
import { QUESTS } from "../quests";
import { catalogFor, isStoryQuest, STORY_CATALOG, STORY_ENTRY_IDS, STORY_QUEST_IDS, V1_CATALOG } from "./catalog";
import { applyEventIn, questStateIn } from "./engine";

describe("catalog", () => {
  it("keeps v1 as the exact default", () => {
    expect(V1_CATALOG.quests).toBe(QUESTS);
    expect(V1_CATALOG.milestones).toEqual([]);
    expect(V1_CATALOG.quickMissions).toHaveLength(4);
    expect(V1_CATALOG.quickMissions).toBe(STORY_CATALOG.quickMissions);
  });

  it("has no duplicate ids in the unified catalog", () => {
    const ids = STORY_CATALOG.quests.map((quest) => quest.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(STORY_QUEST_IDS.size).toBe(ids.length);
    expect(STORY_ENTRY_IDS.size).toBe(ids.length + STORY_CATALOG.quickMissions.length);
    expect(STORY_CATALOG.quests.filter(isStoryQuest).every((quest) => quest.book >= 0)).toBe(true);
  });

  it("agrees with v1 for v1 events", () => {
    let v1 = EMPTY_PROGRESS;
    let v2 = EMPTY_PROGRESS;
    for (const [missionId, eventId] of [
      ["harness-bells", "accept"],
      ["harness-bells", "bell-pine-north"],
      ["harness-bells", "bell-pine-east"],
      ["harness-bells", "turn-in"],
      ["play-memory", "win"],
    ] as const) {
      const a = applyEvent(v1, missionId, eventId);
      const b = applyEventIn(STORY_CATALOG, v2, missionId, eventId);
      expect(b).toEqual(a);
      v1 = a.progress;
      v2 = b.progress;
    }
    expect(questStateIn(STORY_CATALOG, v2, "harness-bells")).toBe("completed");
  });
});

describe("catalogFor", () => {
  it("hides the epilogue when v1 is off and the books when v2 is off", () => {
    const v2Only = catalogFor(false, true);
    expect(v2Only.quests.some((quest) => quest.id === "harness-bells")).toBe(false);
    expect(v2Only.milestones).toEqual(STORY_CATALOG.milestones);
    expect(catalogFor(true, false).quests).toEqual(QUESTS);
    expect(catalogFor(false, false).quests).toEqual([]);
    expect(catalogFor(true, true).quests.some((quest) => quest.id === "harness-bells")).toBe(true);
  });
});
