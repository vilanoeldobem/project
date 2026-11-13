/**
 * What a key does on the HUD while no panel is open. Pure, so the rule is tested without a browser.
 *
 * E and Enter open what the avatar is next to (a house, the tree, a villager), whatever has the focus: the Vila
 * is played with the keyboard, and after "Explorar ONGs → Ir até lá" or a click on a zoom button the focus is
 * still on a HUD button. The one exception is a moderation control (IMPL-0021: the mode switch and the buttons of
 * the moderation block, all marked `data-moderation`): Enter on one of them belongs to that button, so an
 * administrator who answers a confirmation with the keyboard next to a house acts on the button, not on the house.
 */
export type HudKeyAction = "zoom-in" | "zoom-out" | "activate" | null;

/** The part of a DOM element the rule needs (`Element.closest`). */
export interface KeyTarget {
  closest(selector: string): KeyTarget | null;
}

/** `target` is, or is inside, a button or link of a moderation block. */
export const onModerationControl = (target: KeyTarget | null): boolean => (target?.closest("button, a[href]")?.closest("[data-moderation]") ?? null) !== null;

/** `nearby`: the avatar is next to something that can be opened. `target`: what had the focus when the key went down. */
export function hudKeyAction(key: string, target: KeyTarget | null, nearby: boolean): HudKeyAction {
  if (key === "+" || key === "=") return "zoom-in";
  if (key === "-") return "zoom-out";
  if (!nearby) return null;
  if (key === "e" || key === "E") return "activate";
  return key === "Enter" && !onModerationControl(target) ? "activate" : null;
}
