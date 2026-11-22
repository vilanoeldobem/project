/**
 * Parametric quest state machine (PROPOSTA; the v1 engine in `../quests.ts` stays untouched and is the
 * parity oracle). Every function receives the catalog, so the client, the API and the tests share exactly
 * one implementation for v1 epilogue quests and v2 book quests.
 *
 * Rules copied from v1:
 * - one active quest at a time (`activeQuestIn` returns the first active/ready entry);
 * - a quest needs every prerequisite completed, then `accept`, then its objectives, then `turn-in`;
 * - a `deliver` quest is ready as soon as it is accepted (the item exists by derivation);
 * - only a valid transition writes `seen`; XP is granted once, at `turn-in`;
 * - quick missions are order-independent and handled first, exactly like v1 `applyEvent`.
 */
import type { ApplyResult, Mission, Progress } from "../progress";
import type { InventoryItem, QuestState } from "../quests";
import type { CatalogQuest, StoryCatalog } from "./types";

const seenKey = (questId: string, eventId: string) => `${questId}:${eventId}`;

/** v1 uses `prerequisiteId`; v2 uses `prerequisiteIds`. Both merge here. */
export const prerequisitesOf = (q: CatalogQuest): readonly string[] => {
  const many = "prerequisiteIds" in q ? q.prerequisiteIds : undefined;
  if (many && many.length > 0) return many;
  return q.prerequisiteId ? [q.prerequisiteId] : [];
};

const questById = (catalog: StoryCatalog, id: string): CatalogQuest | undefined =>
  catalog.quests.find((q) => q.id === id);

export function questStateIn(catalog: StoryCatalog, p: Progress, questId: string): QuestState {
  const quest = questById(catalog, questId);
  if (!quest) return "locked";
  if (p.completed[questId]) return "completed";
  if (prerequisitesOf(quest).some((id) => !p.completed[id])) return "locked";
  if (!p.seen[seenKey(questId, "accept")]) return "available";
  if (quest.objectiveType === "deliver") return "ready_to_turn_in";
  const seen = quest.objectiveEventIds.filter((id) => p.seen[seenKey(questId, id)]).length;
  return seen >= quest.target ? "ready_to_turn_in" : "active";
}

/** The single quest that is `active` or `ready_to_turn_in`, if any. */
export function activeQuestIn(catalog: StoryCatalog, p: Progress): CatalogQuest | undefined {
  return catalog.quests.find((q) => {
    const state = questStateIn(catalog, p, q.id);
    return state === "active" || state === "ready_to_turn_in";
  });
}

/** `available` and no other quest in progress. */
export function canAcceptIn(catalog: StoryCatalog, p: Progress, questId: string): boolean {
  return questStateIn(catalog, p, questId) === "available" && activeQuestIn(catalog, p) === undefined;
}

export function questProgressIn(catalog: StoryCatalog, p: Progress, questId: string): { count: number; target: number } {
  const quest = questById(catalog, questId);
  if (!quest) return { count: 0, target: 0 };
  if (p.completed[questId]) return { count: quest.target, target: quest.target };
  if (!p.seen[seenKey(questId, "accept")]) return { count: 0, target: quest.target };
  if (quest.objectiveType === "deliver") return { count: 1, target: quest.target };
  const seen = quest.objectiveEventIds.filter((id) => p.seen[seenKey(questId, id)]).length;
  return { count: Math.min(seen, quest.target), target: quest.target };
}

/** Quest items carried by the active/ready quest, derived from progress. */
export function activeInventoryIn(catalog: StoryCatalog, p: Progress): InventoryItem[] {
  const items: InventoryItem[] = [];
  for (const quest of catalog.quests) {
    if (quest.objectKind !== "quest_item" || !quest.objectId || !quest.objectName) continue;
    const state = questStateIn(catalog, p, quest.id);
    if (state !== "active" && state !== "ready_to_turn_in") continue;
    const count = quest.objectiveType === "deliver" ? 1 : questProgressIn(catalog, p, quest.id).count;
    if (count > 0) items.push({ objectId: quest.objectId, name: quest.objectName, count, target: quest.target, questId: quest.id });
  }
  return items;
}

function applyQuickEvent(p: Progress, mission: Mission, eventId: string): ApplyResult {
  const key = `${mission.id}:${eventId}`;
  if (p.seen[key] || p.completed[mission.id]) return { progress: p };
  const count = Math.min((p.counters[mission.id] ?? 0) + 1, mission.target);
  const done = count >= mission.target;
  return {
    progress: {
      xp: done ? p.xp + mission.xp : p.xp,
      counters: { ...p.counters, [mission.id]: count },
      completed: done ? { ...p.completed, [mission.id]: true } : p.completed,
      seen: { ...p.seen, [key]: true },
    },
    completed: done ? mission : undefined,
  };
}

function applyQuestEvent(catalog: StoryCatalog, p: Progress, quest: CatalogQuest, eventId: string): ApplyResult {
  if (eventId === "accept") {
    if (questStateIn(catalog, p, quest.id) !== "available" || !canAcceptIn(catalog, p, quest.id)) return { progress: p };
    return {
      progress: {
        ...p,
        counters: { ...p.counters, [quest.id]: quest.objectiveType === "deliver" ? 1 : 0 },
        seen: { ...p.seen, [seenKey(quest.id, "accept")]: true },
      },
    };
  }
  if (eventId === "turn-in") {
    if (questStateIn(catalog, p, quest.id) !== "ready_to_turn_in") return { progress: p };
    return {
      progress: {
        xp: p.xp + quest.xp,
        counters: { ...p.counters, [quest.id]: quest.target },
        completed: { ...p.completed, [quest.id]: true },
        seen: { ...p.seen, [seenKey(quest.id, "turn-in")]: true },
      },
      completed: quest,
    };
  }
  if (!quest.objectiveEventIds.includes(eventId) || questStateIn(catalog, p, quest.id) !== "active") return { progress: p };
  const seen: Record<string, true> = { ...p.seen, [seenKey(quest.id, eventId)]: true };
  const count = Math.min(quest.objectiveEventIds.filter((id) => seen[seenKey(quest.id, id)]).length, quest.target);
  return { progress: { ...p, counters: { ...p.counters, [quest.id]: count }, seen } };
}

/** Applies a quick mission, a v1 epilogue quest or a v2 book quest. Pure and idempotent per event. */
export function applyEventIn(catalog: StoryCatalog, p: Progress, missionId: string, eventId: string): ApplyResult {
  const key = `${missionId}:${eventId}`;
  const quick = catalog.quickMissions.find((m) => m.id === missionId);
  if (quick) return applyQuickEvent(p, quick, eventId);
  const quest = questById(catalog, missionId);
  if (!quest || p.seen[key] || p.completed[missionId]) return { progress: p };
  return applyQuestEvent(catalog, p, quest, eventId);
}
