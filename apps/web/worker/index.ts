/**
 * Vila Noel do Bem Worker. Single entry: `/api/*` → api.ts; everything else → Static Assets (SPA).
 * The main module may only export handlers (workerd rejects other named exports), so logic lives in api.ts.
 */
import { handleApi, type Env } from "./api";

export default {
  async fetch(request, env): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith("/api/")) return handleApi(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
