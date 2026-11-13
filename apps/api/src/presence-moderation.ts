/**
 * Removing a visitor from a room of the realtime server (IMPL-0021, PROPOSTA): on only when
 * PRESENCE_MODERATION_ENABLED = "true" ("false" in production and staging) and accounts are on.
 *
 *   POST /admin/moderation/ticket {accountId, room, target} → {ticket, expiresAt}     (administrator, from the game)
 *   POST /moderation/consume      {ticket, room, target}    → {ok: true} | 4xx {error} (realtime server, service binding)
 *
 * Presence stays anonymous (IMPL-0008): `target` is the numeric id of a connection, not an account, and the
 * realtime server never learns who anybody is, the administrator included. The administrator's game asks for a
 * ticket here and sends it on its open connection; the room hands it back through `POST /moderation/consume`,
 * and only a 200 lets it close the target's connection.
 *
 * The ticket is the capability: 32 URL-safe characters (192 random bits), stored as its SHA-256, valid 30
 * seconds, single use, bound to the administrator, the room and the target. At most 10 per administrator per
 * minute. Asking for one writes no audit row (nothing happened yet); consuming it marks it used and writes the
 * audit row `presence.remove` in one batch, only for the winning request, and only if the administrator who asked
 * is still an administrator and not blocked. The audit row records that an administrator's removal was
 * authorised, not that a connection was closed: the room may still find that the target already left.
 *
 * `POST /moderation/consume` has no session and no `Origin` rule: the realtime server reaches it through a
 * service binding (`https://api.internal/moderation/consume`, no `Origin`, no client address). No browser page
 * can: it sends no CORS header whatever the `Origin` (api.ts), and it takes only a JSON body. The room compares
 * the answer strictly: success is 200 with exactly `{"ok":true}`; everything that is not a valid unused ticket
 * for that room and target answers the same 404.
 *
 * Rate limit (`MODERATION_LIMITER`): a caller with a client address (the public hostname) is keyed by it and
 * charged before the ticket is looked at. A call through the binding has no address and is keyed by its room, so
 * one busy room cannot use up another's budget; there the room forwards whatever well-formed ticket any of its
 * connections sent, so only a ticket somebody issued is charged. One that nobody issued costs a primary-key read
 * and gets the same 404, or visitors could spend the room's budget and have a real ticket refused. The room has
 * its own per-connection limits (one `["m", …]` per second, ten per minute).
 *
 * This is a courtesy removal, not a ban: an anonymous visitor can connect again. Blocking accounts is
 * account-moderation.ts.
 */
import { MODERATION_TICKET, MODERATION_TICKET_TTL_MS, MODERATION_TICKETS_PER_MINUTE } from "@vila/shared/accounts/moderation";
import { MAX_ROOMS } from "@vila/shared/net/protocol";

import { isoIn, newId, randomToken, sha256Hex } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { assertAccount, requireAdmin } from "./session";
import type { Env } from "./api";

const RATE_WINDOW_MS = 60_000;

const isRoom = (value: unknown): value is number => Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_ROOMS;
const isTarget = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) > 0;

export async function issueTicket(request: Request, env: Env): Promise<Response> {
  if (env.PRESENCE_MODERATION_ENABLED !== "true") throw new HttpError(404, "not_found");
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  assertAccount(body, admin);
  const { room, target } = body;
  if (!isRoom(room)) throw new HttpError(400, "bad_room");
  if (!isTarget(target)) throw new HttpError(400, "bad_target");

  const db = env.DB!;
  const ticket = randomToken(24);
  const now = Date.now();
  const expiresAt = isoIn(MODERATION_TICKET_TTL_MS, now);
  const windowStart = new Date(now - RATE_WINDOW_MS).toISOString();
  const [, issued] = await db.batch([
    // Tickets older than the rate window expired long ago: nothing reads them any more.
    db.prepare("DELETE FROM moderation_tickets WHERE created_at <= ?").bind(windowStart),
    // The count and the insert are one statement, so parallel requests cannot overshoot the limit.
    db.prepare(
      `INSERT INTO moderation_tickets (ticket_hash, admin_id, room, target, created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ? WHERE (SELECT COUNT(*) FROM moderation_tickets WHERE admin_id = ? AND created_at > ?) < ?`
    ).bind(await sha256Hex(ticket), admin.id, room, target, new Date(now).toISOString(), expiresAt, admin.id, windowStart, MODERATION_TICKETS_PER_MINUTE),
  ]);
  if (!issued.meta.changes) throw new HttpError(429, "too_many_requests");
  return json({ ticket, expiresAt }, { headers: NO_STORE });
}

export async function consumeTicket(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST") return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
  if (env.ACCOUNTS_ENABLED !== "true" || env.PRESENCE_MODERATION_ENABLED !== "true") throw new HttpError(404, "not_found");
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const { ticket, room, target } = await readJson(request, 1_000);
  const charge = async (key: string) => {
    if (env.MODERATION_LIMITER && !(await env.MODERATION_LIMITER.limit({ key })).success) throw new HttpError(429, "too_many_requests");
  };
  // The public hostname: whoever calls is charged first, whatever was sent.
  const address = request.headers.get("CF-Connecting-IP");
  if (address) await charge(address);
  if (typeof ticket !== "string" || !MODERATION_TICKET.test(ticket) || !isRoom(room) || !isTarget(target)) throw new HttpError(404, "not_found");

  const db = env.DB;
  const hash = await sha256Hex(ticket), now = new Date().toISOString(), token = newId();
  if (!address) {
    // The service binding (no client address): the room's budget is spent only on a ticket somebody issued. A
    // read by primary key decides it and changes nothing; whether the ticket is still good is the batch below.
    if (!(await db.prepare("SELECT 1 AS x FROM moderation_tickets WHERE ticket_hash = ?").bind(hash).first())) throw new HttpError(404, "not_found");
    await charge(`room:${room}`);
  }
  const [claimed] = await db.batch([
    db.prepare(
      `UPDATE moderation_tickets SET used_at = ?, consume_token = ?
        WHERE ticket_hash = ? AND used_at IS NULL AND expires_at > ? AND room = ? AND target = ?
          AND EXISTS (SELECT 1 FROM users u WHERE u.id = moderation_tickets.admin_id AND u.role = 'admin' AND u.blocked = 0)`
    ).bind(now, token, hash, now, room, target),
    // "Removal authorised", not "connection closed". A connection id is not personal data; the ticket and the
    // caller's address are never recorded.
    db.prepare(
      `INSERT INTO audit_events (id, actor, action, subject, detail)
       SELECT ?, admin_id, 'presence.remove', 'room:' || room, json_object('target', target)
         FROM moderation_tickets WHERE ticket_hash = ? AND consume_token = ?`
    ).bind(newId(), hash, token),
  ]);
  if (!claimed.meta.changes) throw new HttpError(404, "not_found");
  return json({ ok: true }, { headers: NO_STORE });
}
