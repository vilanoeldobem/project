/** Book VI: counts, manifest parity, world wiring, state machine, milestones and cosmetics. */
import { describe, expect, it } from "vitest";

import { COSMETICS as COSMETICS_V1 } from "../../cosmetics";
import { COSMETICS_V2, isUnlockedIn } from "../../cosmetics-v2";
import { EMPTY_PROGRESS, type Progress } from "../../progress";
import { applyEventIn, prerequisitesOf, questStateIn, STORY_CATALOG } from "../catalog";
import { MANIFEST } from "../manifest";
import { settleMilestonesIn } from "../milestones";
import { worldStatesIn } from "../states";
import { ALL_WORLD, STORY_WORLD } from "../world";
import { NPCS as NPCS_B01 } from "./book-01";
import { NPCS as NPCS_B02 } from "./book-02";
import { NPCS as NPCS_B03 } from "./book-03";
import { NPCS as NPCS_B04 } from "./book-04";
import { NPCS as NPCS_B05 } from "./book-05";
import { COSMETICS, INTERACTIONS, MILESTONES, NPCS, OBSTACLES, QUESTS, SPAWNS, STATES } from "./book-06";

const manifest = MANIFEST.filter((entry) => entry.book === 6);
const verse = (id: string) => QUESTS.find((q) => q.id === id)!;
const milestone = (id: string) => MILESTONES.find((m) => m.id === id)!;
const cosmetic = (id: string) => COSMETICS.find((c) => c.id === id)!;
const withCompleted = (ids: readonly string[]): Progress => ({
  ...EMPTY_PROGRESS,
  completed: Object.fromEntries(ids.map((id) => [id, true])),
});
const LOGICAL_NPCS = [
  "storyteller",
  "seu-elias",
  "tia-bete",
  "dona-sol",
  "horacio",
  "luzia",
  "seu-caminho",
  "lila",
];

describe("book VI catalogue", () => {
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
    const ids = new Set([...manifest.map((entry) => entry.id), "b05-c3-04"]);
    for (const q of QUESTS) {
      for (const pre of prerequisitesOf(q)) {
        expect(ids.has(pre), `${q.id} -> ${pre}`).toBe(true);
        expect(pre).not.toBe(q.id);
      }
      expect(q.prerequisiteIds).not.toContain("b06-c3-04");
    }
    expect(prerequisitesOf(verse("b06-c1-01"))).toEqual(["b05-c3-04"]);
  });

  it("applies the region rule", () => {
    for (const q of QUESTS) {
      const expected = /-c1-|-c3-|-r1-/.test(q.id)
        ? "vila-amanhecer"
        : /-c2-|-r2-/.test(q.id)
          ? "estrada-orvalho"
          : q.prerequisiteIds.some((pre) => pre.includes("-c2-"))
            ? "estrada-orvalho"
            : "vila-amanhecer";
      expect(q.region, q.id).toBe(expected);
    }
    expect(MILESTONES.filter((m) => m.chainId === "b06-m1").every((m) => m.region === "vila-amanhecer")).toBe(true);
    expect(MILESTONES.filter((m) => m.chainId === "b06-m2").every((m) => m.region === "estrada-orvalho")).toBe(true);
  });

  it("exports exactly the two world states it turns on", () => {
    expect(STATES).toEqual(["dawn-bell", "dew-road"]);
    const set = QUESTS.filter((q) => q.worldState !== null);
    expect(set.map((q) => q.id)).toEqual(["b06-c1-03", "b06-c2-04", "b06-r1-08", "b06-r2-08"]);
    expect(new Set(set.map((q) => q.worldState))).toEqual(new Set(STATES));
    const done = withCompleted(["b06-c1-03", "b06-c2-04", "b06-r1-08", "b06-r2-08"]);
    expect(worldStatesIn(STORY_CATALOG, done)).toEqual(new Set(STATES));
  });
});

describe("book VI world wiring", () => {
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
      expect(spawn.book).toBe(6);
    }
    for (const interaction of INTERACTIONS) {
      expect(verse(interaction.questId).objectiveEventIds).toContain(interaction.id);
      expect(interaction.book).toBe(6);
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

  it("keeps the story world unique and covers the eight logical NPCs", () => {
    expect(new Set(STORY_WORLD.npcs.map((n) => n.id)).size).toBe(STORY_WORLD.npcs.length);
    for (const id of LOGICAL_NPCS) expect(STORY_WORLD.npcs.some((n) => n.id === id), id).toBe(true);
    for (const npc of NPCS) {
      expect(npc.book).toBe(6);
      expect(NPCS_B01.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B02.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B03.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B04.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B05.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(npc.seed).toBe(npc.id);
      expect(Number.isFinite(npc.x) && Number.isFinite(npc.z) && Number.isFinite(npc.rot)).toBe(true);
    }
    expect(OBSTACLES).toHaveLength(NPCS.length);
  });
});

describe("book VI state machine", () => {
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
    const p = applyEventIn(STORY_CATALOG, withCompleted(["b06-c1-01"]), "b06-c1-02", "accept").progress;
    const early = applyEventIn(STORY_CATALOG, p, "b06-c1-02", "turn-in").progress;
    expect(early.xp).toBe(p.xp);
    expect(questStateIn(STORY_CATALOG, early, "b06-c1-02")).toBe("active");
  });
});

describe("book VI milestones", () => {
  it("keeps the thresholds and the two rewards", () => {
    expect(MILESTONES.map((m) => [m.chainId, m.order, m.counterKey, m.threshold])).toEqual([
      ["b06-m1", 1, "mornings", 1],
      ["b06-m1", 2, "mornings", 2],
      ["b06-m1", 3, "mornings", 4],
      ["b06-m1", 4, "mornings", 6],
      ["b06-m1", 5, "mornings", 8],
      ["b06-m1", 6, "mornings", 10],
      ["b06-m2", 1, "dew-footprints", 1],
      ["b06-m2", 2, "dew-footprints", 3],
      ["b06-m2", 3, "dew-footprints", 5],
      ["b06-m2", 4, "dew-footprints", 8],
      ["b06-m2", 5, "dew-footprints", 10],
      ["b06-m2", 6, "dew-footprints", 12],
    ]);
    expect(milestone("b06-m1-06").reward).toEqual({ kind: "cosmetic", cosmeticId: "dress-dawn" });
    expect(milestone("b06-m2-06").reward).toEqual({ kind: "cosmetic", cosmeticId: "hand-left-map" });
    expect(MILESTONES.filter((m) => m.order < 6).every((m) => m.reward === null)).toBe(true);
  });

  it("settles both chains once", () => {
    const counters = { mornings: 12, "dew-footprints": 12 };
    const first = settleMilestonesIn(STORY_CATALOG, counters, EMPTY_PROGRESS);
    expect(first.completed).toHaveLength(12);
    expect(first.progress.xp).toBe(120);
    expect(settleMilestonesIn(STORY_CATALOG, counters, first.progress).completed).toEqual([]);
  });
});

describe("book VI cosmetics", () => {
  it("has six unique entries with three paid and three free", () => {
    expect(COSMETICS).toHaveLength(6);
    expect(COSMETICS.filter((c) => c.unlock.kind === "paid")).toHaveLength(3);
    expect(COSMETICS.filter((c) => c.unlock.kind !== "paid")).toHaveLength(3);
    expect(new Set(COSMETICS_V2.map((c) => c.id)).size).toBe(COSMETICS_V2.length);
  });

  it("unlocks the free items from their real milestones and mission", () => {
    const dress = cosmetic("dress-dawn");
    const map = cosmetic("hand-left-map");
    const pants = cosmetic("pants-lantern");
    expect(isUnlockedIn(COSMETICS_V2, dress, EMPTY_PROGRESS)).toBe(false);
    expect(isUnlockedIn(COSMETICS_V2, dress, { ...EMPTY_PROGRESS, completed: { "b06-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, map, { ...EMPTY_PROGRESS, completed: { "b06-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, pants, { ...EMPTY_PROGRESS, completed: { "b06-c3-04": true } })).toBe(true);
    for (const c of COSMETICS.filter((item) => item.unlock.kind === "paid")) {
      expect(isUnlockedIn(COSMETICS_V2, c, { ...EMPTY_PROGRESS, xp: 100_000 })).toBe(false);
    }
  });

  it("appends after the v1 prefix of each slot", () => {
    const ids = new Set(COSMETICS.map((c) => c.id));
    expect(COSMETICS_V2.filter((c) => ids.has(c.id)).map((c) => c.id)).toEqual(COSMETICS.map((c) => c.id));
    for (const slot of ["dress", "handLeft", "pants", "back"] as const) {
      const v1 = COSMETICS_V1.filter((c) => c.slot === slot);
      expect(COSMETICS_V2.filter((c) => c.slot === slot).slice(0, v1.length)).toEqual(v1);
    }
  });
});
