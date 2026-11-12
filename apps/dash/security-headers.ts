/**
 * Static response headers of the backoffice dashboard (written to dist/_headers at build time by vite.config.ts).
 *
 * Stricter than the game's: no third-party script, style, font or image (no analytics, no tag manager), no inline
 * script or style, and `connect-src` lists exactly one remote origin — the API of this build (IMPL-0015). The
 * dashboard is never indexed, never framed, sends no referrer, and its HTML is never stored: every visit gets
 * the current build and the current policy.
 *
 * `img-src` also allows `blob:` (IMPL-0017): the logo of an application is fetched from the API with the admin's
 * session and shown through an object URL. The API origin is not an image source: its file routes refuse a
 * plain `<img src>`.
 */
export function contentSecurityPolicy(apiOrigin: string): string {
  return [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' blob:",
    "font-src 'self'",
    `connect-src 'self' ${apiOrigin}`,
    "object-src 'none'",
    "frame-ancestors 'none'",
    "base-uri 'none'",
    "form-action 'self'",
  ].join("; ");
}

/**
 * `no-transform` asks intermediaries (the zone's automatic Web Analytics injection included) to leave the HTML
 * alone. The HTML rules are exact paths: `_headers` joins repeated headers instead of replacing them, so a
 * catch-all `no-store` would also land on the immutable `/assets/*`.
 */
export function headersFile(apiOrigin: string): string {
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: no-referrer
  Cross-Origin-Opener-Policy: same-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: ${contentSecurityPolicy(apiOrigin)}

/
  Cache-Control: no-store, no-transform

/index.html
  Cache-Control: no-store, no-transform

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}
