/**
 * Missions and XP (P14, DEC-039/040/042). Invariants:
 * - every event has a unique id and is processed once (idempotency);
 * - a completed mission grants its XP once;
 * - a donation alone grants no XP (no mission in this slice involves donating);
 * - levels are reachable without donating.
 * The mission set and the XP curve are a PROPOSAL (doc 22; PEN-025).
 * `title`, `unit` and track labels are user-facing copy and stay in pt-BR.
 *
 * `applyEvent` has two paths that share `Progress`: the four quick missions below (unchanged behaviour)
 * and the quest catalog in `./quests` (accept → objectives → turn-in). The server and the client both
 * replay events through this function, in any order, with the same input and output.
 */
import type { Quest } from "./quests";
import { canAccept, QUESTS, questState } from "./quests";

export type Track = "explore" | "play" | "causes";

export interface Mission {
  id: string;
  track: Track;
  title: string;
  target: number;
  unit: string;
  xp: number;
}

export const MISSIONS: Mission[] = [
  { id: "explore-gifts", track: "explore", title: "Encontre 2 presentes escondidos na praça", target: 2, unit: "presentes", xp: 30 },
  { id: "play-memory", track: "play", title: "Complete o Jogo da Memória", target: 1, unit: "partida", xp: 40 },
  { id: "causes-visit-lot", track: "causes", title: "Visite um terreno e conheça o cadastro de ONGs", target: 1, unit: "terreno", xp: 20 },
  { id: "causes-global-donation", track: "causes", title: "Entenda como funciona a doação global", target: 1, unit: "leitura", xp: 20 },
];

export const TRACK_LABEL: Record<Track, string> = {
  explore: "Explorar",
  play: "Brincar",
  causes: "Conhecer causas",
};

export interface Progress {
  xp: number;
  counters: Record<string, number>;
  completed: Record<string, true>;
  /** Ids of events already processed (`missionId:eventId`). */
  seen: Record<string, true>;
}

export const EMPTY_PROGRESS: Progress = { xp: 0, counters: {}, completed: {}, seen: {} };

export const XP_PER_LEVEL = 100;

export const levelOf = (xp: number) => Math.floor(xp / XP_PER_LEVEL) + 1;

export interface ApplyResult {
  progress: Progress;
  /** Mission completed by this event, if any. */
  completed?: Mission;
}

const questById = new Map(QUESTS.map((q) => [q.id, q]));

/** Quest path: only a valid transition stores its event; anything else leaves progress untouched. */
function applyQuestEvent(p: Progress, quest: Quest, eventId: string): ApplyResult {
  if (eventId === "accept") {
    if (questState(p, quest.id) !== "available" || !canAccept(p, quest.id)) return { progress: p };
    return {
      progress: {
        ...p,
        counters: { ...p.counters, [quest.id]: quest.objectiveType === "deliver" ? 1 : 0 },
        seen: { ...p.seen, [`${quest.id}:accept`]: true },
      },
    };
  }
  if (eventId === "turn-in") {
    if (questState(p, quest.id) !== "ready_to_turn_in") return { progress: p };
    return {
      progress: {
        xp: p.xp + quest.xp,
        counters: { ...p.counters, [quest.id]: quest.target },
        completed: { ...p.completed, [quest.id]: true },
        seen: { ...p.seen, [`${quest.id}:turn-in`]: true },
      },
      completed: quest,
    };
  }
  if (!quest.objectiveEventIds.includes(eventId) || questState(p, quest.id) !== "active") return { progress: p };
  const seen: Record<string, true> = { ...p.seen, [`${quest.id}:${eventId}`]: true };
  const count = Math.min(quest.objectiveEventIds.filter((id) => seen[`${quest.id}:${id}`]).length, quest.target);
  return { progress: { ...p, counters: { ...p.counters, [quest.id]: count }, seen } };
}

/** Applies a mission or quest event. Pure and idempotent per `eventId`. */
export function applyEvent(p: Progress, missionId: string, eventId: string): ApplyResult {
  const mission = MISSIONS.find((m) => m.id === missionId);
  const key = `${missionId}:${eventId}`;
  if (!mission) {
    const quest = questById.get(missionId);
    if (!quest || p.seen[key] || p.completed[missionId]) return { progress: p };
    return applyQuestEvent(p, quest, eventId);
  }
  if (p.seen[key] || p.completed[missionId]) return { progress: p };
  const count = Math.min((p.counters[missionId] ?? 0) + 1, mission.target);
  const done = count >= mission.target;
  return {
    progress: {
      xp: done ? p.xp + mission.xp : p.xp,
      counters: { ...p.counters, [missionId]: count },
      completed: done ? { ...p.completed, [missionId]: true } : p.completed,
      seen: { ...p.seen, [key]: true },
    },
    completed: done ? mission : undefined,
  };
}
