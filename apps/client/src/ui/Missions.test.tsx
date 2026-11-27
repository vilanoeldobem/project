/** The mission log renders the v1 default unchanged and the catalog/progress props drive a v2 book. */
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { EMPTY_PROGRESS, MISSIONS, type Progress } from "@vila/shared/game/progress";
import { EPILOGUE_FINAL_QUESTS, V1_CATALOG } from "@vila/shared/game/quests-v2/catalog";
import type { StoryCatalog, StoryNpc, StoryQuest, StoryWorld } from "@vila/shared/game/quests-v2/types";
import { V1_WORLD } from "@vila/shared/game/quests-v2/world";
import { Missions } from "./Missions";

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
const npc: StoryNpc = { id: "mestre-anselmo", name: "Mestre Anselmo", role: "Relojoeiro", seed: "mestre-anselmo", x: 0, z: 0, rot: 0, book: 1 };
const catalog: StoryCatalog = {
  quests: [quest],
  milestones: [
    {
      id: "b01-m1-06",
      book: 1,
      chainId: "b01-m1",
      order: 6,
      title: "Promessas",
      counterKey: "missions",
      threshold: 150,
      xp: 10,
      reward: { kind: "cosmetic", cosmeticId: "helmet-star" },
      region: "praca-grande-arvore",
    },
  ],
  minigames: [],
  quickMissions: MISSIONS,
};
const world: StoryWorld = { npcs: [npc], spawns: [], interactions: [], obstacles: [] };

describe("Missions", () => {
  it("renders the v2 categories, next step and milestone thresholds", () => {
    const page = renderToStaticMarkup(<Missions catalog={catalog} world={world} progress={EMPTY_PROGRESS} stories />);
    expect(page).toContain("História principal");
    expect(page).toContain("A chegada sem sino");
    expect(page).toContain("Próximo passo:");
    expect(page).toContain("Mestre Anselmo");
    expect(page).toContain("Marcos");
    expect(page).toContain("Promessas");
    expect(page).toContain("0/150");
  });

  it("lists every open quest, its progress and the ready hand-in", () => {
    const progress: Progress = {
      ...EMPTY_PROGRESS,
      seen: {
        "harness-bells:accept": true,
        "harness-bells:bell-pine-north": true,
        "harness-bells:bell-pine-east": true,
        "lake-lanterns:accept": true,
        "lake-lanterns:lantern-lake-1": true,
      },
      counters: { "harness-bells": 2, "lake-lanterns": 1 },
    };
    const page = renderToStaticMarkup(<Missions catalog={V1_CATALOG} world={V1_WORLD} progress={progress} />);
    expect(page).toContain("Em andamento");
    expect(page).toContain("Sinos do arreio");
    expect(page).toContain("Lanternas sob a neve");
    expect(page).toContain("Pronta para entregar a");
    expect(page).toContain("Na bolsa: 1/2 Lanterna do lago.");
  });

  it("shows a first-use empty state with a way back to the village", () => {
    const page = renderToStaticMarkup(<Missions catalog={V1_CATALOG} world={V1_WORLD} progress={EMPTY_PROGRESS} />);
    expect(page).toContain("Nenhuma missão em andamento");
    expect(page).toContain("Voltar à Vila");
  });

  it("keeps the v1 chains and the Epílogo heading", () => {
    const page = renderToStaticMarkup(<Missions catalog={V1_CATALOG} world={V1_WORLD} progress={EMPTY_PROGRESS} stories />);
    expect(page).toContain("Epílogo");
    expect(page).toContain("A Noite de Voo");
    expect(page).toContain("Sinos do arreio");
  });

  it("offers the final scene only after the six epilogue chains", () => {
    const done: Progress = {
      ...EMPTY_PROGRESS,
      completed: Object.fromEntries(EPILOGUE_FINAL_QUESTS.map((id) => [id, true] as const)),
    };
    const ready = renderToStaticMarkup(<Missions catalog={V1_CATALOG} world={V1_WORLD} progress={done} stories />);
    expect(ready).toContain("Ver a cena final");
    const locked = renderToStaticMarkup(<Missions catalog={V1_CATALOG} world={V1_WORLD} progress={EMPTY_PROGRESS} stories />);
    expect(locked).not.toContain("Ver a cena final");
  });

  it("can hide the quest groups for a quick-missions-only embed", () => {
    const page = renderToStaticMarkup(<Missions stories={false} />);
    expect(page).toContain("Missões da Vila");
    expect(page).toContain("Caderno de Missões");
    expect(page).not.toContain("Epílogo");
    expect(page).not.toContain("História principal");
  });
});
