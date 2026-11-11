/**
 * Realtime Worker routes (server.vilanoeldobem.com.br, IMPL-0008/IMPL-0009):
 *
 *   GET /health          → { ok, service: "server", rooms: boolean }
 *   GET /room?i=N        → WebSocket upgrade to presence room N; Origin must be on ALLOWED_ORIGINS
 *
 * Holds no data: every room keeps ephemeral presence in memory (room-do.ts).
 */
import { MAX_ROOMS } from "@vila/shared/net/protocol";

import { type Env, originAllowed } from "./env";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
  if (url.pathname === "/health") return json({ ok: true, service: "server", rooms: Boolean(env.ROOMS) });
  if (url.pathname !== "/room") return json({ error: "not_found" }, 404);
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return json({ error: "upgrade_required" }, 426);
  // Blocks cross-site WebSocket hijacking: only the game's own pages may join.
  if (!originAllowed(request.headers.get("Origin"), env)) return json({ error: "forbidden_origin" }, 403);
  const i = Number(url.searchParams.get("i") ?? "0");
  if (!Number.isInteger(i) || i < 0 || i >= MAX_ROOMS) return json({ error: "bad_room" }, 400);
  if (!env.ROOMS) return json({ error: "multiplayer_unavailable" }, 503);
  const stub = env.ROOMS.get(env.ROOMS.idFromName(`plaza-${i}`));
  return stub.fetch(`https://room.internal/?i=${i}`, request);
}
