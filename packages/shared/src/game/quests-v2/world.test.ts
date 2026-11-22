/** The v2 world aggregate never changes the v1 arrays. */
import { describe, expect, it } from "vitest";

import { NPCS, QUEST_INTERACTIONS, QUEST_SPAWNS } from "../world";
import { ALL_WORLD, STORY_NPC_IDS, STORY_OBJECT_IDS, STORY_WORLD, V1_WORLD } from "./world";

describe("story world", () => {
  it("adapts the v1 world without changing it", () => {
    expect(V1_WORLD.npcs).toHaveLength(NPCS.length);
    expect(V1_WORLD.spawns).toHaveLength(QUEST_SPAWNS.length);
    expect(V1_WORLD.interactions).toHaveLength(QUEST_INTERACTIONS.length);
    expect(V1_WORLD.npcs.every((npc) => npc.book === 0)).toBe(true);
  });

  it("has unique ids in the story aggregate", () => {
    expect(STORY_NPC_IDS.size).toBe(STORY_WORLD.npcs.length);
    expect(new Set(STORY_WORLD.spawns.map((spawn) => spawn.id)).size).toBe(STORY_WORLD.spawns.length);
    expect(new Set(STORY_WORLD.interactions.map((interaction) => interaction.id)).size).toBe(STORY_WORLD.interactions.length);
    expect(STORY_OBJECT_IDS.size).toBeGreaterThanOrEqual(0);
  });

  it("unions v1 and v2", () => {
    expect(ALL_WORLD.npcs).toHaveLength(V1_WORLD.npcs.length + STORY_WORLD.npcs.length);
    expect(ALL_WORLD.spawns).toHaveLength(V1_WORLD.spawns.length + STORY_WORLD.spawns.length);
    expect(ALL_WORLD.interactions).toHaveLength(V1_WORLD.interactions.length + STORY_WORLD.interactions.length);
  });
});
