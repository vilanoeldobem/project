/**
 * Service endpoints per build mode (IMPL-0015; same idea as the game's `endpoints.ts`). Pure (no `import.meta`),
 * so `vite.config.ts` builds the CSP from the same values. `production` → public subdomains; anything else
 * (`vite` dev server, `vite build --mode workers` for wrangler dev) → local Workers.
 */
export interface Endpoints {
  /** HTTP API base, no trailing slash. The only remote origin the dashboard fetches (CSP `connect-src`). */
  api: string;
  /** Realtime server base (HTTP form). Only linked to: it sends no CORS headers, so the dashboard cannot read it. */
  realtime: string;
  /** Game origin. Only linked to. */
  game: string;
}

export function endpoints(mode: string): Endpoints {
  return mode === "production"
    ? { api: "https://api.vilanoeldobem.com.br", realtime: "https://server.vilanoeldobem.com.br", game: "https://play.vilanoeldobem.com.br" }
    : { api: "http://localhost:8787", realtime: "http://localhost:8788", game: "http://localhost:8799" };
}
