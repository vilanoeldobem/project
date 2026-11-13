/**
 * Which interactive thing the avatar is next to: the one target behind the HUD's contextual action (pure, no
 * allocation per call; `scene/Player.tsx` asks every frame).
 *
 * Order of the kinds: quest NPC, quest interaction, donation lectern, the tree and a lot of the square compete
 * by distance, with the listed order breaking near ties (`beats`); a shop door, a billboard or a residential
 * plot is offered only when none of those is in reach.
 *
 * Two rules keep the action from flickering on the long residential streets (IMPL-0024):
 *
 * - **A residential plot is offered only to an avatar that stands still.** Every plot of a row is a target, and
 *   their reaches overlap along a street: offered on the move, a walk down a street was a strip of prompts
 *   switching from one front to the next. Shops, billboards, lots, the tree and NPCs are offered on the move
 *   as before.
 * - **Hysteresis.** The target on offer stays while the avatar is within its reach plus `NEARBY_KEEP`, unless
 *   something of a kind that ranks before it comes into reach or another target of its kind is clearly closer.
 *   The button no longer drops for a frame on the edge of a reach or between two neighbours.
 */
import type { Progress } from "@vila/shared/game/progress";
import { questState } from "@vila/shared/game/quests";
import {
  BILLBOARDS,
  DONATION_PANEL,
  INTERACT_DISTANCE,
  LOT_INTERACT_DISTANCE,
  LOTS,
  NPCS,
  PLACE_INTERACT_DISTANCE,
  QUEST_INTERACTIONS,
  RESIDENTIAL_PLOTS,
  SHOPS,
  TREE_RADIUS,
} from "@vila/shared/game/world";

import type { Nearby } from "./store";

/** How far beyond its reach a target that is on offer stays on offer. */
export const NEARBY_KEEP = 0.6;
/** A target of the same kind replaces the one on offer only when it is this much closer. */
export const NEARBY_SWITCH = 0.5;
/** A residential plot is offered below this speed (u/s) and stays on offer below `PLOT_KEEP_SPEED`: standing still. */
export const PLOT_STILL_SPEED = 0.2;
export const PLOT_KEEP_SPEED = 0.6;

/** Interaction targets, built once: picking one allocates nothing. */
const NEAR_NPC: Nearby[] = NPCS.map((n) => ({ kind: "npc", npcId: n.id }));
const NEAR_QUEST: Nearby[] = QUEST_INTERACTIONS.map((i) => ({ kind: "quest", interactionId: i.id }));
const NEAR_LOT: Nearby[] = LOTS.map((l) => ({ kind: "lot", lotId: l.id }));
const NEAR_PANEL: Nearby = { kind: "donation-panel" };
const NEAR_TREE: Nearby = { kind: "tree" };
/** Places of the expanded village: where each one is used from. Shops and billboards first, then the plots. */
const PLACES: Array<{ x: number; z: number; near: NonNullable<Nearby> }> = [
  ...SHOPS.map((s) => ({ x: s.door.x, z: s.door.z, near: { kind: "shop" as const, shopId: s.id } })),
  ...BILLBOARDS.map((b) => ({ x: b.point.x, z: b.point.z, near: { kind: "billboard" as const, billboardId: b.id } })),
  ...RESIDENTIAL_PLOTS.map((p) => ({ x: p.front.x, z: p.front.z, near: { kind: "plot" as const, plotId: p.id } })),
];
const FIRST_PLOT = SHOPS.length + BILLBOARDS.length;
const PLACE_OF = new Map<unknown, number>(PLACES.map((p, i) => [p.near, i]));
const LOT_OF = new Map<unknown, number>(NEAR_LOT.map((n, i) => [n, i]));
const NPC_OF = new Map<unknown, number>(NEAR_NPC.map((n, i) => [n, i]));
const QUEST_OF = new Map<unknown, number>(NEAR_QUEST.map((n, i) => [n, i]));

/** Smallest centre distance wins; targets within 0.5 of each other fall back to the priority order. */
const beats = (dist: number, prio: number, best: Nearby, bestDist: number, bestPrio: number) =>
  !best || dist < bestDist - 0.5 || (dist - bestDist <= 0.5 && prio < bestPrio);

/** Result of `strict`: module scratch, read right after the call. */
const found = { dist: 0, prio: 0 };

/** The target by the plain rules, with no memory of what was on offer. Fills `found`. */
function strict(x: number, z: number, speed: number, quests: boolean, progress: Progress): Nearby {
  let best: Nearby = null;
  let bestDist = 0, bestPrio = 0;
  if (quests) {
    for (let i = 0; i < NPCS.length; i++) {
      const dist = Math.hypot(NPCS[i].x - x, NPCS[i].z - z);
      if (dist < INTERACT_DISTANCE && beats(dist, 1, best, bestDist, bestPrio)) (best = NEAR_NPC[i]), (bestDist = dist), (bestPrio = 1);
    }
    for (let i = 0; i < QUEST_INTERACTIONS.length; i++) {
      const ia = QUEST_INTERACTIONS[i];
      if (progress.seen[`${ia.questId}:${ia.id}`] || questState(progress, ia.questId) !== "active") continue;
      const dist = Math.hypot(ia.x - x, ia.z - z);
      if (dist < ia.radius && beats(dist, 2, best, bestDist, bestPrio)) (best = NEAR_QUEST[i]), (bestDist = dist), (bestPrio = 2);
    }
    const panelDist = Math.hypot(DONATION_PANEL.x - x, DONATION_PANEL.z - z);
    if (panelDist < INTERACT_DISTANCE && beats(panelDist, 3, best, bestDist, bestPrio)) (best = NEAR_PANEL), (bestDist = panelDist), (bestPrio = 3);
  }
  const treeDist = Math.hypot(x, z);
  if (treeDist < TREE_RADIUS + INTERACT_DISTANCE && beats(treeDist, 4, best, bestDist, bestPrio)) (best = NEAR_TREE), (bestDist = treeDist), (bestPrio = 4);
  // Lots: two neighbours of the frontage can be within reach at once, and the nearest one wins.
  let lot = -1, lotDist = LOT_INTERACT_DISTANCE;
  for (let i = 0; i < LOTS.length; i++) {
    const dist = Math.hypot(LOTS[i].x - x, LOTS[i].z - z);
    if (dist < lotDist) (lot = i), (lotDist = dist);
  }
  if (lot >= 0 && beats(lotDist, 5, best, bestDist, bestPrio)) (best = NEAR_LOT[lot]), (bestDist = lotDist), (bestPrio = 5);
  // Shops and billboards (IMPL-0024): only when nothing above is in reach. Plots: only standing still, too.
  if (!best) {
    const last = speed < PLOT_STILL_SPEED ? PLACES.length : FIRST_PLOT;
    let placeDist = PLACE_INTERACT_DISTANCE;
    for (let i = 0; i < last; i++) {
      const dist = Math.hypot(PLACES[i].x - x, PLACES[i].z - z);
      if (dist < placeDist) (best = PLACES[i].near), (placeDist = dist), (bestPrio = i < FIRST_PLOT ? 6 : 7);
    }
    bestDist = placeDist;
  }
  found.dist = bestDist;
  found.prio = bestPrio;
  return best;
}

/** Rank of the kind of `previous` and its distance, when it may stay on offer; `Infinity` when it may not. */
function kept(previous: NonNullable<Nearby>, x: number, z: number, speed: number, quests: boolean, progress: Progress): number {
  switch (previous.kind) {
    case "npc": {
      const n = NPCS[NPC_OF.get(previous) ?? -1];
      const dist = n && quests ? Math.hypot(n.x - x, n.z - z) : Infinity;
      return dist < INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = 1), dist) : Infinity;
    }
    case "quest": {
      const ia = QUEST_INTERACTIONS[QUEST_OF.get(previous) ?? -1];
      if (!ia || !quests || progress.seen[`${ia.questId}:${ia.id}`] || questState(progress, ia.questId) !== "active") return Infinity;
      const dist = Math.hypot(ia.x - x, ia.z - z);
      return dist < ia.radius + NEARBY_KEEP ? ((found.prio = 2), dist) : Infinity;
    }
    case "donation-panel": {
      const dist = quests ? Math.hypot(DONATION_PANEL.x - x, DONATION_PANEL.z - z) : Infinity;
      return dist < INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = 3), dist) : Infinity;
    }
    case "tree": {
      const dist = Math.hypot(x, z);
      return dist < TREE_RADIUS + INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = 4), dist) : Infinity;
    }
    case "lot": {
      const lot = LOTS[LOT_OF.get(previous) ?? -1];
      const dist = lot ? Math.hypot(lot.x - x, lot.z - z) : Infinity;
      return dist < LOT_INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = 5), dist) : Infinity;
    }
    default: {
      const i = PLACE_OF.get(previous) ?? -1;
      const place = PLACES[i];
      if (!place || (i >= FIRST_PLOT && speed >= PLOT_KEEP_SPEED)) return Infinity;
      const dist = Math.hypot(place.x - x, place.z - z);
      return dist < PLACE_INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = i < FIRST_PLOT ? 6 : 7), dist) : Infinity;
    }
  }
}

/**
 * The target for an avatar at `(x, z)` moving at `speed` (u/s). `previous` is the target on offer (as this
 * function returned it, or `null`): it is what the hysteresis holds on to.
 */
export function pickNearby(x: number, z: number, speed: number, quests: boolean, progress: Progress, previous: Nearby): Nearby {
  const best = strict(x, z, speed, quests, progress);
  if (!previous || best === previous) return best;
  const bestDist = found.dist, bestPrio = found.prio;
  const dist = kept(previous, x, z, speed, quests, progress);
  if (dist === Infinity) return best;
  if (!best) return previous;
  const prio = found.prio;
  // The places (6 and 7) are only offered when nothing of a kind before them is in reach.
  if (prio >= 6 && bestPrio < 6) return best;
  if (prio < 6 && bestPrio >= 6) return previous;
  // Among the rest, the one on offer stays unless the other is clearly closer.
  return bestDist < dist - NEARBY_SWITCH ? best : previous;
}
