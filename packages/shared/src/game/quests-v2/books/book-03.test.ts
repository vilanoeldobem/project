/** Book III: counts, manifest parity, world wiring, state machine, milestones and cosmetics. */
import { describe, expect, it } from "vitest";

import { COSMETICS_V2, isUnlockedIn } from "../../cosmetics-v2";
import { EMPTY_PROGRESS, type Progress } from "../../progress";
import { applyEventIn, prerequisitesOf, questStateIn, STORY_CATALOG } from "../catalog";
import { MANIFEST } from "../manifest";
import { settleMilestonesIn } from "../milestones";
import { worldStatesIn } from "../states";
import { ALL_WORLD, STORY_WORLD } from "../world";
import { NPCS as NPCS_B01 } from "./book-01";
import { NPCS as NPCS_B02 } from "./book-02";
import { COSMETICS, INTERACTIONS, MILESTONES, NPCS, OBSTACLES, QUESTS, SPAWNS, STATES } from "./book-03";

const manifest = MANIFEST.filter((entry) => entry.book === 3);
const verse = (id: string) => QUESTS.find((q) => q.id === id)!;
const milestone = (id: string) => MILESTONES.find((m) => m.id === id)!;
const cosmetic = (id: string) => COSMETICS.find((c) => c.id === id)!;
const withCompleted = (ids: readonly string[]): Progress => ({
  ...EMPTY_PROGRESS,
  completed: Object.fromEntries(ids.map((id) => [id, true])),
});
const LOGICAL_NPCS = ["storyteller", "postmaster", "market-keeper", "mestre-anselmo", "nina", "dona-cida", "seu-elias", "tomas"];

describe("book III catalogue", () => {
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
    const ids = new Set([...manifest.map((entry) => entry.id), "b02-c3-04"]);
    for (const q of QUESTS) {
      for (const pre of prerequisitesOf(q)) {
        expect(ids.has(pre), `${q.id} -> ${pre}`).toBe(true);
        expect(pre).not.toBe(q.id);
      }
      expect(q.prerequisiteIds).not.toContain("b03-c3-04");
    }
    expect(prerequisitesOf(verse("b03-c1-01"))).toEqual(["b02-c3-04"]);
  });

  it("applies the region rule", () => {
    for (const q of QUESTS) {
      const expected = /-c1-|-c3-|-r1-/.test(q.id)
        ? "colina-correio"
        : /-c2-|-r2-/.test(q.id)
          ? "campanario"
          : q.prerequisiteIds.some((pre) => pre.includes("-c2-"))
            ? "campanario"
            : "colina-correio";
      expect(q.region, q.id).toBe(expected);
    }
    expect(MILESTONES.filter((m) => m.chainId === "b03-m1").every((m) => m.region === "colina-correio")).toBe(true);
    expect(MILESTONES.filter((m) => m.chainId === "b03-m2").every((m) => m.region === "campanario")).toBe(true);
  });

  it("exports exactly the three world states it turns on", () => {
    expect(STATES).toEqual(["mail-sorted", "clock-running", "postman-named"]);
    const set = QUESTS.filter((q) => q.worldState !== null);
    expect(set.map((q) => q.id)).toEqual(["b03-c1-04", "b03-c2-04", "b03-c3-04"]);
    expect(new Set(set.map((q) => q.worldState))).toEqual(new Set(STATES));
    const done = withCompleted(["b03-c1-04", "b03-c2-04", "b03-c3-04"]);
    expect(worldStatesIn(STORY_CATALOG, done)).toEqual(new Set(["mail-sorted", "clock-running", "postman-named"]));
  });
});

describe("book III world wiring", () => {
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
      expect(spawn.book).toBe(3);
    }
    for (const interaction of INTERACTIONS) {
      expect(verse(interaction.questId).objectiveEventIds).toContain(interaction.id);
      expect(interaction.book).toBe(3);
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
      expect(npc.book).toBe(3);
      expect(NPCS_B01.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(NPCS_B02.some((other) => other.id === npc.id), npc.id).toBe(false);
      expect(npc.seed).toBe(npc.id);
      expect(Number.isFinite(npc.x) && Number.isFinite(npc.z) && Number.isFinite(npc.rot)).toBe(true);
    }
    expect(NPCS.some((n) => n.id === "tomas")).toBe(true);
    expect(OBSTACLES).toHaveLength(NPCS.length);
  });
});

describe("book III state machine", () => {
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
    const p = applyEventIn(STORY_CATALOG, withCompleted(["b03-c1-01"]), "b03-c1-02", "accept").progress;
    const early = applyEventIn(STORY_CATALOG, p, "b03-c1-02", "turn-in").progress;
    expect(early.xp).toBe(p.xp);
    expect(questStateIn(STORY_CATALOG, early, "b03-c1-02")).toBe("active");
  });
});

describe("book III milestones", () => {
  it("keeps the thresholds and the two rewards", () => {
    expect(MILESTONES.map((m) => [m.chainId, m.order, m.counterKey, m.threshold])).toEqual([
      ["b03-m1", 1, "letters", 1],
      ["b03-m1", 2, "letters", 5],
      ["b03-m1", 3, "letters", 10],
      ["b03-m1", 4, "letters", 25],
      ["b03-m1", 5, "letters", 50],
      ["b03-m1", 6, "letters", 100],
      ["b03-m2", 1, "bells", 1],
      ["b03-m2", 2, "bells", 3],
      ["b03-m2", 3, "bells", 5],
      ["b03-m2", 4, "bells", 7],
      ["b03-m2", 5, "bells", 9],
      ["b03-m2", 6, "bells", 10],
    ]);
    expect(MILESTONES.filter((m) => m.reward !== null).map((m) => [m.id, m.reward?.cosmeticId])).toEqual([
      ["b03-m1-06", "back-postbag"],
      ["b03-m2-06", "helmet-bell"],
    ]);
  });

  it("settles from counters once and is idempotent", () => {
    const first = settleMilestonesIn(STORY_CATALOG, { letters: 1 }, EMPTY_PROGRESS);
    expect(first.completed.filter((m) => m.chainId === "b03-m1").map((m) => m.id)).toEqual(["b03-m1-01"]);
    const second = settleMilestonesIn(STORY_CATALOG, { letters: 100 }, first.progress);
    expect(second.completed.filter((m) => m.chainId === "b03-m1")).toHaveLength(5);
    const again = settleMilestonesIn(STORY_CATALOG, { letters: 100 }, second.progress);
    expect(again.completed).toEqual([]);
    const bells = settleMilestonesIn(STORY_CATALOG, { bells: 10 }, EMPTY_PROGRESS);
    expect(bells.completed.filter((m) => m.chainId === "b03-m2").map((m) => m.id)).toEqual([
      "b03-m2-01",
      "b03-m2-02",
      "b03-m2-03",
      "b03-m2-04",
      "b03-m2-05",
      "b03-m2-06",
    ]);
  });
});

describe("book III cosmetics", () => {
  it("keeps six unique entries, three paid and three free", () => {
    expect(COSMETICS).toHaveLength(6);
    expect(new Set(COSMETICS_V2.map((c) => c.id)).size).toBe(COSMETICS_V2.length);
    expect(COSMETICS.filter((c) => c.unlock.kind === "paid")).toHaveLength(3);
    expect(COSMETICS.filter((c) => c.unlock.kind === "mission")).toHaveLength(3);
  });

  it("wires the free rewards to the real milestones and the finale", () => {
    expect(cosmetic("back-postbag").unlock).toEqual({ kind: "mission", missionId: "b03-m1-06" });
    expect(cosmetic("helmet-bell").unlock).toEqual({ kind: "mission", missionId: "b03-m2-06" });
    expect(cosmetic("blouse-post").unlock).toEqual({ kind: "mission", missionId: "b03-c3-04" });
    expect(cosmetic("back-postbag")).toBe(COSMETICS_V2.find((c) => c.id === "back-postbag"));
    expect(verse("b03-c3-04").reward).toEqual({ kind: "cosmetic", cosmeticId: "blouse-post" });
    for (const id of ["back-postbag", "helmet-bell", "blouse-post"]) {
      const c = cosmetic(id);
      expect(isUnlockedIn(COSMETICS_V2, c, EMPTY_PROGRESS)).toBe(false);
    }
    expect(isUnlockedIn(COSMETICS_V2, cosmetic("back-postbag"), { ...EMPTY_PROGRESS, completed: { "b03-m1-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, cosmetic("helmet-bell"), { ...EMPTY_PROGRESS, completed: { "b03-m2-06": true } })).toBe(true);
    expect(isUnlockedIn(COSMETICS_V2, cosmetic("blouse-post"), { ...EMPTY_PROGRESS, completed: { "b03-c3-04": true } })).toBe(true);
  });
});
