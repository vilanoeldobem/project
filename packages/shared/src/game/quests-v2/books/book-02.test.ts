/** Book II: counts, manifest parity, world wiring, state machine, milestones and cosmetics. */
import { describe, expect, it } from "vitest";

import { COSMETICS_V2, isUnlockedIn } from "../../cosmetics-v2";
import { EMPTY_PROGRESS, type Progress } from "../../progress";
import { NPCS as NPCS_V1 } from "../../world";
import { applyEventIn, prerequisitesOf, questStateIn, STORY_CATALOG } from "../catalog";
import { MANIFEST } from "../manifest";
import { settleMilestonesIn } from "../milestones";
import { worldStatesIn } from "../states";
import { ALL_WORLD, STORY_WORLD } from "../world";
import { COSMETICS, INTERACTIONS, MILESTONES, NPCS, OBSTACLES, QUESTS, SPAWNS, STATES } from "./book-02";
import { NPCS as NPCS_B01 } from "./book-01";

const manifest = MANIFEST.filter((entry) => entry.book === 2);
const verse = (id: string) => QUESTS.find((q) => q.id === id)!;
const milestone = (id: string) => MILESTONES.find((m) => m.id === id)!;
const cosmetic = (id: string) => COSMETICS.find((c) => c.id === id)!;
const withCompleted = (ids: readonly string[]): Progress => ({
  ...EMPTY_PROGRESS,
  completed: Object.fromEntries(ids.map((id) => [id, true])),
});

describe("book II catalogue", () => {
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
        if (q.id === "b02-c1-01") expect([...q.prerequisiteIds]).toEqual(["b01-c3-04"]);
        else expect([...q.prerequisiteIds]).toEqual([...entry.prerequisiteIds]);
      }
    }
  });

  it("uses known prerequisites and only the exit leaves the book", () => {
    const ids = new Set(manifest.map((entry) => entry.id));
    for (const q of QUESTS) {
      for (const pre of prerequisitesOf(q)) {
        if (q.id === "b02-c1-01") expect(pre).toBe("b01-c3-04");
        else expect(ids.has(pre), `${q.id} -> ${pre}`).toBe(true);
        expect(pre).not.toBe(q.id);
      }
      expect(q.prerequisiteIds).not.toContain("b02-c3-04");
    }
    expect(prerequisitesOf(verse("b02-c1-01"))).toEqual(["b01-c3-04"]);
  });

  it("applies the region rule", () => {
    for (const q of QUESTS) {
      const workshop = q.id.includes("-c2-") || q.id.includes("-r2-") || q.id === "b02-s3" || q.id === "b02-s4" || q.id === "b02-s5";
      expect(q.region).toBe(workshop ? "oficina-brinquedos" : "jardim-casas");
    }
  });

  it("exports exactly the three world states it turns on", () => {
    expect(STATES).toEqual(["garden-named", "toy-finished", "alba-remembered"]);
    const set = QUESTS.filter((q) => q.worldState !== null);
    expect(set.map((q) => q.id)).toEqual(["b02-c1-04", "b02-c2-04", "b02-c3-04"]);
    expect(new Set(set.map((q) => q.worldState))).toEqual(new Set(STATES));
    const done = withCompleted(["b02-c1-04", "b02-c2-04", "b02-c3-04"]);
    expect(worldStatesIn(STORY_CATALOG, done)).toEqual(new Set(["garden-named", "toy-finished", "alba-remembered"]));
  });
});

describe("book II world wiring", () => {
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
      expect(spawn.book).toBe(2);
    }
    for (const interaction of INTERACTIONS) {
      expect(verse(interaction.questId).objectiveEventIds).toContain(interaction.id);
      expect(interaction.book).toBe(2);
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
    for (const id of ["dona-cida", "pip", "mestre-teo", "lia", "seu-elias", "storyteller", "postmaster", "mestre-anselmo"]) {
      expect(STORY_WORLD.npcs.some((n) => n.id === id), id).toBe(true);
    }
    for (const npc of NPCS) {
      expect(NPCS_B01.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(npc.book).toBe(2);
      expect(npc.seed).toBe(npc.id);
      expect(Number.isFinite(npc.x) && Number.isFinite(npc.z) && Number.isFinite(npc.rot)).toBe(true);
    }
    expect(NPCS.some((n) => n.id === "pip")).toBe(true);
    expect(NPCS.some((n) => n.id === "seu-elias")).toBe(true);
    expect(OBSTACLES).toHaveLength(NPCS.length);
    expect(NPCS_V1.length).toBeGreaterThan(0);
  });
});

describe("book II state machine", () => {
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
    const p = applyEventIn(STORY_CATALOG, withCompleted(["b01-c3-04"]), "b02-c1-01", "accept").progress;
    const early = applyEventIn(STORY_CATALOG, p, "b02-c1-01", "turn-in").progress;
    expect(early.xp).toBe(p.xp);
    expect(questStateIn(STORY_CATALOG, early, "b02-c1-01")).toBe("active");
  });
});

describe("book II milestones", () => {
  it("keeps the thresholds and the two rewards", () => {
    expect(MILESTONES.map((m) => [m.chainId, m.order, m.counterKey, m.threshold])).toEqual([
      ["b02-m1", 1, "houses", 1],
      ["b02-m1", 2, "houses", 5],
      ["b02-m1", 3, "houses", 10],
      ["b02-m1", 4, "houses", 25],
      ["b02-m1", 5, "houses", 50],
      ["b02-m1", 6, "houses", 97],
      ["b02-m2", 1, "memory-wins", 1],
      ["b02-m2", 2, "memory-wins", 5],
      ["b02-m2", 3, "memory-wins", 10],
      ["b02-m2", 4, "memory-wins", 25],
      ["b02-m2", 5, "memory-wins", 50],
      ["b02-m2", 6, "memory-wins", 100],
    ]);
    expect(MILESTONES.filter((m) => m.reward !== null).map((m) => [m.id, m.reward?.cosmeticId])).toEqual([
      ["b02-m1-06", "blouse-garden"],
      ["b02-m2-06", "blouse-quilt"],
    ]);
  });

  it("settles from counters once and is idempotent", () => {
    const first = settleMilestonesIn(STORY_CATALOG, { houses: 1 }, EMPTY_PROGRESS);
    expect(first.completed.map((m) => m.id)).toEqual(["b02-m1-01"]);
    expect(first.progress.xp).toBe(10);
    const second = settleMilestonesIn(STORY_CATALOG, { houses: 97 }, first.progress);
    expect(second.completed).toHaveLength(5);
    expect(second.progress.xp).toBe(60);
    const again = settleMilestonesIn(STORY_CATALOG, { houses: 97 }, second.progress);
    expect(again.completed).toEqual([]);
    const wins = settleMilestonesIn(STORY_CATALOG, { "memory-wins": 100 }, EMPTY_PROGRESS);
    expect(wins.completed.map((m) => m.id)).toEqual(["b02-m2-01", "b02-m2-02", "b02-m2-03", "b02-m2-04", "b02-m2-05", "b02-m2-06"]);
  });
});

describe("book II cosmetics", () => {
  it("keeps six unique entries, three paid and three free", () => {
    expect(COSMETICS).toHaveLength(6);
    expect(new Set(COSMETICS_V2.map((c) => c.id)).size).toBe(COSMETICS_V2.length);
    expect(COSMETICS.filter((c) => c.unlock.kind === "paid")).toHaveLength(3);
    expect(COSMETICS.filter((c) => c.unlock.kind === "mission")).toHaveLength(3);
  });

  it("wires the free rewards to the real milestones and the finale", () => {
    expect(cosmetic("blouse-garden").unlock).toEqual({ kind: "mission", missionId: "b02-m1-06" });
    expect(cosmetic("blouse-quilt").unlock).toEqual({ kind: "mission", missionId: "b02-m2-06" });
    expect(cosmetic("shoes-garden").unlock).toEqual({ kind: "mission", missionId: "b02-c3-04" });
    expect(cosmetic("blouse-garden")).toBe(COSMETICS_V2.find((c) => c.id === "blouse-garden"));
    expect(verse("b02-c3-04").reward).toEqual({ kind: "cosmetic", cosmeticId: "shoes-garden" });
    for (const id of ["blouse-garden", "blouse-quilt", "shoes-garden"]) {
      const c = cosmetic(id);
      expect(isUnlockedIn(COSMETICS_V2, c, EMPTY_PROGRESS)).toBe(false);
    }
    expect(isUnlockedIn(COSMETICS_V2, cosmetic("blouse-garden"), { ...EMPTY_PROGRESS, completed: { "b02-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, cosmetic("blouse-quilt"), { ...EMPTY_PROGRESS, completed: { "b02-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, cosmetic("shoes-garden"), { ...EMPTY_PROGRESS, completed: { "b02-c3-04": true } })).toBe(true);
  });
});
