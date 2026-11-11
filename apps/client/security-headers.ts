/** Hosts Google Tag Manager / GA4 send hits to (Google's documented CSP for the Google tag). */
const GOOGLE_TAG_CONNECT = "https://*.google-analytics.com https://*.analytics.google.com https://*.googletagmanager.com";

/**
 * Static response headers for the game client (written to dist/_headers at build time by vite.config.ts).
 * `connectSrc` lists exactly the API and realtime origins of the build (IMPL-0009).
 */
export function headersFile(connectSrc: string): string {
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com https://www.googletagmanager.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob: https://*.google-analytics.com https://*.googletagmanager.com",
    `connect-src 'self' ${connectSrc} https://cloudflareinsights.com ${GOOGLE_TAG_CONNECT}`,
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: ${csp}

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}
