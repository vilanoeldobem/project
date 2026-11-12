/**
 * Game client Worker (play.vilanoeldobem.com.br): static assets; runs first only to redirect its other
 * hosts, app.* and client.*, to play.* (see handle.ts).
 */
import { type Env, handle } from "./handle";

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
