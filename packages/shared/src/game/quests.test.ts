/**
 * Contract for the quest catalog (PROPOSTA quests-v1; DEC-039..042, PEN-025): counts, CSV sync with
 * `content/proposals/quests-v1`, and the pure state machine shared by the client and the API.
 */
import { describe, expect, it } from "vitest";

import { applyEvent, EMPTY_PROGRESS, levelOf, MISSIONS, type Progress } from "./progress";
import { activeInventory, activeQuest, canAccept, CHAIN_TITLES, NPC_IDS, QUESTS, questProgress, questState } from "./quests";
import { LOTS, NPCS, QUEST_INTERACTIONS, QUEST_SPAWNS } from "./world";

/** Minimal CSV parser: quoted fields, "" escapes, CRLF tolerated, BOM stripped. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.filter((r) => r.some((c) => c !== "")).map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ""])));
}

const CSV_DIR = "../../../../content/proposals/quests-v1";
const csvFiles = import.meta.glob("../../../../content/proposals/quests-v1/*.csv", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
const csvTable = (name: string) => {
  const key = Object.keys(csvFiles).find((p) => p.endsWith(`/${name}`));
  if (!key) throw new Error(`${name} not reachable from ${CSV_DIR}`);
  return parseCsv(csvFiles[key]);
};

const apply = (p: Progress, questId: string, ...events: string[]) => events.reduce((acc, e) => applyEvent(acc, questId, e).progress, p);

describe("catalog integrity", () => {
  it("has 15 quests with unique ids", () => {
    expect(QUESTS).toHaveLength(15);
    expect(new Set(QUESTS.map((q) => q.id)).size).toBe(15);
  });

  it("has 5 chains of orders 1, 2, 3 with the published titles", () => {
    expect(Object.keys(CHAIN_TITLES)).toHaveLength(5);
    for (const [chainId, title] of Object.entries(CHAIN_TITLES)) {
      const chain = QUESTS.filter((q) => q.chainId === chainId);
      expect(chain.map((q) => q.order).sort()).toEqual([1, 2, 3]);
      for (const q of chain) expect(q.chainTitle).toBe(title);
    }
  });

  it("gives exactly 3 quests per NPC and keeps prerequisites linear", () => {
    for (const npc of NPC_IDS) expect(QUESTS.filter((q) => q.giverNpcId === npc)).toHaveLength(3);
    for (const chainId of Object.keys(CHAIN_TITLES)) {
      const chain = QUESTS.filter((q) => q.chainId === chainId).sort((a, b) => a.order - b.order);
      expect(chain[0].prerequisiteId).toBeUndefined();
      expect(chain[1].prerequisiteId).toBe(chain[0].id);
      expect(chain[2].prerequisiteId).toBe(chain[1].id);
    }
  });

  it("keeps XP in the allowed set, finales at 50 and the total at 465", () => {
    expect(new Set(QUESTS.map((q) => q.xp))).toEqual(new Set([15, 20, 25, 30, 50]));
    for (const q of QUESTS.filter((x) => x.order === 3)) expect(q.xp).toBe(50);
    expect(QUESTS.reduce((sum, q) => sum + q.xp, 0)).toBe(465);
    expect(MISSIONS.reduce((sum, m) => sum + m.xp, 0)).toBe(110);
  });

  it("covers the track and objective-type distribution", () => {
    const track = (t: string) => QUESTS.filter((q) => q.track === t).length;
    expect([track("explore"), track("play"), track("causes")]).toEqual([8, 4, 3]);
    const type = (t: string) => QUESTS.filter((q) => q.objectiveType === t).length;
    expect(["talk", "collect", "deliver", "visit", "read", "minigame", "interact"].map(type)).toEqual([1, 3, 3, 2, 1, 3, 2]);
  });

  it("uses 8 unique objects in 9 quests", () => {
    const objectIds = QUESTS.filter((q) => q.objectKind !== "none").map((q) => q.objectId);
    expect(QUESTS.filter((q) => q.objectId).length).toBe(9);
    expect(new Set(objectIds).size).toBe(8);
    for (const q of QUESTS) if (q.objectKind !== "none") expect(q.objectName).toBeTruthy();
  });

  it("has copy and dialogue on every quest", () => {
    for (const q of QUESTS) {
      expect(q.title.length).toBeGreaterThan(0);
      expect(q.description.length).toBeGreaterThan(0);
      expect(q.unit.length).toBeGreaterThan(0);
      expect(q.dialogue.offer.length).toBeGreaterThan(0);
      expect(q.dialogue.turnIn.length).toBeGreaterThan(0);
    }
  });
});

describe("catalog matches content/proposals/quests-v1", () => {
  it("matches every quests.csv field", () => {
    const rows = csvTable("quests.csv");
    expect(rows).toHaveLength(15);
    for (const row of rows) {
      const quest = QUESTS.find((q) => q.id === row.missao_id);
      expect(quest, row.missao_id).toBeTruthy();
      if (!quest) continue;
      expect(quest.chainId).toBe(row.cadeia_id);
      expect(quest.order).toBe(Number(row.ordem));
      expect(quest.title).toBe(row.titulo_missao);
      expect(quest.description).toBe(row.descricao_missao);
      expect(quest.track).toBe(row.trilha);
      expect(quest.objectiveType).toBe(row.tipo_objetivo);
      expect(quest.objectKind).toBe(row.tipo_objeto);
      expect(quest.objectName ?? "").toBe(row.nome_objeto);
      expect(quest.objectId ?? "").toBe(row.objeto_id);
      expect(quest.xp).toBe(Number(row.xp));
      expect(quest.giverNpcId).toBe(row.npc_ativacao);
      expect(quest.turnInNpcId).toBe(row.npc_entrega);
      expect(quest.prerequisiteId ?? "").toBe(row.prerequisito_id);
      // Item quantity is 0 for objectives that carry no object: the counter target is at least 1.
      expect(quest.target).toBe(Math.max(1, Number(row.qtd_objetos)));
    }
  });

  it("matches npcs.csv and dialogues.csv", () => {
    const npcs = csvTable("npcs.csv");
    expect(npcs).toHaveLength(5);
    for (const row of npcs) {
      const placed = NPCS.find((n) => n.id === row.npc_id);
      expect(placed, row.npc_id).toBeTruthy();
      if (!placed) continue;
      expect(placed.name).toBe(row.nome);
      expect(placed.role).toBe(row.papel);
      expect(placed.seed).toBe(row.semente);
      if (row.cadeia_id) expect(CHAIN_TITLES[row.cadeia_id]).toBe(row.titulo_cadeia);
    }
    const dialogues = csvTable("dialogues.csv");
    expect(dialogues).toHaveLength(15);
    for (const row of dialogues) {
      const quest = QUESTS.find((q) => q.id === row.missao_id);
      expect(quest, row.missao_id).toBeTruthy();
      expect(quest?.dialogue.offer).toBe(row.fala_oferta);
      expect(quest?.dialogue.turnIn).toBe(row.fala_entrega);
    }
  });
});

describe("world coverage", () => {
  it("spawns and interactions cover every collect and interact objective", () => {
    const ids = new Set([...QUEST_SPAWNS.map((s) => s.id), ...QUEST_INTERACTIONS.map((i) => i.id)]);
    for (const quest of QUESTS.filter((q) => q.objectiveType === "collect" || q.objectiveType === "interact"))
      for (const eventId of quest.objectiveEventIds) expect(ids.has(eventId), `${quest.id}:${eventId}`).toBe(true);
    expect(new Set(QUEST_SPAWNS.map((s) => s.id)).size).toBe(QUEST_SPAWNS.length);
    for (const spawn of [...QUEST_SPAWNS, ...QUEST_INTERACTIONS]) expect(QUESTS.some((q) => q.id === spawn.questId)).toBe(true);
  });

  it("newest-house-visit accepts every published lot id", () => {
    const quest = QUESTS.find((q) => q.id === "newest-house-visit");
    expect(quest?.objectiveEventIds).toEqual(LOTS.map((l) => l.id));
    expect(quest?.target).toBe(1);
    expect(quest?.needsPublishedLot).toBe(true);
  });

  it("every quest accepts accept and turn-in", () => {
    for (const q of QUESTS) expect(q.objectiveEventIds).not.toContain("accept");
  });
});

describe("quest state machine", () => {
  it("starts with one available quest per chain", () => {
    expect(questState(EMPTY_PROGRESS, "harness-bells")).toBe("available");
    expect(questState(EMPTY_PROGRESS, "route-memory-game")).toBe("locked");
    expect(questState(EMPTY_PROGRESS, "charm-for-the-flight")).toBe("locked");
    expect(activeQuest(EMPTY_PROGRESS)).toBeUndefined();
    expect(activeInventory(EMPTY_PROGRESS)).toEqual([]);
    expect(questState(EMPTY_PROGRESS, "unknown-quest")).toBe("locked");
  });

  it("runs harness-bells from accept to turn-in", () => {
    let p = apply(EMPTY_PROGRESS, "harness-bells", "accept");
    expect(questState(p, "harness-bells")).toBe("active");
    expect(p.xp).toBe(0);
    expect(questProgress(p, "harness-bells")).toEqual({ count: 0, target: 2 });

    p = apply(p, "harness-bells", "bell-pine-north", "bell-pine-north");
    expect(p.counters["harness-bells"]).toBe(1);
    expect(activeInventory(p)).toEqual([{ objectId: "reindeer-bell", name: "Sino do arreio", count: 1, target: 2, questId: "harness-bells" }]);
    expect(p.xp).toBe(0);

    p = apply(p, "harness-bells", "turn-in");
    expect(p.completed["harness-bells"]).toBeUndefined();
    expect(p.xp).toBe(0);

    p = apply(p, "harness-bells", "bell-pine-east");
    expect(questState(p, "harness-bells")).toBe("ready_to_turn_in");
    expect(p.xp).toBe(0);

    p = apply(p, "harness-bells", "turn-in");
    expect(questState(p, "harness-bells")).toBe("completed");
    expect(p.xp).toBe(20);
    expect(activeInventory(p)).toEqual([]);
    expect(activeQuest(p)).toBeUndefined();
    expect(questState(p, "route-memory-game")).toBe("available");
    expect(apply(p, "harness-bells", "turn-in").xp).toBe(20);
  });

  it("routes a minigame win only to the active minigame quest", () => {
    let p = apply(EMPTY_PROGRESS, "route-memory-game", "memory-win");
    expect(p).toBe(EMPTY_PROGRESS);

    p = apply(EMPTY_PROGRESS, "harness-bells", "accept");
    p = apply(p, "route-memory-game", "memory-win");
    expect(p.counters["route-memory-game"]).toBeUndefined();

    p = apply(EMPTY_PROGRESS, "harness-bells", "accept", "bell-pine-north", "bell-pine-east", "turn-in");
    p = apply(p, "route-memory-game", "accept");
    p = apply(p, "route-memory-game", "memory-win");
    expect(questState(p, "route-memory-game")).toBe("ready_to_turn_in");
    expect(p.counters["route-memory-game"]).toBe(1);
    expect(questState(p, "market-lucky-game")).toBe("locked");
    expect(p.counters["market-lucky-game"]).toBeUndefined();
  });

  it("refuses a second active quest", () => {
    const p = apply(EMPTY_PROGRESS, "harness-bells", "accept");
    expect(canAccept(p, "market-invitations")).toBe(false);
    const ignored = apply(p, "market-invitations", "accept");
    expect(ignored.seen["market-invitations:accept"]).toBeUndefined();
    expect(activeQuest(ignored)?.id).toBe("harness-bells");
    expect(canAccept(ignored, "market-invitations")).toBe(false);
  });

  it("makes deliver quests ready on accept and carries the item", () => {
    let p = apply(EMPTY_PROGRESS, "harness-bells", "accept", "bell-pine-north", "bell-pine-east", "turn-in");
    p = apply(p, "route-memory-game", "accept", "memory-win", "turn-in");
    expect(p.xp).toBe(50);
    expect(questState(p, "charm-for-the-flight")).toBe("available");

    p = apply(p, "charm-for-the-flight", "accept");
    expect(questState(p, "charm-for-the-flight")).toBe("ready_to_turn_in");
    expect(activeInventory(p)).toEqual([{ objectId: "lucky-charm", name: "Patuá da sorte", count: 1, target: 1, questId: "charm-for-the-flight" }]);

    p = apply(p, "charm-for-the-flight", "turn-in");
    expect(p.xp).toBe(100);
    expect(levelOf(p.xp)).toBe(2);
    expect(activeInventory(p)).toEqual([]);
    expect(activeQuest(p)).toBeUndefined();
  });

  it("grants no quest XP for a donation or a read while locked", () => {
    // The quick mission keeps its own 20 XP (unchanged); no quest is completed or advanced by donating.
    const donated = apply(EMPTY_PROGRESS, "causes-global-donation", "panel");
    expect(donated.xp).toBe(20);
    expect(Object.keys(donated.completed)).toEqual(["causes-global-donation"]);
    expect(QUESTS.some((q) => donated.completed[q.id])).toBe(false);
    expect(activeQuest(donated)).toBeUndefined();
    const read = apply(EMPTY_PROGRESS, "donation-promise-reading", "read-confirm");
    expect(read.xp).toBe(0);
    expect(read.seen["donation-promise-reading:read-confirm"]).toBeUndefined();
  });

  it("keeps the four quick missions unchanged", () => {
    let p = apply(EMPTY_PROGRESS, "explore-gifts", "gift-bench", "gift-palm");
    expect(p.xp).toBe(30);
    p = apply(p, "play-memory", "win");
    expect(p.xp).toBe(70);
    p = apply(p, "causes-visit-lot", "plaza-01");
    expect(p.xp).toBe(90);
    p = apply(p, "causes-global-donation", "panel");
    expect(p.xp).toBe(110);
    expect(questState(p, "harness-bells")).toBe("available");
  });

  it("replays the whole 465 XP log in any order without exceeding 465", () => {
    const log: Array<[string, string]> = QUESTS.flatMap((q) => [
      [q.id, "accept"] as [string, string],
      ...q.objectiveEventIds.map((e) => [q.id, e] as [string, string]),
      [q.id, "turn-in"] as [string, string],
    ]);
    const replay = (events: Array<[string, string]>) => events.reduce((p, [m, e]) => applyEvent(p, m, e).progress, EMPTY_PROGRESS);
    expect(replay(log).xp).toBe(465);
    expect(replay([...log, ...log]).xp).toBe(465);
    expect(replay([...log].reverse()).xp).toBeLessThanOrEqual(465);

    // Deterministic permutations: the counters are recomputed from `seen`, so no order can over-grant.
    let seed = 7;
    for (let round = 0; round < 5; round++) {
      const shuffled = [...log];
      for (let i = shuffled.length - 1; i > 0; i--) {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff;
        const j = seed % (i + 1);
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      expect(replay(shuffled).xp).toBeLessThanOrEqual(465);
    }
  });

  it("completes all 15 quests in chain order", () => {
    let p = EMPTY_PROGRESS;
    let xp = 0;
    for (const chainId of Object.keys(CHAIN_TITLES)) {
      const chain = QUESTS.filter((q) => q.chainId === chainId).sort((a, b) => a.order - b.order);
      for (const q of chain) {
        expect(questState(p, q.id)).toBe("available");
        p = apply(p, q.id, "accept");
        for (const eventId of q.objectiveEventIds) {
          if (q.objectiveType === "collect") expect(questState(p, q.id)).toBe("active");
          p = apply(p, q.id, eventId);
        }
        expect(questState(p, q.id)).toBe("ready_to_turn_in");
        p = apply(p, q.id, "turn-in");
        xp += q.xp;
        expect(p.xp).toBe(xp);
      }
    }
    expect(p.xp).toBe(465);
    expect(Object.keys(p.completed).sort()).toEqual(QUESTS.map((q) => q.id).sort());
  });
});
