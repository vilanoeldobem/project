/** Book III, O Tempo e as Cartas (session 03). Empty until that slice fills it. */
import type { Collider } from "../../collision";
import type { Cosmetic } from "../../cosmetics";
import type { Milestone, StoryInteraction, StoryNpc, StoryQuest, StorySpawn, WorldStateId } from "../types";

export const QUESTS: StoryQuest[] = [];
export const MILESTONES: Milestone[] = [];
export const NPCS: StoryNpc[] = [];
export const SPAWNS: StorySpawn[] = [];
export const INTERACTIONS: StoryInteraction[] = [];
export const OBSTACLES: Collider[] = [];
export const STATES: readonly WorldStateId[] = [];
export const COSMETICS: Cosmetic[] = [];
