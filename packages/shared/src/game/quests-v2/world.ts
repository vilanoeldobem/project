/**
 * Story world aggregate (PROPOSTA). `STORY_WORLD` is books only; the v1 epilogue keeps its own `world.ts`
 * untouched. `V1_WORLD` adapts the five v1 quest NPCs, spawns and interactions to the same shape, and
 * `ALL_WORLD` is the union the UI and the verifier read.
 */
import {
  NPCS as NPCS_V1,
  QUEST_INTERACTIONS as INTERACTIONS_V1,
  QUEST_OBSTACLES as OBSTACLES_V1,
  QUEST_SPAWNS as SPAWNS_V1,
} from "../world";
import * as B00 from "./books/book-00-epilogue";
import * as B01 from "./books/book-01";
import * as B02 from "./books/book-02";
import * as B03 from "./books/book-03";
import * as B04 from "./books/book-04";
import * as B05 from "./books/book-05";
import * as B06 from "./books/book-06";
import * as B07 from "./books/book-07";
import * as B08 from "./books/book-08";
import * as B09 from "./books/book-09";
import * as B10 from "./books/book-10";
import type { StoryWorld } from "./types";

const BOOKS = [B00, B01, B02, B03, B04, B05, B06, B07, B08, B09, B10] as const;

export const V1_WORLD: StoryWorld = {
  npcs: NPCS_V1.map((npc) => ({ ...npc, book: 0 })),
  spawns: SPAWNS_V1.map((spawn) => ({ ...spawn, book: 0 })),
  interactions: INTERACTIONS_V1.map((interaction) => ({ ...interaction, book: 0, kind: "prop" as const })),
  obstacles: OBSTACLES_V1,
};

export const STORY_WORLD: StoryWorld = {
  npcs: BOOKS.flatMap((book) => book.NPCS),
  spawns: BOOKS.flatMap((book) => book.SPAWNS),
  interactions: BOOKS.flatMap((book) => book.INTERACTIONS),
  obstacles: BOOKS.flatMap((book) => book.OBSTACLES),
};

export const ALL_WORLD: StoryWorld = {
  npcs: [...V1_WORLD.npcs, ...STORY_WORLD.npcs],
  spawns: [...V1_WORLD.spawns, ...STORY_WORLD.spawns],
  interactions: [...V1_WORLD.interactions, ...STORY_WORLD.interactions],
  obstacles: [...V1_WORLD.obstacles, ...STORY_WORLD.obstacles],
};

export const STORY_NPC_IDS: ReadonlySet<string> = new Set(STORY_WORLD.npcs.map((npc) => npc.id));
export const STORY_OBJECT_IDS: ReadonlySet<string> = new Set([
  ...STORY_WORLD.spawns.map((spawn) => spawn.objectId),
  ...STORY_WORLD.interactions.map((interaction) => interaction.objectId),
]);
