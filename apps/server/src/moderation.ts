/**
 * Asking the API whether a moderation ticket is good (PROPOSTA, IMPL-0021). The room knows nobody: the ticket
 * is the whole authorisation, and only the API can tell whether it is unused, unexpired, issued for this room
 * and this connection id, and still held by an administrator. The call goes through the `API` service binding
 * (Worker to Worker, never the public internet, no shared secret).
 *
 * Fail closed: only an HTTP 200 whose JSON body is exactly `{ "ok": true }` is a yes. A missing binding, any
 * other status or body, a thrown error or no answer within `CONSUME_TIMEOUT_MS` is a no. Nothing is logged and
 * nothing is kept: the ticket lives in this call's arguments and nowhere else.
 */
import { isConnectionId, isModerationTicket, MAX_ROOMS } from "@vila/shared/net/protocol";

/** The host is never resolved: a service binding delivers the request straight to the API Worker. */
export const CONSUME_URL = "https://api.internal/moderation/consume";

/** How long the room waits for the API before answering 0. */
export const CONSUME_TIMEOUT_MS = 3000;

/**
 * A room does not act on removal requests until it has been in memory for this long. It must stay above the
 * lifetime of a ticket (30 seconds on the API).
 *
 * Connection ids are never reused while a room stays in memory, but a room that restarts counts again from
 * the lowest free id, so an id can come to mean a different connection. A ticket names a room and an id.
 * Waiting out one ticket lifetime guarantees that every ticket still alive was issued while this very
 * instance was running, when the id could only mean the connection it means now (or nobody).
 */
export const REMOVAL_WARMUP_MS = 35_000;

export interface ConsumeRequest {
  ticket: string;
  room: number;
  target: number;
}

const exactlyOk = (body: unknown): boolean =>
  typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 1 && (body as { ok?: unknown }).ok === true;

/** True only when the API consumed the ticket (see the module comment). Never throws, never logs. */
export async function consumeTicket(api: Fetcher | undefined, request: ConsumeRequest, timeoutMs = CONSUME_TIMEOUT_MS): Promise<boolean> {
  const { ticket, room, target } = request;
  if (!api || !isModerationTicket(ticket) || !isConnectionId(target) || !Number.isInteger(room) || room < 0 || room >= MAX_ROOMS) return false;
  const abort = new AbortController();
  // The abort also settles the race, so a callee that ignores the signal cannot hold the answer back.
  const timeout = new Promise<false>((resolve) => abort.signal.addEventListener("abort", () => resolve(false)));
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  const call = (async () => {
    const response = await api.fetch(CONSUME_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ticket, room, target }),
      signal: abort.signal,
    });
    if (response.status !== 200) {
      await response.body?.cancel();
      return false;
    }
    return exactlyOk(await response.json());
  })().catch(() => false);
  try {
    return await Promise.race([call, timeout]);
  } finally {
    clearTimeout(timer);
  }
}
