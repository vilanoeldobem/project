/** Postgame and epilogue bridge: counts, manifest parity, world targets, the b05 gate and the final scene. */
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, type Progress } from "../../progress";
import { QUESTS as V1_QUESTS } from "../../quests";
import { applyEventIn, canAcceptIn, catalogFor, questStateIn, STORY_CATALOG } from "../catalog";
import { MANIFEST_BY_ID } from "../manifest";
import type { CatalogQuest, StoryCatalog } from "../types";
import { STORY_WORLD } from "../world";
import {
  COSMETICS,
  CREDITS,
  EPILOGUE_FINAL_QUESTS,
  FINAL_SCENE,
  finalSceneReady,
  INTERACTIONS,
  MILESTONES,
  NPCS,
  OBSTACLES,
  QUESTS,
  SPAWNS,
  STATES,
} from "./book-00-epilogue";

const withCompleted = (ids: readonly string[]): Progress => ({
  ...EMPTY_PROGRESS,
  completed: Object.fromEntries(ids.map((id) => [id, true])),
});

const playQuest = (catalog: StoryCatalog, p: Progress, id: string): Progress => {
  const quest = catalog.quests.find((candidate) => candidate.id === id) as CatalogQuest;
  let next = applyEventIn(catalog, p, id, "accept").progress;
  for (const eventId of quest.objectiveEventIds) next = applyEventIn(catalog, next, id, eventId).progress;
  return applyEventIn(catalog, next, id, "turn-in").progress;
};

describe("postgame catalogue", () => {
  it("has 12 independent 20 XP missions and no extra milestone", () => {
    expect(QUESTS).toHaveLength(12);
    expect(new Set(QUESTS.map((quest) => quest.id)).size).toBe(12);
    expect(QUESTS.every((quest) => quest.book === 0 && quest.kind === "postgame" && quest.region === null)).toBe(true);
    expect(QUESTS.every((quest) => quest.xp === 20 && quest.prerequisiteIds.length === 0)).toBe(true);
    expect(QUESTS.reduce((xp, quest) => xp + quest.xp, 0)).toBe(240);
    expect(MILESTONES).toEqual([]);
    expect(NPCS).toEqual([]);
    expect(SPAWNS).toEqual([]);
    expect(OBSTACLES).toEqual([]);
    expect(STATES).toEqual([]);
    expect(COSMETICS).toEqual([]);
  });

  it("matches the manifest id, xp, region and prerequisites", () => {
    for (const quest of QUESTS) {
      const entry = MANIFEST_BY_ID.get(quest.id);
      expect(entry).toBeDefined();
      expect(entry!.kind).toBe("postgame");
      expect(entry!.xp).toBe(quest.xp);
      expect(entry!.region).toBeNull();
      expect([...entry!.prerequisiteIds]).toEqual([...quest.prerequisiteIds]);
    }
  });

  it("names existing NPCs and has one world target for every non-delivery objective", () => {
    const npcIds = new Set(STORY_WORLD.npcs.map((npc) => npc.id));
    for (const quest of QUESTS) {
      expect(npcIds.has(quest.giverNpcId)).toBe(true);
      expect(npcIds.has(quest.turnInNpcId)).toBe(true);
      for (const eventId of quest.objectiveEventIds) {
        const target = INTERACTIONS.find((interaction) => interaction.questId === quest.id && interaction.id === eventId);
        expect(target, `${quest.id}:${eventId}`).toBeDefined();
        if (target?.kind === "talk") expect(npcIds.has(target.npcId ?? "")).toBe(true);
      }
    }
    expect(INTERACTIONS).toHaveLength(18);
    expect(new Set(INTERACTIONS.map((interaction) => `${interaction.questId}:${interaction.id}`)).size).toBe(INTERACTIONS.length);
  });
});

describe("epilogue bridge", () => {
  it("locks the five roots before b05-c3-04", () => {
    const catalog = catalogFor(true, true);
    for (const id of ["harness-bells", "market-invitations", "frozen-mailbox", "lake-lanterns", "tree-promise-visit"]) {
      expect(questStateIn(catalog, EMPTY_PROGRESS, id)).toBe("locked");
      expect(canAcceptIn(catalog, EMPTY_PROGRESS, id)).toBe(false);
      expect(applyEventIn(catalog, EMPTY_PROGRESS, id, "accept").progress).toEqual(EMPTY_PROGRESS);
    }
  });

  it("opens after b05-c3-04 and grants the 550 XP once", () => {
    const catalog = catalogFor(true, true);
    let progress = withCompleted(["b05-c3-04"]);
    expect(questStateIn(catalog, progress, "harness-bells")).toBe("available");
    for (const quest of V1_QUESTS) progress = playQuest(catalog, progress, quest.id);
    expect(progress.xp).toBe(550);
    expect(V1_QUESTS.every((quest) => progress.completed[quest.id])).toBe(true);
    const replay = V1_QUESTS.reduce((p, quest) => playQuest(catalog, p, quest.id), progress);
    expect(replay.xp).toBe(550);
    expect(replay.completed).toEqual(progress.completed);
  });

  it("keeps a repeated turn-in idempotent", () => {
    const catalog = catalogFor(true, true);
    let progress = withCompleted(["b05-c3-04"]);
    progress = playQuest(catalog, progress, "harness-bells");
    expect(progress.xp).toBe(20);
    const again = applyEventIn(catalog, progress, "harness-bells", "turn-in").progress;
    expect(again.xp).toBe(20);
    expect(again).toEqual(progress);
  });

  it("hides the epilogue and postgame when v1 is off", () => {
    const catalog = catalogFor(false, true);
    expect(catalog.quests.some((quest) => quest.id === "harness-bells")).toBe(false);
    expect(catalog.quests.some((quest) => quest.id === "pg1-01")).toBe(false);
    expect(applyEventIn(catalog, EMPTY_PROGRESS, "harness-bells", "accept").progress).toEqual(EMPTY_PROGRESS);
  });

  it("keeps the v1-only catalog legacy path", () => {
    const catalog = catalogFor(true, false);
    expect(questStateIn(catalog, EMPTY_PROGRESS, "harness-bells")).toBe("available");
    expect(catalog.quests.some((quest) => quest.id === "pg1-01")).toBe(false);
  });

  it("keeps the canonical catalogue untouched for the API parity path", () => {
    expect(STORY_CATALOG.quests.filter((quest) => quest.id === "pg1-01")).toHaveLength(1);
    expect(questStateIn(STORY_CATALOG, EMPTY_PROGRESS, "harness-bells")).toBe("available");
  });
});

describe("final scene", () => {
  it("waits for the six epilogue chains", () => {
    const five = EPILOGUE_FINAL_QUESTS.slice(0, 5);
    expect(finalSceneReady(withCompleted(five))).toBe(false);
    expect(finalSceneReady(withCompleted(EPILOGUE_FINAL_QUESTS))).toBe(true);
  });

  it("keeps fixed pt-BR copy with no paid or real-world credit", () => {
    expect(FINAL_SCENE).toHaveLength(4);
    expect(FINAL_SCENE.every((line) => line.length > 0)).toBe(true);
    expect(FINAL_SCENE.join(" ")).toContain("A Vila aprende a lembrar junto");
    expect(FINAL_SCENE.join(" ")).not.toContain("—");
    expect(CREDITS.length).toBeGreaterThan(0);
    expect(CREDITS.map((credit) => credit.role)).toContain("Elenco");
  });
});
