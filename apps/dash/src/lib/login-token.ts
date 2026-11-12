/**
 * The magic-link token travels in the URL fragment (`/#login=…`), which browsers never send to a server. It is
 * taken out of the address bar before anything else uses the URL: by `public/login-fragment.js` on page load,
 * or here when the link is opened in a tab that already shows the dashboard (a fragment-only navigation does
 * not reload the page).
 */

/**
 * Splits a location hash into the login token (if any) and what is left of the fragment. The rest is kept as it
 * was written (never re-encoded): it may be an address of the dashboard, such as `#/applications/<id>`. Pure.
 * `public/login-fragment.js` does the same before the bundle loads: keep the two in step.
 */
export function splitLoginFragment(hash: string): { token: string | null; rest: string } {
  const parts = hash.replace(/^#/, "").split("&");
  const at = parts.findIndex((part) => part.startsWith("login="));
  const token = at < 0 ? null : new URLSearchParams(parts[at]).get("login");
  if (!token) return { token: null, rest: hash };
  parts.splice(at, 1);
  const rest = parts.join("&");
  return { token, rest: rest ? `#${rest}` : "" };
}

/** Takes the token once: from memory (set by `login-fragment.js`) or from the fragment, which is then cleaned. */
export function takeLoginToken(): string | null {
  const early = window.__vilaLoginToken;
  delete window.__vilaLoginToken;
  if (early) return early;
  const { token, rest } = splitLoginFragment(location.hash);
  if (token) history.replaceState(null, "", `${location.pathname}${location.search}${rest}`);
  return token;
}
