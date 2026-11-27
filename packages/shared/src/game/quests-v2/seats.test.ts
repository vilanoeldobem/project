/**
 * Seats of the story cast (IMPL-0037): every `talk` target stands at its character, the nine moved characters
 * keep apart from each other and from every other character, and no seat falls outside the village.
 */
import { describe, expect, it } from "vitest";

import { WORLD_RADIUS } from "../world";
import { STORY_SEATS } from "./seats";
import type { StoryNpc } from "./types";
import { STORY_WORLD, V1_WORLD } from "./world";

const uniqueNpcs = (): StoryNpc[] => {
  const seen = new Map<string, StoryNpc>();
  for (const npc of [...V1_WORLD.npcs, ...STORY_WORLD.npcs]) if (!seen.has(npc.id)) seen.set(npc.id, npc);
  return [...seen.values()];
};

describe("story seats", () => {
  it("keeps every seat finite, apart and inside the village", () => {
    const seats = Object.entries(STORY_SEATS);
    expect(seats).toHaveLength(9);
    for (const [id, seat] of seats) {
      expect(Number.isFinite(seat.x), id).toBe(true);
      expect(Number.isFinite(seat.z), id).toBe(true);
      expect(Number.isFinite(seat.rot), id).toBe(true);
      expect(Math.hypot(seat.x, seat.z), id).toBeLessThan(WORLD_RADIUS);
    }
    for (let a = 0; a < seats.length; a++) {
      for (let b = a + 1; b < seats.length; b++) {
        expect(Math.hypot(seats[a][1].x - seats[b][1].x, seats[a][1].z - seats[b][1].z), `${seats[a][0]}/${seats[b][0]}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("keeps every character at least 2 u from every other character", () => {
    const npcs = uniqueNpcs();
    for (let a = 0; a < npcs.length; a++) {
      for (let b = a + 1; b < npcs.length; b++) {
        expect(Math.hypot(npcs[a].x - npcs[b].x, npcs[a].z - npcs[b].z), `${npcs[a].id}/${npcs[b].id}`).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("stands every talk target at its character", () => {
    for (const interaction of STORY_WORLD.interactions) {
      if (interaction.kind !== "talk" || !interaction.npcId) continue;
      const npc = STORY_WORLD.npcs.find((entry) => entry.id === interaction.npcId);
      expect(npc, `${interaction.id}: ${interaction.npcId}`).toBeDefined();
      expect(Math.abs(npc!.x - interaction.x), interaction.id).toBeLessThanOrEqual(0.01);
      expect(Math.abs(npc!.z - interaction.z), interaction.id).toBeLessThanOrEqual(0.01);
      expect(interaction.radius, interaction.id).toBe(4.5);
    }
  });
});
