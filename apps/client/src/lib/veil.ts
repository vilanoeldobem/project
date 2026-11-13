/**
 * A press on the veil around a dialog closes it (`Panel`: every panel and the game menu). It closes on the
 * `click`, the last event of a tap: closing on `pointerdown` removed the veil before the tap was over, and its
 * `click` landed on the HUD button that was under the finger. And only a press that also started on the veil
 * counts, so a drag that starts inside the dialog (a text selection) and ends on the veil closes nothing.
 * One press happens at a time, so the veil it started on is kept here. Pure, tested without a browser.
 */

/** The part of a pointer or mouse event the rule needs. */
export interface VeilEvent {
  target: unknown;
  currentTarget: unknown;
}

/** The veil the current press started on; null when it started inside the dialog. */
let pressedVeil: unknown = null;

/** `pointerdown` on the veil element (also the ones that bubble from inside the dialog). */
export function veilPointerDown(event: VeilEvent): void {
  pressedVeil = event.target === event.currentTarget ? event.currentTarget : null;
}

/** `click` on the veil element: closes when the press started and ended on this veil. */
export function veilClick(event: VeilEvent, close: () => void): void {
  const started = pressedVeil;
  pressedVeil = null;
  if (event.target === event.currentTarget && started === event.currentTarget) close();
}
