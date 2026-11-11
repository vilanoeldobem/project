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
}

export function endpoints(mode: string): Endpoints {
  return mode === "production"
    ? { api: "https://api.vilanoeldobem.com.br", realtime: "wss://server.vilanoeldobem.com.br" }
    : { api: "http://localhost:8787", realtime: "ws://localhost:8788" };
}
