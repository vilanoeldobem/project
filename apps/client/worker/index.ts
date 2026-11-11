/**
 * Game client Worker (play.vilanoeldobem.com.br): static assets; runs first only to redirect the old
 * app.* host (see handle.ts).
 */
import { type Env, handle } from "./handle";

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
