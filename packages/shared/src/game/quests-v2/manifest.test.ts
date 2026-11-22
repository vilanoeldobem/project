/** The canonical index: 484 entries, the per-book splits, the XP totals and the region rule. */
import { describe, expect, it } from "vitest";

import { MISSIONS } from "../progress";
import { QUESTS } from "../quests";
import { STORY_CATALOG } from "./catalog";
import { MANIFEST, MANIFEST_BY_ID, MANIFEST_IDS } from "./manifest";
import { REGIONS } from "./types";

const PAIR: Record<number, readonly [string, string]> = {
  1: ["praca-grande-arvore", "mercado-panetone"],
  2: ["jardim-casas", "oficina-brinquedos"],
  3: ["colina-correio", "campanario"],
  4: ["bosque-pinheiros", "lago-espelho"],
  5: ["estacao-treno", "casa-fio-vale-vento-branco"],
  6: ["vila-amanhecer", "estrada-orvalho"],
  7: ["ponte-gelo", "vale-ecos"],
  8: ["jardim-sol", "mercado-estacoes"],
  9: ["pedra-fundamental", "arquivo-neves"],
  10: ["torre-tempo", "praca-nova-noite"],
};

const expectedRegion = (id: string, book: number, prereqs: readonly string[]) => {
  const pair = PAIR[book];
  if (/-c1-|-c3-|-r1-/.test(id) || /-m1-/.test(id)) return pair[0];
  if (/-c2-|-r2-/.test(id) || /-m2-/.test(id)) return pair[1];
  return prereqs.some((p) => p.includes("-c2-")) ? pair[1] : pair[0];
};

describe("manifest", () => {
  it("has the 484 canonical entries and their split", () => {
    expect(MANIFEST).toHaveLength(484);
    expect(MANIFEST_IDS.size).toBe(484);
    expect(MANIFEST_BY_ID.size).toBe(484);
    for (const book of PAIR ? Object.keys(PAIR).map(Number) : []) {
      const entries = MANIFEST.filter((entry) => entry.book === book);
      expect(entries).toHaveLength(45);
      expect(entries.filter((entry) => entry.kind === "main")).toHaveLength(12);
      expect(entries.filter((entry) => entry.kind === "regional")).toHaveLength(16);
      expect(entries.filter((entry) => entry.kind === "side")).toHaveLength(5);
      expect(entries.filter((entry) => entry.kind === "milestone")).toHaveLength(12);
    }
    expect(MANIFEST.filter((entry) => entry.kind === "epilogue")).toHaveLength(18);
    expect(MANIFEST.filter((entry) => entry.kind === "postgame")).toHaveLength(12);
    expect(MANIFEST.filter((entry) => entry.kind === "quick")).toHaveLength(4);
  });

  it("has the canonical XP, and 11,315 without the three bough entries", () => {
    expect(MANIFEST.reduce((xp, entry) => xp + entry.xp, 0)).toBe(11400);
    const withoutBough = MANIFEST.filter((entry) => !entry.id.startsWith("bough-")).reduce((xp, entry) => xp + entry.xp, 0);
    expect(withoutBough).toBe(11315);
    expect(MANIFEST.filter((entry) => entry.id.startsWith("bough-")).reduce((xp, entry) => xp + entry.xp, 0)).toBe(85);
  });

  it("has only known prerequisites and every status is pending", () => {
    for (const entry of MANIFEST) {
      expect(entry.status).toBe("pending");
      for (const prerequisite of entry.prerequisiteIds) {
        expect(MANIFEST_IDS.has(prerequisite)).toBe(true);
        expect(prerequisite).not.toBe(entry.id);
      }
    }
  });

  it("uses the region rule for every book entry and a known region elsewhere", () => {
    const known = new Set(REGIONS.map((region) => region.id));
    for (const entry of MANIFEST) {
      if (entry.book >= 1) {
        expect(entry.region).toBe(expectedRegion(entry.id, entry.book, entry.prerequisiteIds));
      } else if (entry.kind === "epilogue") {
        expect(entry.region === null ? false : known.has(entry.region)).toBe(true);
      } else {
        expect(entry.region).toBeNull();
      }
    }
  });

  it("keeps every implemented catalog id in the manifest", () => {
    for (const quest of STORY_CATALOG.quests) expect(MANIFEST_IDS.has(quest.id)).toBe(true);
    for (const milestone of STORY_CATALOG.milestones) expect(MANIFEST_IDS.has(milestone.id)).toBe(true);
    for (const mission of STORY_CATALOG.quickMissions) expect(MANIFEST_IDS.has(mission.id)).toBe(true);
    for (const mission of MISSIONS) expect(MANIFEST_IDS.has(mission.id)).toBe(true);
    for (const quest of QUESTS) expect(MANIFEST_IDS.has(quest.id)).toBe(true);
  });

  it("allows only the bough entries to be absent from the current v1 epilogue", () => {
    const manifestEpilogue = new Set(MANIFEST.filter((entry) => entry.kind === "epilogue").map((entry) => entry.id));
    const actual = new Set(QUESTS.map((quest) => quest.id));
    for (const id of actual) expect(manifestEpilogue.has(id)).toBe(true);
    const absent = [...manifestEpilogue].filter((id) => !actual.has(id)).sort();
    expect(absent).toEqual(QUESTS.some((quest) => quest.id === "bough-ribbon") ? [] : ["bough-delivery", "bough-ribbon", "bough-sprigs"]);
  });
});
