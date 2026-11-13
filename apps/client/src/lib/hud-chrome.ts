/**
 * Where the HUD is on the page, for the 3D labels (`scene/Props.tsx`): a label drawn where a button, the hint or
 * a notice of the HUD is would sit half under it, cut and unreadable (on a phone the HUD takes a good part of a
 * small screen, and the tree's label lands under the top bar at the spawn). Such a label is hidden until it is
 * clear again.
 */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** True when the two boxes share more than a hairline (`gap` px apart still counts as touching). */
export const overlaps = (a: Box, b: Box, gap = 0): boolean => a.left < b.right + gap && b.left < a.right + gap && a.top < b.bottom + gap && b.top < a.bottom + gap;

/** True when `box` touches any of `chrome`. */
export const underChrome = (box: Box, chrome: readonly Box[], gap = 2): boolean => chrome.some((c) => overlaps(box, c, gap));

/** What the HUD draws over the village: its buttons, the line that says how to walk, the passing notices. */
export const CHROME_SELECTOR = ".hud button, .hud .hud__hint, .hud .toast";
/** The HUD moves little: its boxes are read again at most this often (ms). */
const REFRESH_MS = 400;

let boxes: Box[] = [];
let readAt = -Infinity;

/** The boxes of the HUD's visible controls, cached for `REFRESH_MS`. Empty where there is no page (tests, SSR). */
export function hudChrome(now: number): readonly Box[] {
  if (typeof document === "undefined") return boxes;
  if (now - readAt < REFRESH_MS) return boxes;
  readAt = now;
  boxes = [];
  for (const el of document.querySelectorAll<HTMLElement>(CHROME_SELECTOR)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) boxes.push({ left: r.left, top: r.top, right: r.right, bottom: r.bottom });
  }
  return boxes;
}
