/** A world state is on exactly when the quest that changes it is completed. */
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, MISSIONS, type Progress } from "../progress";
import { worldStateOnIn, worldStatesIn } from "./states";
import type { StoryCatalog, StoryQuest } from "./types";

const quest: StoryQuest = {
  id: "state-quest",
  chainId: "state",
  chainTitle: "Estado",
  order: 1,
  track: "explore",
  title: "Estado",
  description: "Teste.",
  objectiveType: "collect",
  objectKind: "none",
  target: 1,
  unit: "peça",
  xp: 20,
  giverNpcId: "npc",
  turnInNpcId: "npc",
  dialogue: { offer: "Oferta.", turnIn: "Entrega." },
  objectiveEventIds: ["event"],
  book: 1,
  chapter: 1,
  region: "praca-grande-arvore",
  kind: "main",
  prerequisiteIds: [],
  worldState: "bell-rung",
  theme: "chegada",
  audience: "todos",
  metricTag: "historia-principal",
  accessibility: "coleta",
  reward: null,
};
const catalog: StoryCatalog = { quests: [quest], milestones: [], minigames: [], quickMissions: MISSIONS };
const done: Progress = { ...EMPTY_PROGRESS, completed: { "state-quest": true } };

describe("world states", () => {
  it("turns on only after the quest is completed", () => {
    expect(worldStateOnIn(catalog, EMPTY_PROGRESS, "bell-rung")).toBe(false);
    expect(worldStateOnIn(catalog, done, "bell-rung")).toBe(true);
    expect([...worldStatesIn(catalog, done)]).toEqual(["bell-rung"]);
  });

  it("does not invent a state", () => {
    expect(worldStateOnIn(catalog, done, "lake-lit")).toBe(false);
  });
});
