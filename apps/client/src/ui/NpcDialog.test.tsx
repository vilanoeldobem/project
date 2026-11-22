/** The NPC panel offers, records and turns in through the catalog it receives. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, MISSIONS, type Progress } from "@vila/shared/game/progress";
import type { StoryCatalog, StoryNpc, StoryQuest, StoryWorld } from "@vila/shared/game/quests-v2/types";
import { NpcDialog } from "./NpcDialog";

const quest: StoryQuest = {
  id: "b01-c1-01",
  chainId: "b01-c1",
  chainTitle: "O Sino Mudo",
  order: 1,
  track: "explore",
  title: "A chegada sem sino",
  description: "Fale com Mestre Anselmo.",
  objectiveType: "talk",
  objectKind: "none",
  target: 1,
  unit: "conversa",
  xp: 20,
  giverNpcId: "mestre-anselmo",
  turnInNpcId: "mestre-anselmo",
  dialogue: { offer: "O sino não toca.", turnIn: "A praça acordou." },
  objectiveEventIds: ["talk-anselmo"],
  book: 1,
  chapter: 1,
  region: "praca-grande-arvore",
  kind: "main",
  prerequisiteIds: [],
  worldState: "bell-rung",
  theme: "chegada",
  audience: "todos",
  metricTag: "historia-principal",
  accessibility: "conversa",
  reward: null,
};
const npc: StoryNpc = { id: "mestre-anselmo", name: "Mestre Anselmo", role: "Relojoeiro", seed: "mestre-anselmo", x: 0, z: 0, rot: 0, book: 1, greeting: "O tempo escuta." };
const catalog: StoryCatalog = { quests: [quest], milestones: [], minigames: [], quickMissions: MISSIONS };
const world: StoryWorld = { npcs: [npc], spawns: [], interactions: [], obstacles: [] };
const accepted: Progress = { ...EMPTY_PROGRESS, seen: { "b01-c1-01:accept": true }, counters: { "b01-c1-01": 0 } };
const ready: Progress = { ...accepted, seen: { ...accepted.seen, "b01-c1-01:talk-anselmo": true }, counters: { "b01-c1-01": 1 } };

describe("NpcDialog", () => {
  it("offers an available v2 quest", () => {
    const page = renderToStaticMarkup(<NpcDialog npcId="mestre-anselmo" lots={{}} catalog={catalog} world={world} progress={EMPTY_PROGRESS} />);
    expect(page).toContain("Mestre Anselmo");
    expect(page).toContain("A chegada sem sino");
    expect(page).toContain("Aceitar missão");
    expect(page).toContain("+20 XP");
  });

  it("shows the turn-in when the objective is done", () => {
    const page = renderToStaticMarkup(<NpcDialog npcId="mestre-anselmo" lots={{}} catalog={catalog} world={world} progress={ready} />);
    expect(page).toContain("Concluir missão");
    expect(page).toContain("A praça acordou.");
  });

  it("keeps the v1 postmaster talk copy", () => {
    const v1Catalog: StoryCatalog = { quests: [], milestones: [], minigames: [], quickMissions: MISSIONS };
    v1Catalog.quests = [
      {
        ...quest,
        id: "market-invitations",
        giverNpcId: "market-keeper",
        turnInNpcId: "market-keeper",
        objectiveEventIds: ["talk-postmaster"],
        objectiveDialogue: "Os convites estão prontos? Diga à Dona Filó que o correio já sabe.",
      },
    ];
    const v1World: StoryWorld = {
      npcs: [{ ...npc, id: "postmaster", name: "Seu Nivaldo" }, { ...npc, id: "market-keeper", name: "Dona Filó" }],
      spawns: [],
      interactions: [],
      obstacles: [],
    };
    const progress: Progress = { ...EMPTY_PROGRESS, seen: { "market-invitations:accept": true } };
    const page = renderToStaticMarkup(<NpcDialog npcId="postmaster" lots={{}} catalog={v1Catalog} world={v1World} progress={progress} />);
    expect(page).toContain("Os convites estão prontos?");
    expect(page).toContain("Seu Nivaldo");
  });
});
