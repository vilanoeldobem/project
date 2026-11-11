/** Client Worker logic (kept out of index.ts: workerd only accepts handler exports from the main module). */
export interface Env {
  ASSETS: Pick<Fetcher, "fetch">;
}

const OLD_HOST = "app.vilanoeldobem.com.br";
const HOST = "play.vilanoeldobem.com.br";

/** Moves the old game host to the new one (app.* → play.*, IMPL-0009), keeping path and query. */
export function handle(request: Request, env: Env): Response | Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname === OLD_HOST) {
    url.hostname = HOST;
    return Response.redirect(url.toString(), 301);
  }
  return env.ASSETS.fetch(request);
}
