/**
 * Vila Noel do Bem HTTP API Worker (api.vilanoeldobem.com.br). The main module may only export
 * handlers (workerd rejects other named exports), so logic lives in api.ts.
 */
import { handleApi, type Env } from "./api";

export default {
  fetch: (request, env) => handleApi(request, env),
} satisfies ExportedHandler<Env>;
