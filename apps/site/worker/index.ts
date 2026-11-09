/**
 * Vila Noel do Bem website Worker: apex → www redirect, everything else from Static Assets.
 * The main module may only export handlers, so the logic lives in redirect.ts.
 */
import { canonicalRedirect } from "./redirect";

interface Env {
  ASSETS: Fetcher;
}

export default {
  async fetch(request, env): Promise<Response> {
    return canonicalRedirect(new URL(request.url)) ?? env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
