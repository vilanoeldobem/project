/**
 * Vila Noel do Bem realtime Worker (server.vilanoeldobem.com.br). Exports the fetch handler and the
 * `VillageRoom` Durable Object class (workerd allows handler and class exports, not constants).
 */
import type { Env } from "./env";
import { handle } from "./handler";

export { VillageRoom } from "./room-do";

export default {
  fetch: (request, env) => handle(request, env),
} satisfies ExportedHandler<Env>;
