/** Client Worker logic (kept out of index.ts: workerd only accepts handler exports from the main module). */
export interface Env {
  ASSETS: Pick<Fetcher, "fetch">;
}

const HOST = "play.vilanoeldobem.com.br";

/**
 * Other hosts of this Worker. The game runs on one origin only (CORS, the session cookie and the realtime
 * server all name play.*), so every other host redirects there, keeping path and query.
 * app.* is the old address (IMPL-0009, permanent); client.* is an alias named after the app (temporary, so
 * browsers do not cache the choice).
 */
const REDIRECTS: Record<string, 301 | 302> = {
  "app.vilanoeldobem.com.br": 301,
  "client.vilanoeldobem.com.br": 302,
};

export function handle(request: Request, env: Env): Response | Promise<Response> {
  const url = new URL(request.url);
  const status = Object.hasOwn(REDIRECTS, url.hostname) ? REDIRECTS[url.hostname] : undefined;
  if (status) {
    url.hostname = HOST;
    return Response.redirect(url.toString(), status);
  }
  return env.ASSETS.fetch(request);
}
