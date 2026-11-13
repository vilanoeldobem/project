/**
 * The guard of a confirmation step (IMPL-0021). A confirmation cannot be answered by the gesture that opened
 * it: not by the second click of a double click (`detail` > 1), not by a key held down (`repeat`), and not at
 * all in its first `CONFIRM_ARM_MS`. Pure, so the rule is tested without a browser.
 */
export const CONFIRM_ARM_MS = 600;

export const confirmAllowed = (gesture: { detail?: number; repeat?: boolean }, shownAt: number, now: number): boolean =>
  !gesture.repeat && (gesture.detail ?? 0) <= 1 && now - shownAt >= CONFIRM_ARM_MS;

/**
 * A mouse press (`mousedown`) on the confirm button. The button appears under the pointer that opened the
 * question, so the second click of a double click lands on it: the click is refused (`confirmAllowed`), but the
 * press would leave the focus on the button, and Enter a moment later would confirm. A press whose click will be
 * refused gives the button no focus: it stays on `question`.
 */
export function guardConfirmPress(press: { detail: number; preventDefault(): void }, shownAt: number, now: number, question: { focus(): void } | null): void {
  if (confirmAllowed({ detail: press.detail }, shownAt, now)) return;
  press.preventDefault();
  question?.focus();
}

/** A confirmation step as Escape sees it: what its "Cancelar" does, and whether the action is being sent. */
export interface ConfirmationStep {
  busy: boolean;
  onCancel: () => void;
}

/**
 * The confirmation steps on screen, oldest first: each `Confirm` adds itself while it is mounted. Escape goes to
 * the newest one before anything else (`escapeAction`, IMPL-0022): it cancels the question, it never closes
 * the panel under it. `step.current` is read at the press, so it is always what is on screen.
 */
const openConfirmations: Array<{ current: ConfirmationStep }> = [];

/** Adds a confirmation step; returns the function that removes it (when the step leaves the screen). */
export function registerConfirmation(step: { current: ConfirmationStep }): () => void {
  openConfirmations.push(step);
  return () => {
    const at = openConfirmations.lastIndexOf(step);
    if (at >= 0) openConfirmations.splice(at, 1);
  };
}

export const confirmationOpen = (): boolean => openConfirmations.length > 0;

/**
 * Cancels the newest confirmation step, as its "Cancelar" button would. While the action is being sent that
 * button is disabled, and this does nothing either.
 */
export function cancelConfirmation(): void {
  const step = openConfirmations[openConfirmations.length - 1]?.current;
  if (step && !step.busy) step.onCancel();
}
