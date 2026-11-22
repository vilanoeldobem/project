/**
 * Milestones (PROPOSTA): a milestone has no accept and no turn-in. Its state is derived from a real counter
 * supplied by the caller; when the counter reaches the threshold the milestone grants XP once and is recorded
 * in `Progress.completed` (the same map quests use, so the cosmetic unlock rule sees it).
 */
import type { Progress } from "../progress";
import type { CounterKey, Milestone, StoryCatalog } from "./types";

export type Counters = Readonly<Partial<Record<CounterKey, number>>>;
export type MilestoneState = "locked" | "ready" | "completed";

const milestoneById = (catalog: StoryCatalog, id: string): Milestone | undefined =>
  catalog.milestones.find((m) => m.id === id);

export function milestoneStateIn(catalog: StoryCatalog, counters: Counters, p: Progress, id: string): MilestoneState {
  const milestone = milestoneById(catalog, id);
  if (!milestone) return "locked";
  if (p.completed[id]) return "completed";
  return (counters[milestone.counterKey] ?? 0) >= milestone.threshold ? "ready" : "locked";
}

export function milestoneProgressIn(catalog: StoryCatalog, counters: Counters, id: string): { value: number; threshold: number } {
  const milestone = milestoneById(catalog, id);
  if (!milestone) return { value: 0, threshold: 0 };
  return { value: counters[milestone.counterKey] ?? 0, threshold: milestone.threshold };
}

/** Marks every ready milestone completed and adds its XP once. Never accepts or turns in a quest. */
export function settleMilestonesIn(catalog: StoryCatalog, counters: Counters, p: Progress): { progress: Progress; completed: Milestone[] } {
  let xp = p.xp;
  let completed = p.completed;
  const done: Milestone[] = [];
  for (const milestone of catalog.milestones) {
    if (completed[milestone.id]) continue;
    if ((counters[milestone.counterKey] ?? 0) < milestone.threshold) continue;
    xp += milestone.xp;
    completed = { ...completed, [milestone.id]: true };
    done.push(milestone);
  }
  return done.length > 0 ? { progress: { ...p, xp, completed }, completed: done } : { progress: p, completed: [] };
}
