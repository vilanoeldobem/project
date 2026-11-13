/**
 * The guard of a confirmation step (IMPL-0021). A confirmation cannot be answered by the gesture that opened
 * it: not by the second click of a double click (`detail` > 1), not by a key held down (`repeat`), and not at
 * all in its first `CONFIRM_ARM_MS`. Pure, so the rule is tested without a browser.
 */
export const CONFIRM_ARM_MS = 600;

export const confirmAllowed = (gesture: { detail?: number; repeat?: boolean }, shownAt: number, now: number): boolean =>
  !gesture.repeat && (gesture.detail ?? 0) <= 1 && now - shownAt >= CONFIRM_ARM_MS;
