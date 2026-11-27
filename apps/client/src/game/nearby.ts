/**
 * Which interactive thing the avatar is next to: the one target behind the HUD's contextual action (pure, no
 * allocation per call; `scene/Player.tsx` asks every frame).
 *
 * Order of the kinds: quest NPC, quest interaction, donation lectern, the tree and a lot of the square compete
 * by distance, with the listed order breaking near ties (`beats`); a shop door, a billboard or a residential
 * plot is offered only when none of those is in reach.
 *
 * A character of the village (IMPL-0025) comes last: it is offered only when none of the first five kinds is
 * in reach, and against a shop door, a billboard or a plot only when the avatar is closer to the character
 * than to the place's point (a tie goes to the place). So a character that stands by the tree, a lot or a quest
 * NPC never takes their action, and a place is always offered at its own point: to talk, walk up to the
 * character itself, or click it.
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
import { questStateIn, STORY_CATALOG } from "@vila/shared/game/quests-v2/catalog";
import type { StoryCatalog, StoryWorld } from "@vila/shared/game/quests-v2/types";
import { STORY_WORLD } from "@vila/shared/game/quests-v2/world";
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
  SITES,
} from "@vila/shared/game/world";

import type { Nearby } from "./store";

/** How far beyond its reach a target that is on offer stays on offer. */
export const NEARBY_KEEP = 0.6;
/** A target of the same kind replaces the one on offer only when it is this much closer. */
export const NEARBY_SWITCH = 0.5;
/**
 * A character is offered instead of a place in reach only when it is more than this much closer than the place's
 * point: 0 = the nearer of the two, and the place on a tie. (The shopkeepers stand 1.2 u from their billboard's
 * point: with any margin the keeper could hardly be talked to.)
 */
export const LIFE_OVER_PLACE = 0;
/**
 * The character of the village nearest to the avatar that can be talked to (`game/village-life.ts` fills it
 * every frame): `near` and its distance when one is within talking reach, and how far the character on offer is.
 */
export interface LifeNearby {
  near: Nearby;
  dist: number;
  previousDist: number;
}
/** How close the avatar stands to talk to a character (the same number as `LIFE_TALK_REACH`, kept here for the hold). */
export const LIFE_REACH = 2.4;
/** A quest NPC or interaction this close keeps the action from the passive donation lectern. */
const QUEST_OVER_PANEL = 2;
/** A residential plot is offered below this speed (u/s) and stays on offer below `PLOT_KEEP_SPEED`: standing still. */
export const PLOT_STILL_SPEED = 0.2;
export const PLOT_KEEP_SPEED = 0.6;

/**
 * Precomputed targets of the v2 story world. Building the target objects and their indexes once keeps the
 * frame loop allocation-free; tests can build a synthetic set with `storyNearby`.
 */
export interface StoryNearby {
  world: StoryWorld;
  catalog: StoryCatalog;
  npcTargets: readonly Nearby[];
  interactionTargets: readonly Nearby[];
  npcOf: ReadonlyMap<unknown, number>;
  interactionOf: ReadonlyMap<unknown, number>;
}

export function storyNearby(world: StoryWorld, catalog: StoryCatalog): StoryNearby {
  const npcTargets = world.npcs.map((npc): Nearby => ({ kind: "npc", npcId: npc.id }));
  const interactionTargets = world.interactions.map((interaction): Nearby => ({ kind: "quest", interactionId: interaction.id }));
  return {
    world,
    catalog,
    npcTargets,
    interactionTargets,
    npcOf: new Map(npcTargets.map((target, i) => [target, i])),
    interactionOf: new Map(interactionTargets.map((target, i) => [target, i])),
  };
}

export const STORY_NEARBY = storyNearby(STORY_WORLD, STORY_CATALOG);

/** Interaction targets, built once: picking one allocates nothing. */
const NEAR_NPC: Nearby[] = NPCS.map((n) => ({ kind: "npc", npcId: n.id }));
const NEAR_QUEST: Nearby[] = QUEST_INTERACTIONS.map((i) => ({ kind: "quest", interactionId: i.id }));
const NEAR_LOT: Nearby[] = LOTS.map((l) => ({ kind: "lot", lotId: l.id }));
const NEAR_PANEL: Nearby = { kind: "donation-panel" };
const NEAR_TREE: Nearby = { kind: "tree" };
/**
 * Places of the expanded village: where each one is used from. Shops, the civic buildings, parks and squares of
 * the rings (IMPL-0031) and the boards first, then the plots.
 */
const PLACES: Array<{ x: number; z: number; near: NonNullable<Nearby> }> = [
  ...SHOPS.map((s) => ({ x: s.door.x, z: s.door.z, near: { kind: "shop" as const, shopId: s.id } })),
  ...SITES.map((site) => ({ x: site.front.x, z: site.front.z, near: { kind: "site" as const, siteId: site.id } })),
  ...BILLBOARDS.map((b) => ({ x: b.point.x, z: b.point.z, near: { kind: "billboard" as const, billboardId: b.id } })),
  ...RESIDENTIAL_PLOTS.map((p) => ({ x: p.front.x, z: p.front.z, near: { kind: "plot" as const, plotId: p.id } })),
];
const FIRST_PLOT = SHOPS.length + SITES.length + BILLBOARDS.length;
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
function strict(
  x: number,
  z: number,
  speed: number,
  quests: boolean,
  progress: Progress,
  life: LifeNearby | null,
  story: StoryNearby | null,
  storyNpcs?: ReadonlySet<string>
): Nearby {
  let best: Nearby = null;
  let bestDist = 0, bestPrio = 0;
  // The nearest quest target in reach: it wins over the passive lectern, which stands beside Dona Guida.
  let questNear: Nearby = null, questNearDist = 0, questNearPrio = 0;
  const noteQuest = (near: Nearby, dist: number, prio: number) => {
    if (!near || (questNear && dist >= questNearDist)) return;
    (questNear = near), (questNearDist = dist), (questNearPrio = prio);
  };
  if (quests) {
    for (let i = 0; i < NPCS.length; i++) {
      const dist = Math.hypot(NPCS[i].x - x, NPCS[i].z - z);
      if (dist < INTERACT_DISTANCE) noteQuest(NEAR_NPC[i], dist, 1);
      if (dist < INTERACT_DISTANCE && beats(dist, 1, best, bestDist, bestPrio)) (best = NEAR_NPC[i]), (bestDist = dist), (bestPrio = 1);
    }
  }
  if (story) {
    for (let i = 0; i < story.world.npcs.length; i++) {
      const npc = story.world.npcs[i];
      if (storyNpcs && !storyNpcs.has(npc.id)) continue;
      const dist = Math.hypot(npc.x - x, npc.z - z);
      if (dist < INTERACT_DISTANCE) noteQuest(story.npcTargets[i], dist, 1);
      if (dist < INTERACT_DISTANCE && beats(dist, 1, best, bestDist, bestPrio)) (best = story.npcTargets[i]), (bestDist = dist), (bestPrio = 1);
    }
  }
  if (quests) {
    for (let i = 0; i < QUEST_INTERACTIONS.length; i++) {
      const ia = QUEST_INTERACTIONS[i];
      if (progress.seen[`${ia.questId}:${ia.id}`] || questState(progress, ia.questId) !== "active") continue;
      const dist = Math.hypot(ia.x - x, ia.z - z);
      if (dist < ia.radius) noteQuest(NEAR_QUEST[i], dist, 2);
      if (dist < ia.radius && beats(dist, 2, best, bestDist, bestPrio)) (best = NEAR_QUEST[i]), (bestDist = dist), (bestPrio = 2);
    }
  }
  if (story) {
    for (let i = 0; i < story.world.interactions.length; i++) {
      const interaction = story.world.interactions[i];
      if (
        progress.seen[`${interaction.questId}:${interaction.id}`] ||
        questStateIn(story.catalog, progress, interaction.questId) !== "active"
      )
        continue;
      const dist = Math.hypot(interaction.x - x, interaction.z - z);
      if (dist < interaction.radius) noteQuest(story.interactionTargets[i], dist, 2);
      if (dist < interaction.radius && beats(dist, 2, best, bestDist, bestPrio)) {
        (best = story.interactionTargets[i]), (bestDist = dist), (bestPrio = 2);
      }
    }
  }
  if (quests) {
    const panelDist = Math.hypot(DONATION_PANEL.x - x, DONATION_PANEL.z - z);
    if (panelDist < INTERACT_DISTANCE && beats(panelDist, 3, best, bestDist, bestPrio)) (best = NEAR_PANEL), (bestDist = panelDist), (bestPrio = 3);
  }
  if (best?.kind === "donation-panel" && questNear && questNearDist <= QUEST_OVER_PANEL) {
    (best = questNear), (bestDist = questNearDist), (bestPrio = questNearPrio);
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
    // A character of the village: with no place in reach, or clearly closer than the place.
    if (life?.near && life.dist < LIFE_REACH && (!best || life.dist + LIFE_OVER_PLACE < placeDist)) (best = life.near), (bestDist = life.dist), (bestPrio = 8);
  }
  // Standing on a place's own point reads that place: a character a step away must not hide the panel. Quest targets
  // (2) still win, since their event is the interaction.
  if (best && bestPrio !== 2 && bestPrio !== 6 && bestDist > 0.9) {
    let at = -1, atDist = 0.9;
    for (let i = 0; i < FIRST_PLOT; i++) {
      const dist = Math.hypot(PLACES[i].x - x, PLACES[i].z - z);
      if (dist < atDist) (at = i), (atDist = dist);
    }
    if (at >= 0) (best = PLACES[at].near), (bestDist = atDist), (bestPrio = 6);
  }
  found.dist = bestDist;
  found.prio = bestPrio;
  return best;
}

/** Rank of the kind of `previous` and its distance, when it may stay on offer; `Infinity` when it may not. */
function kept(
  previous: NonNullable<Nearby>,
  x: number,
  z: number,
  speed: number,
  quests: boolean,
  progress: Progress,
  life: LifeNearby | null,
  story: StoryNearby | null,
  storyNpcs?: ReadonlySet<string>
): number {
  switch (previous.kind) {
    case "life":
      // Still there, still standing (`previousDist` is infinite once it walks off or goes off stage).
      return life && life.previousDist < LIFE_REACH + NEARBY_KEEP ? ((found.prio = 8), life.previousDist) : Infinity;
    case "npc": {
      const v1 = NPCS[NPC_OF.get(previous) ?? -1];
      if (v1) {
        const dist = quests ? Math.hypot(v1.x - x, v1.z - z) : Infinity;
        return dist < INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = 1), dist) : Infinity;
      }
      const index = story?.npcOf.get(previous);
      const npc = index === undefined ? undefined : story?.world.npcs[index];
      if (npc && storyNpcs && !storyNpcs.has(npc.id)) return Infinity;
      const dist = npc ? Math.hypot(npc.x - x, npc.z - z) : Infinity;
      return dist < INTERACT_DISTANCE + NEARBY_KEEP ? ((found.prio = 1), dist) : Infinity;
    }
    case "quest": {
      const v1 = QUEST_INTERACTIONS[QUEST_OF.get(previous) ?? -1];
      if (v1) {
        if (!quests || progress.seen[`${v1.questId}:${v1.id}`] || questState(progress, v1.questId) !== "active") return Infinity;
        const dist = Math.hypot(v1.x - x, v1.z - z);
        return dist < v1.radius + NEARBY_KEEP ? ((found.prio = 2), dist) : Infinity;
      }
      const index = story?.interactionOf.get(previous);
      const interaction = index === undefined ? undefined : story?.world.interactions[index];
      if (
        !interaction ||
        !story ||
        progress.seen[`${interaction.questId}:${interaction.id}`] ||
        questStateIn(story.catalog, progress, interaction.questId) !== "active"
      )
        return Infinity;
      const dist = Math.hypot(interaction.x - x, interaction.z - z);
      return dist < interaction.radius + NEARBY_KEEP ? ((found.prio = 2), dist) : Infinity;
    }
    case "donation-panel": {
      // A quest target in arm's reach keeps the action; the lectern never holds it over a character.
      if (found.prio <= 2 && found.dist <= QUEST_OVER_PANEL) return Infinity;
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
 * function returned it, or `null`): it is what the hysteresis holds on to. `life`: the character of the village
 * that can be talked to from here, if any (IMPL-0025).
 */
export function pickNearby(
  x: number,
  z: number,
  speed: number,
  quests: boolean,
  progress: Progress,
  previous: Nearby,
  life: LifeNearby | null = null,
  story: StoryNearby | null = null,
  storyNpcs?: ReadonlySet<string>
): Nearby {
  const best = strict(x, z, speed, quests, progress, life, story, storyNpcs);
  if (!previous || best === previous) return best;
  const bestDist = found.dist, bestPrio = found.prio;
  // Standing on a place point reads it at once: the NPC behind it does not hold the offer.
  if (bestPrio === 6 && bestDist < 0.9) return best;
  const dist = kept(previous, x, z, speed, quests, progress, life, story, storyNpcs);
  if (dist === Infinity) return best;
  if (!best) return previous;
  const prio = found.prio;
  // The places (6 and 7) are only offered when nothing of a kind before them is in reach.
  if (prio >= 6 && bestPrio < 6) return best;
  if (prio < 6 && bestPrio >= 6) return previous;
  // Among the rest, the one on offer stays unless the other is clearly closer.
  return bestDist < dist - NEARBY_SWITCH ? best : previous;
}
