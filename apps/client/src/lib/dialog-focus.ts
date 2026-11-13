/**
 * Focus of a modal dialog (W3C APG modal dialog pattern), used by every panel and by the game menu (`Panel`):
 * focus moves into the dialog, Tab cycles inside it, and on close focus returns to the element that had it.
 * The DOM is reached only through the few members below, so the rules are tested without a browser.
 */

/** Visible, enabled descendants that can take focus. */
export const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export interface FocusNode {
  focus(): void;
}

export interface DialogNode extends FocusNode {
  contains(node: never): boolean;
  querySelectorAll(selector: string): Iterable<FocusNode & { offsetParent: unknown }>;
}

/**
 * Tab pressed with `active` focused: the element that takes the focus instead of the browser's choice, or null
 * to let the browser move it (inside the dialog, not at an edge). With nothing focusable the dialog keeps it.
 */
export function tabTarget(dialog: DialogNode, active: unknown, shift: boolean): FocusNode | null {
  const focusable = [...dialog.querySelectorAll(FOCUSABLE)].filter((el) => el.offsetParent !== null);
  if (focusable.length === 0) return dialog;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const inside = dialog.contains(active as never);
  if (shift) return active === first || active === dialog || !inside ? last : null;
  return active === last || !inside ? first : null;
}

const canFocus = (node: unknown): node is FocusNode => typeof (node as FocusNode | null)?.focus === "function";

interface KeyLike {
  key: string;
  shiftKey: boolean;
  preventDefault(): void;
}

/**
 * Makes `dialog` modal for the keyboard: moves the focus into it and keeps Tab inside. Returns the function
 * that undoes it and gives the focus back to whatever had it before (the button that opened the dialog).
 */
export function trapFocus(
  dialog: DialogNode,
  doc: { activeElement: unknown },
  page: { addEventListener(type: "keydown", listener: (event: Event) => void): void; removeEventListener(type: "keydown", listener: (event: Event) => void): void }
): () => void {
  const previous = canFocus(doc.activeElement) ? doc.activeElement : null;
  dialog.focus();
  const onKey = (event: Event) => {
    const e = event as unknown as KeyLike;
    if (e.key !== "Tab") return;
    const to = tabTarget(dialog, doc.activeElement, e.shiftKey);
    if (!to) return;
    e.preventDefault();
    to.focus();
  };
  page.addEventListener("keydown", onKey);
  return () => {
    page.removeEventListener("keydown", onKey);
    previous?.focus();
  };
}
