/**
 * The v2 engine is the v1 state machine with the catalog as a parameter. The v1 module is the oracle: every
 * state, progress count, inventory item and event result must match, prefix by prefix.
 */
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, MISSIONS, type Progress } from "../progress";
import { activeInventory, activeQuest, canAccept, QUESTS, questProgress, questState } from "../quests";
import { applyEvent } from "../progress";
import { V1_CATALOG } from "./catalog";
import {
  activeInventoryIn,
  activeQuestIn,
  applyEventIn,
  canAcceptIn,
  questProgressIn,
  questStateIn,
} from "./engine";
import type { StoryCatalog, StoryQuest } from "./types";

const storyQuest = (over: Partial<StoryQuest> & Pick<StoryQuest, "id">): StoryQuest => ({
  chainId: "test-chain",
  chainTitle: "Teste",
  order: 1,
  track: "explore",
  title: over.id,
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
  ...over,
});

const v2Catalog: StoryCatalog = {
  quests: [
    storyQuest({ id: "v2-a", objectiveEventIds: ["a-event"], book: 1 }),
    storyQuest({ id: "v2-b", objectiveEventIds: ["b-event"], prerequisiteIds: ["v2-a"], book: 2 }),
    storyQuest({ id: "v2-c", objectiveEventIds: ["c-event"], book: 2 }),
  ],
  milestones: [],
  minigames: [],
  quickMissions: MISSIONS,
};

const compare = (a: Progress, b: Progress) => {
  for (const quest of QUESTS) {
    expect(questStateIn(V1_CATALOG, b, quest.id)).toBe(questState(a, quest.id));
    expect(questProgressIn(V1_CATALOG, b, quest.id)).toEqual(questProgress(a, quest.id));
    expect(canAcceptIn(V1_CATALOG, b, quest.id)).toBe(canAccept(a, quest.id));
  }
  expect(activeQuestIn(V1_CATALOG, b)?.id).toBe(activeQuest(a)?.id);
  expect(activeInventoryIn(V1_CATALOG, b)).toEqual(activeInventory(a));
};

describe("v1 parity", () => {
  it("matches the v1 engine on every prefix of a full catalog replay", () => {
    const events: Array<[string, string]> = [];
    for (const quest of QUESTS) {
      events.push([quest.id, "accept"], ...quest.objectiveEventIds.map((id): [string, string] => [quest.id, id]), [quest.id, "turn-in"]);
    }
    events.push(["play-memory", "win"], ["explore-gifts", "gift-palm"], ["play-memory", "win"], ["missing", "event"]);
    let v1 = EMPTY_PROGRESS;
    let v2 = EMPTY_PROGRESS;
    for (const [missionId, eventId] of events) {
      const a = applyEvent(v1, missionId, eventId);
      const b = applyEventIn(V1_CATALOG, v2, missionId, eventId);
      expect(b).toEqual(a);
      v1 = a.progress;
      v2 = b.progress;
      compare(v1, v2);
    }
    expect(v2.xp).toBe(v1.xp);
  });

  it("matches every single-event sequence for every v1 quest", () => {
    for (const quest of QUESTS) {
      for (const eventId of ["accept", "turn-in", ...quest.objectiveEventIds, "unknown"]) {
        const a = applyEvent(EMPTY_PROGRESS, quest.id, eventId);
        const b = applyEventIn(V1_CATALOG, EMPTY_PROGRESS, quest.id, eventId);
        expect(b).toEqual(a);
      }
    }
  });
});

describe("v2 rules", () => {
  it("requires every prerequisite, not just one", () => {
    const catalog: StoryCatalog = {
      quests: [storyQuest({ id: "pre-1" }), storyQuest({ id: "pre-2" }), storyQuest({ id: "target", prerequisiteIds: ["pre-1", "pre-2"] })],
      milestones: [],
      minigames: [],
      quickMissions: MISSIONS,
    };
    expect(questStateIn(catalog, EMPTY_PROGRESS, "target")).toBe("locked");
    const one = applyEventIn(catalog, EMPTY_PROGRESS, "pre-1", "turn-in").progress;
    expect(one.completed["pre-1"]).toBeUndefined();
    const accepted = applyEventIn(catalog, EMPTY_PROGRESS, "pre-1", "accept").progress;
    const objective = applyEventIn(catalog, accepted, "pre-1", "event").progress;
    const done = applyEventIn(catalog, objective, "pre-1", "turn-in").progress;
    expect(questStateIn(catalog, done, "target")).toBe("locked");
  });

  it("keeps one active quest across books and accepts a dependent quest after its prerequisite", () => {
    let p = applyEventIn(v2Catalog, EMPTY_PROGRESS, "v2-a", "accept").progress;
    p = applyEventIn(v2Catalog, p, "v2-a", "a-event").progress;
    p = applyEventIn(v2Catalog, p, "v2-a", "turn-in").progress;
    expect(p.completed["v2-a"]).toBe(true);
    expect(questStateIn(v2Catalog, p, "v2-b")).toBe("available");
    p = applyEventIn(v2Catalog, p, "v2-b", "accept").progress;
    expect(activeQuestIn(v2Catalog, p)?.id).toBe("v2-b");
    const blocked = applyEventIn(v2Catalog, p, "v2-c", "accept");
    expect(blocked.progress).toBe(p);
  });

  it("ignores an unknown id and a repeated event", () => {
    const unknown = applyEventIn(v2Catalog, EMPTY_PROGRESS, "missing", "accept");
    expect(unknown.progress).toBe(EMPTY_PROGRESS);
    const accepted = applyEventIn(v2Catalog, EMPTY_PROGRESS, "v2-a", "accept");
    const repeat = applyEventIn(v2Catalog, accepted.progress, "v2-a", "accept");
    expect(repeat.progress).toBe(accepted.progress);
  });
});
