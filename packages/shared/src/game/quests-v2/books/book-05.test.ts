/** Book V: counts, manifest parity, world wiring, state machine, milestones and cosmetics. */
import { describe, expect, it } from "vitest";

import { COSMETICS as COSMETICS_V1 } from "../../cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "../../cosmetics-v2";
import { EMPTY_PROGRESS, type Progress } from "../../progress";
import { applyEventIn, prerequisitesOf, questStateIn, STORY_CATALOG } from "../catalog";
import { MANIFEST } from "../manifest";
import { settleMilestonesIn } from "../milestones";
import { worldStatesIn } from "../states";
import { ALL_WORLD, STORY_WORLD } from "../world";
import { COSMETICS as COSMETICS_B01, NPCS as NPCS_B01 } from "./book-01";
import { COSMETICS as COSMETICS_B02, NPCS as NPCS_B02 } from "./book-02";
import { COSMETICS as COSMETICS_B03, NPCS as NPCS_B03 } from "./book-03";
import { COSMETICS as COSMETICS_B04, NPCS as NPCS_B04 } from "./book-04";
import { COSMETICS, INTERACTIONS, MILESTONES, NPCS, OBSTACLES, QUESTS, SPAWNS, STATES } from "./book-05";

const manifest = MANIFEST.filter((entry) => entry.book === 5);
const verse = (id: string) => QUESTS.find((q) => q.id === id)!;
const milestone = (id: string) => MILESTONES.find((m) => m.id === id)!;
const cosmetic = (id: string) => COSMETICS.find((c) => c.id === id)!;
const withCompleted = (ids: readonly string[]): Progress => ({
  ...EMPTY_PROGRESS,
  completed: Object.fromEntries(ids.map((id) => [id, true])),
});
const LOGICAL_NPCS = [
  "storyteller",
  "postmaster",
  "pond-keeper",
  "lia",
  "seu-elias",
  "dona-vilma",
  "joca",
  "seu-ademar",
  "dona-iris",
  "tomas",
  "dona-geada",
  "mestre-anselmo",
  "papai-noel",
];

describe("book V catalogue", () => {
  it("has 45 entries: 33 narrative and 12 milestones", () => {
    expect(QUESTS).toHaveLength(33);
    expect(MILESTONES).toHaveLength(12);
    expect(QUESTS.filter((q) => q.kind === "main")).toHaveLength(12);
    expect(QUESTS.filter((q) => q.kind === "regional")).toHaveLength(16);
    expect(QUESTS.filter((q) => q.kind === "side")).toHaveLength(5);
    expect(QUESTS.reduce((xp, q) => xp + q.xp, 0)).toBe(930);
    expect(MILESTONES.reduce((xp, m) => xp + m.xp, 0)).toBe(120);
    expect(QUESTS.reduce((xp, q) => xp + q.xp, 0) + MILESTONES.reduce((xp, m) => xp + m.xp, 0)).toBe(1050);
  });

  it("keeps the chapter, arc and side XP curves", () => {
    for (const chapter of [1, 2, 3]) {
      const list = QUESTS.filter((q) => q.kind === "main" && q.chapter === chapter).sort((a, b) => a.order - b.order);
      expect(list.map((q) => q.xp)).toEqual([20, 25, 30, 50]);
    }
    for (const arc of ["r1", "r2"]) {
      const list = QUESTS.filter((q) => q.id.includes(`-${arc}-`)).sort((a, b) => a.order - b.order);
      expect(list.map((q) => q.xp)).toEqual([20, 20, 25, 25, 30, 30, 40, 50]);
    }
    expect(QUESTS.filter((q) => q.kind === "side").every((q) => q.xp === 15)).toBe(true);
    expect(MILESTONES.every((m) => m.xp === 10)).toBe(true);
  });

  it("matches the manifest id, xp, region and prerequisites", () => {
    expect(manifest).toHaveLength(45);
    for (const entry of manifest) {
      if (entry.kind === "milestone") {
        const m = milestone(entry.id);
        expect(m.xp).toBe(entry.xp);
        expect(m.region).toBe(entry.region);
      } else {
        const q = verse(entry.id);
        expect(q.xp).toBe(entry.xp);
        expect(q.region).toBe(entry.region);
        expect([...q.prerequisiteIds]).toEqual([...entry.prerequisiteIds]);
      }
    }
  });

  it("uses known prerequisites and only the exit leaves the book", () => {
    const ids = new Set([...manifest.map((entry) => entry.id), "b04-c3-04"]);
    for (const q of QUESTS) {
      for (const pre of prerequisitesOf(q)) {
        expect(ids.has(pre), `${q.id} -> ${pre}`).toBe(true);
        expect(pre).not.toBe(q.id);
      }
      expect(q.prerequisiteIds).not.toContain("b05-c3-04");
    }
    expect(prerequisitesOf(verse("b05-c1-01"))).toEqual(["b04-c3-04"]);
  });

  it("applies the region rule", () => {
    for (const q of QUESTS) {
      const expected = /-c1-|-c3-|-r1-/.test(q.id)
        ? "estacao-treno"
        : /-c2-|-r2-/.test(q.id)
          ? "casa-fio-vale-vento-branco"
          : q.prerequisiteIds.some((pre) => pre.includes("-c2-"))
            ? "casa-fio-vale-vento-branco"
            : "estacao-treno";
      expect(q.region, q.id).toBe(expected);
    }
    expect(MILESTONES.filter((m) => m.chainId === "b05-m1").every((m) => m.region === "estacao-treno")).toBe(true);
    expect(MILESTONES.filter((m) => m.chainId === "b05-m2").every((m) => m.region === "casa-fio-vale-vento-branco")).toBe(true);
  });

  it("exports exactly the five world states it turns on", () => {
    expect(STATES).toEqual(["platform-open", "postman-named", "alba-remembered", "star-lit", "loom-woven"]);
    const set = QUESTS.filter((q) => q.worldState !== null);
    expect(set.map((q) => q.id)).toEqual([
      "b05-c1-04",
      "b05-c2-04",
      "b05-c3-02",
      "b05-c3-03",
      "b05-r1-08",
      "b05-r2-07",
      "b05-r2-08",
    ]);
    expect(new Set(set.map((q) => q.worldState))).toEqual(new Set(STATES));
    const done = withCompleted(["b05-c1-04", "b05-c2-04", "b05-c3-02", "b05-c3-03", "b05-r1-08", "b05-r2-07", "b05-r2-08"]);
    expect(worldStatesIn(STORY_CATALOG, done)).toEqual(new Set(STATES));
  });
});

describe("book V world wiring", () => {
  it("gives every objective a target and keeps the event lists complete", () => {
    const spawns = new Map(SPAWNS.map((spawn) => [`${spawn.questId}:${spawn.id}`, spawn]));
    const talks = new Map(INTERACTIONS.map((i) => [`${i.questId}:${i.id}`, i]));
    for (const q of QUESTS) {
      if (q.objectiveType === "deliver") {
        expect(q.objectiveEventIds).toEqual([]);
        continue;
      }
      expect(q.objectiveEventIds).toHaveLength(q.target);
      for (const event of q.objectiveEventIds) {
        const spawn = spawns.get(`${q.id}:${event}`);
        const interaction = talks.get(`${q.id}:${event}`);
        if (q.objectiveType === "collect") {
          expect(spawn, `${q.id}:${event}`).toBeDefined();
          expect(interaction).toBeUndefined();
        } else {
          expect(interaction, `${q.id}:${event}`).toBeDefined();
          expect(spawn).toBeUndefined();
        }
      }
    }
  });

  it("keeps spawn and interaction ids unique and linked to their quests", () => {
    expect(new Set(SPAWNS.map((s) => s.id)).size).toBe(SPAWNS.length);
    expect(new Set(INTERACTIONS.map((i) => i.id)).size).toBe(INTERACTIONS.length);
    expect(new Set(SPAWNS.map((s) => `${s.questId}:${s.id}`)).size).toBe(SPAWNS.length);
    expect(new Set(INTERACTIONS.map((i) => `${i.questId}:${i.id}`)).size).toBe(INTERACTIONS.length);
    for (const spawn of SPAWNS) {
      expect(verse(spawn.questId).objectiveEventIds).toContain(spawn.id);
      expect(spawn.book).toBe(5);
    }
    for (const interaction of INTERACTIONS) {
      expect(verse(interaction.questId).objectiveEventIds).toContain(interaction.id);
      expect(interaction.book).toBe(5);
      expect(interaction.radius).toBeGreaterThan(0);
    }
  });

  it("uses known NPCs for every talk and minigame interaction", () => {
    const ids = new Set(ALL_WORLD.npcs.map((n) => n.id));
    for (const interaction of INTERACTIONS.filter((i) => i.kind === "talk" || i.kind === "minigame")) {
      expect(interaction.npcId).toBeDefined();
      expect(ids.has(interaction.npcId!), `${interaction.id}: ${interaction.npcId}`).toBe(true);
    }
  });

  it("keeps the story world unique and covers the thirteen logical NPCs", () => {
    expect(new Set(STORY_WORLD.npcs.map((n) => n.id)).size).toBe(STORY_WORLD.npcs.length);
    for (const id of LOGICAL_NPCS) expect(STORY_WORLD.npcs.some((n) => n.id === id), id).toBe(true);
    for (const npc of NPCS) {
      expect(npc.book).toBe(5);
      expect(NPCS_B01.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B02.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B03.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B04.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(npc.seed).toBe(npc.id);
      expect(Number.isFinite(npc.x) && Number.isFinite(npc.z) && Number.isFinite(npc.rot)).toBe(true);
    }
    expect(NPCS.some((n) => n.id === "papai-noel")).toBe(true);
    expect(OBSTACLES).toHaveLength(NPCS.length);
  });
});

describe("book V state machine", () => {
  it("plays every quest to completion and grants its XP once", () => {
    for (const q of QUESTS) {
      let p = withCompleted(q.prerequisiteIds);
      if (q.prerequisiteIds.length > 0) expect(questStateIn(STORY_CATALOG, EMPTY_PROGRESS, q.id)).toBe("locked");
      expect(questStateIn(STORY_CATALOG, p, q.id)).toBe("available");
      p = applyEventIn(STORY_CATALOG, p, q.id, "accept").progress;
      expect(questStateIn(STORY_CATALOG, p, q.id)).toBe(q.objectiveType === "deliver" ? "ready_to_turn_in" : "active");
      for (const event of q.objectiveEventIds) p = applyEventIn(STORY_CATALOG, p, q.id, event).progress;
      expect(questStateIn(STORY_CATALOG, p, q.id)).toBe("ready_to_turn_in");
      const before = p.xp;
      p = applyEventIn(STORY_CATALOG, p, q.id, "turn-in").progress;
      expect(questStateIn(STORY_CATALOG, p, q.id)).toBe("completed");
      expect(p.xp - before).toBe(q.xp);
      const again = applyEventIn(STORY_CATALOG, p, q.id, "turn-in").progress;
      expect(again.xp).toBe(p.xp);
      expect(again).toBe(p);
    }
  });

  it("does not turn in before the objectives are done", () => {
    const p = applyEventIn(STORY_CATALOG, withCompleted(["b05-c1-01"]), "b05-c1-02", "accept").progress;
    const early = applyEventIn(STORY_CATALOG, p, "b05-c1-02", "turn-in").progress;
    expect(early.xp).toBe(p.xp);
    expect(questStateIn(STORY_CATALOG, early, "b05-c1-02")).toBe("active");
  });
});

describe("book V milestones", () => {
  it("keeps the thresholds and the two rewards", () => {
    expect(MILESTONES.map((m) => [m.chainId, m.order, m.counterKey, m.threshold])).toEqual([
      ["b05-m1", 1, "departures", 1],
      ["b05-m1", 2, "departures", 3],
      ["b05-m1", 3, "departures", 5],
      ["b05-m1", 4, "departures", 8],
      ["b05-m1", 5, "departures", 10],
      ["b05-m1", 6, "departures", 12],
      ["b05-m2", 1, "threads", 1],
      ["b05-m2", 2, "threads", 3],
      ["b05-m2", 3, "threads", 5],
      ["b05-m2", 4, "threads", 8],
      ["b05-m2", 5, "threads", 10],
      ["b05-m2", 6, "threads", 12],
    ]);
    expect(milestone("b05-m1-06").reward).toEqual({ kind: "cosmetic", cosmeticId: "back-travel" });
    expect(milestone("b05-m2-06").reward).toEqual({ kind: "cosmetic", cosmeticId: "back-thread" });
    expect(MILESTONES.filter((m) => m.order < 6).every((m) => m.reward === null)).toBe(true);
  });

  it("settles both chains once", () => {
    const counters = { departures: 12, threads: 12 };
    const first = settleMilestonesIn(STORY_CATALOG, counters, EMPTY_PROGRESS);
    expect(first.completed).toHaveLength(12);
    expect(first.progress.xp).toBe(120);
    expect(settleMilestonesIn(STORY_CATALOG, counters, first.progress).completed).toEqual([]);
  });
});

describe("book V cosmetics", () => {
  it("has six unique entries with three paid and three free", () => {
    expect(COSMETICS).toHaveLength(6);
    expect(COSMETICS.filter((c) => c.unlock.kind === "paid")).toHaveLength(3);
    expect(COSMETICS.filter((c) => c.unlock.kind !== "paid")).toHaveLength(3);
    expect(new Set(COSMETICS_V2.map((c) => c.id)).size).toBe(COSMETICS_V2.length);
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const travel = cosmetic("back-travel");
    const thread = cosmetic("back-thread");
    const book = cosmetic("special-promise-book");
    expect(isUnlockedIn(COSMETICS_V2, travel, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, travel, { ...EMPTY_PROGRESS, completed: { "b05-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, thread, { ...EMPTY_PROGRESS, completed: { "b05-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, book, { ...EMPTY_PROGRESS, completed: { "b05-c3-04": true } })).toBe(true);
    for (const c of COSMETICS.filter((item) => item.unlock.kind === "paid")) {
      expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
    }
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
      const earlier = [...COSMETICS_B01, ...COSMETICS_B02, ...COSMETICS_B03, ...COSMETICS_B04].filter((c) => c.slot === slot).map((c) => c.id);
      const expected = [...earlier, ...ids];
      expect(v2(slot).slice(start, start + expected.length).map((c) => c.id)).toEqual(expected);
    }
  });
});
