/** Canonical host for the public website; the apex domain redirects here. */
export const CANONICAL_HOST = "www.vilanoeldobem.com.br";
export const APEX_HOST = "vilanoeldobem.com.br";

/** Returns a 301 to the canonical host for apex requests, or null to serve assets. */
export function canonicalRedirect(url: URL): Response | null {
  if (url.hostname !== APEX_HOST) return null;
  const target = new URL(url.pathname + url.search, `https://${CANONICAL_HOST}`);
  return Response.redirect(target.toString(), 301);
}
