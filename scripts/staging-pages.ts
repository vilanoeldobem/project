// The game and website share the same analytics markup. Keep login-fragment.js in
// place so mail links are consumed even when the analytics block is omitted.
// Build-time only: shared by the three Vite configs, not runtime app code and not packages/shared.
export function stagingHtml(html: string): string {
  return html
    .replace("<title>", "<title>Homologação · ")
    .replace(/<!-- analytics:start -->[\s\S]*?<!-- analytics:end -->/, "")
    .replaceAll("https://www.vilanoeldobem.com.br", "https://www-staging.vilanoeldobem.com.br")
    .replaceAll("https://play.vilanoeldobem.com.br", "https://play-staging.vilanoeldobem.com.br");
}

/** Static assets for non-production pages with Google Fonts and no tracking scripts. */
export function stagingHeaders(serviceOrigins: string[] = []): string {
  const csp = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    ["connect-src 'self'", ...serviceOrigins].join(" "),
    "worker-src 'self' blob:",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-Robots-Tag: noindex, nofollow
  Referrer-Policy: no-referrer
  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()
  Content-Security-Policy: ${csp}

/
  Cache-Control: no-store, no-transform

/index.html
  Cache-Control: no-store, no-transform

/assets/*
  Cache-Control: public, max-age=31536000, immutable
`;
}
