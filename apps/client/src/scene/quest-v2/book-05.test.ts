/** Book V reachability: every NPC, pickup and interaction stands on walkable ground. */
import { describe, expect, it } from "vitest";

import { AVATAR_RADIUS, clearance } from "@vila/shared/game/collision";
import { TREE_KEEP_OUT } from "@vila/shared/game/world";
import { STORY_CATALOG } from "@vila/shared/game/quests-v2/catalog";
import { INTERACTIONS, NPCS, OBSTACLES, SPAWNS } from "@vila/shared/game/quests-v2/books/book-05";
import { ALL_WORLD, STORY_WORLD } from "@vila/shared/game/quests-v2/world";

import { sceneColliders } from "../sceneColliders";
import { storyProp } from "../gen/quest-v2/catalog";

const staticColliders = sceneColliders(new Set<string>(), false, false);
const npc = (id: string) => ALL_WORLD.npcs.find((n) => n.id === id)!;

describe("book V world", () => {
  it("has one collider per story NPC and no prop collider", () => {
    expect(OBSTACLES).toHaveLength(NPCS.length);
    for (const n of NPCS) expect(OBSTACLES.some((c) => Math.abs(c.x - n.x) < 1e-9 && Math.abs(c.z - n.z) < 1e-9)).toBe(true);
    expect(sceneColliders(new Set<string>(), false, true)).toHaveLength(staticColliders.length + STORY_WORLD.obstacles.length);
  });

  it("keeps every NPC and pickup clear of the static scene", () => {
    for (const n of NPCS) expect(clearance(staticColliders, n.x, n.z, 0.75), n.id).toBeGreaterThanOrEqual(0);
    for (const s of SPAWNS) expect(clearance(staticColliders, s.x, s.z, AVATAR_RADIUS), s.id).toBeGreaterThanOrEqual(0);
    for (const i of INTERACTIONS) expect(clearance(staticColliders, i.x, i.z, AVATAR_RADIUS), i.id).toBeGreaterThanOrEqual(0);
  });

  it("keeps NPCs from overlapping each other", () => {
    for (let a = 0; a < NPCS.length; a++) {
      for (let b = a + 1; b < NPCS.length; b++) {
        expect(Math.hypot(NPCS[a].x - NPCS[b].x, NPCS[a].z - NPCS[b].z), `${NPCS[a].id}/${NPCS[b].id}`).toBeGreaterThan(1.2);
      }
    }
  });

  it("keeps every objective outside the tree and on its target", () => {
    for (const s of SPAWNS) expect(Math.hypot(s.x, s.z), s.id).toBeGreaterThanOrEqual(TREE_KEEP_OUT + 0.05);
    for (const i of INTERACTIONS) {
      expect(Math.hypot(i.x, i.z), i.id).toBeGreaterThanOrEqual(TREE_KEEP_OUT + 0.05);
      if (i.kind === "talk") {
        const target = npc(i.npcId!);
        expect(Math.abs(target.x - i.x), i.id).toBeLessThanOrEqual(0.01);
        expect(Math.abs(target.z - i.z), i.id).toBeLessThanOrEqual(0.01);
        expect(i.radius).toBe(4.5);
      } else if (i.kind === "minigame") {
        expect(i.radius).toBe(4);
      } else {
        expect(i.radius).toBe(3);
      }
    }
  });

  it("links every story record to its quest and to a real model", () => {
    for (const spawn of SPAWNS) {
      expect(spawn.book).toBe(5);
      expect(STORY_CATALOG.quests.find((q) => q.id === spawn.questId)?.objectiveEventIds).toContain(spawn.id);
      expect(storyProp(spawn.objectId), spawn.objectId).toBeDefined();
    }
    for (const interaction of INTERACTIONS) {
      expect(interaction.book).toBe(5);
      expect(STORY_CATALOG.quests.find((q) => q.id === interaction.questId)?.objectiveEventIds).toContain(interaction.id);
      if (interaction.objectId !== "none") expect(storyProp(interaction.objectId), interaction.objectId).toBeDefined();
    }
  });

  it("contains every giver and turn-in in the union world", () => {
    const ids = new Set(ALL_WORLD.npcs.map((n) => n.id));
    for (const q of STORY_CATALOG.quests.filter((q) => "book" in q && q.book === 5)) {
      expect(ids.has(q.giverNpcId), q.id).toBe(true);
      expect(ids.has(q.turnInNpcId), q.id).toBe(true);
    }
  });
});
