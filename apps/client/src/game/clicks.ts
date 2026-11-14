/**
 * What a click or a tap on the scene does (IMPL-0016, IMPL-0024). One intention per click:
 *
 * - on open ground it walks there (`Ground`, on pointer down), unless something that answers a click stands in
 *   front of the ground under the pointer: then that thing decides, and the ground does nothing. Before, the
 *   ground walked on pointer down and the building acted on the click that followed, so opening a panel from a
 *   building's own interaction point left a walk behind for when the panel closed, and from afar the tap
 *   marker landed behind the building;
 * - on a shop, a billboard or the chalet of a residential plot it opens the panel from where the place is used
 *   (the reach of the action button) and otherwise walks to that spot, with the tap marker there;
 * - on a lot, the tree, the lectern or a quest NPC within reach it opens the panel.
 *
 * A panel opened by a click on the scene drops whatever walk was on its way: the click is the new intention.
 * (A panel opened by the action button or the menu keeps the walk, which goes on when it closes: IMPL-0022.)
 *
 * In moderation mode (PROPOSTA, IMPL-0021) one thing comes before all of that: a press on another visitor
 * picks that visitor, whatever stands behind them, and that press does nothing else (`pressScene`).
 */
import { type GroundKind, groundAt, PLACE_INTERACT_DISTANCE, type ResidentialPlot } from "@vila/shared/game/world";

import { events } from "./events";
import { sim } from "./sim";
import { type Panel, useVila } from "./store";

/** Walks to a point. The tap marker goes where the avatar will stop, which is not always where the click landed. */
export function walkTo(x: number, z: number): void {
  useVila.getState().setTarget({ x, z });
  const to = useVila.getState().target;
  if (to) events.emit({ type: "tap", x: to.x, z: to.z });
}

/**
 * The press in progress picked a visitor (moderation mode): the click that ends it opens nothing and walks
 * nowhere. Decided on pointer down (`pressScene`); the handlers below, which run on the click, read it.
 */
let pickedVisitor = false;

/** A new press starts with nothing picked. `Ground` calls this for every press on the page, before anything else. */
export function startPress(): void {
  pickedVisitor = false;
}

/** What a press did, as the ground saw it: it picked a visitor, it walked, or it was left to what stands in front. */
export type PressOutcome = "picked" | "walked" | "left";

/**
 * A press on the scene, seen from the ground, which lies under every press. In this order:
 *
 * 1. `pick` is tried first, whatever is under the pointer: in moderation mode it selects the visitor the press
 *    is on (`selectVisitorAt`), and for everybody else it is always false. A press that picked does nothing
 *    else: no walk now, and nothing from the click that follows (`pickedVisitor`).
 * 2. A chalet, a shop, the tree, a lot, a villager or a character of the village stands in front of the ground: its own click decides
 *    what this press does, and the ground walks nowhere (`groundIsFirst`).
 * 3. Open ground: the avatar walks to `(x, z)`.
 */
export function pressScene(press: { intersections: ReadonlyArray<{ eventObject: unknown }>; own: unknown; x: number; z: number; pick: () => boolean }): PressOutcome {
  pickedVisitor = press.pick();
  if (pickedVisitor) return "picked";
  if (!groundIsFirst(press.intersections, press.own)) return "left";
  walkTo(press.x, press.z);
  return "walked";
}

/** Opens a panel from a click on the scene: no walk is left waiting behind it. */
export function openFromScene(panel: Panel): void {
  if (pickedVisitor) return;
  const { open, setTarget } = useVila.getState();
  setTarget(null);
  open(panel);
}

/**
 * A click on a place of the village: its panel opens from where it is used (the same reach as the action
 * button); from farther away the avatar walks to that spot instead, like a click on a villager.
 */
export function visit(spot: { x: number; z: number }, panel: Panel, reach: number = PLACE_INTERACT_DISTANCE): void {
  if (pickedVisitor) return;
  if (Math.hypot(spot.x - sim.pose.x, spot.z - sim.pose.z) < reach) openFromScene(panel);
  else walkTo(spot.x, spot.z);
}

/**
 * A click on a character of the village (IMPL-0025): from talking distance its dialogue opens; from farther
 * away, or while it is walking, the avatar goes to stand `stand` u short of where it is (or of where it is
 * going), on the avatar's side, and the action button offers the talk there. One click, one intention: an open
 * dialogue leaves no walk behind it. A press that picked a visitor (moderation mode, `pressScene`) does neither.
 */
export function visitCharacter(spot: { x: number; z: number; ready: boolean }, panel: Panel | null, reach: number, stand: number): void {
  if (pickedVisitor) return;
  const dx = sim.pose.x - spot.x, dz = sim.pose.z - spot.z;
  const dist = Math.hypot(dx, dz);
  if (spot.ready && panel && dist < reach) return openFromScene(panel);
  if (dist <= stand) return;
  walkTo(spot.x + (dx / dist) * stand, spot.z + (dz / dist) * stand);
}

/** Where a ray meets the ground, or null when it never comes down to it. */
export function groundUnder(origin: { x: number; y: number; z: number }, direction: { x: number; y: number; z: number }): { x: number; z: number } | null {
  if (direction.y >= -1e-6) return null;
  const t = -origin.y / direction.y;
  return { x: origin.x + direction.x * t, z: origin.z + direction.z * t };
}

/** Paving people walk on: the plaza, the round street, the avenues, the lanes and the street of each ring. */
export const isStreet = (kind: GroundKind): boolean => kind === "plaza" || kind === "ring-street" || kind === "avenue" || kind === "lane" || kind.startsWith("street-");

/**
 * A click on the chalet of a residential plot (or on anything drawn on the plot). The camera looks north from
 * above, so the roofs of a row south of a street cover that street on the screen: a tap meant for the street
 * lands on a roof. What counts is the ground under the pointer: when it is street paving the avatar walks to
 * that spot, exactly as if the roof were not there; only a tap whose ground is the plot itself (its chalet,
 * its yard) goes to the plot.
 */
export function tapResidence(plot: ResidentialPlot, ground: { x: number; z: number } | null): void {
  if (pickedVisitor) return;
  if (ground && isStreet(groundAt(ground.x, ground.z))) walkTo(ground.x, ground.z);
  else visit(plot.front, { kind: "plot", plotId: plot.id });
}

/**
 * True when the ground is the first thing under the pointer that answers pointer events. `intersections` are
 * the hits of the event, nearest first; `own` is the ground's own event object.
 */
export const groundIsFirst = (intersections: ReadonlyArray<{ eventObject: unknown }>, own: unknown): boolean => intersections.length === 0 || intersections[0].eventObject === own;
