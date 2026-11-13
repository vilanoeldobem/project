/**
 * Service endpoints per build mode (IMPL-0009). Pure (no `import.meta`), so `vite.config.ts` uses the same
 * values for the CSP and the preconnect hints. `production` → public subdomains; anything else (`vite`
 * dev server, `vite build --mode workers` for wrangler dev) → local Workers.
 */
export interface Endpoints {
  /** HTTP API base, no trailing slash. */
  api: string;
  /** Realtime WebSocket base, no trailing slash. */
  realtime: string;
  /**
   * Backoffice dashboard origin (apps/dash, IMPL-0015). Only linked to, for admins: the game never calls it, so
   * it is not part of the CSP `connect-src`.
   */
  dash: string;
  /**
   * Public website (apps/site, IMPL-0005). Only linked to ("Sair da Vila" and the help of the game menu,
   * IMPL-0022): the game never calls it, so it is not part of the CSP `connect-src`. Locally it is the site's
   * `vite preview`.
   */
  site: string;
}

export function endpoints(mode: string): Endpoints {
  return mode === "production"
    ? { api: "https://api.vilanoeldobem.com.br", realtime: "wss://server.vilanoeldobem.com.br", dash: "https://dash.vilanoeldobem.com.br", site: "https://www.vilanoeldobem.com.br" }
    : { api: "http://localhost:8787", realtime: "ws://localhost:8788", dash: "http://localhost:8797", site: "http://localhost:4173" };
}
