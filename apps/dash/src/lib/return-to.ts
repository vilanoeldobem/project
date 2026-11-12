/**
 * Where to go after signing in (IMPL-0021). A link to one application (`#applications/<id>`, built by the game)
 * may be followed while signed out. The sign-in link then arrives by e-mail and usually opens another tab, with
 * a fragment that carries only the token, so the application asked for is remembered in this browser: its id
 * (not personal data), for a short time, and only until it is used once.
 *
 * Pure: the store and the clock are passed in.
 */
import { isId } from "./ids";

/** A sign-in link lives 15 minutes; a little longer covers asking for it and opening the e-mail. */
export const RETURN_TTL_MS = 20 * 60_000;
export const RETURN_KEY = "vila-dash:return-to";

export type ReturnStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** The browser's store, or null where it is unavailable (blocked storage, private modes): the return is then skipped. */
export function browserStore(): ReturnStore | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function rememberReturn(store: ReturnStore | null, applicationId: string, now = Date.now()): void {
  if (!isId(applicationId)) return;
  try {
    store?.setItem(RETURN_KEY, JSON.stringify({ id: applicationId, at: now }));
  } catch {
    // Storage full or refused: signing in still works, it just opens the list.
  }
}

export function forgetReturn(store: ReturnStore | null): void {
  try {
    store?.removeItem(RETURN_KEY);
  } catch {
    // Nothing to forget.
  }
}

/** The remembered application id, once: whatever is stored is removed, and returned only if fresh and well formed. */
export function takeReturn(store: ReturnStore | null, now = Date.now()): string | null {
  try {
    const raw = store?.getItem(RETURN_KEY);
    if (!raw) return null;
    store?.removeItem(RETURN_KEY);
    const { id, at } = JSON.parse(raw) as { id?: unknown; at?: unknown };
    return isId(id) && typeof at === "number" && now >= at && now - at <= RETURN_TTL_MS ? id : null;
  } catch {
    return null;
  }
}
