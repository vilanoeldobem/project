/**
 * Removing a visitor from the room, as the administrator's client does it (PROPOSTA, IMPL-0021):
 *
 *   1. a single-use ticket from the API for this room and that connection id (`POST /admin/moderation/ticket`);
 *   2. `encodeRemove(target, ticket)` on the open connection;
 *   3. the room's answer for that target: only `ok: true` is a removal.
 *
 * The room closes a connection that sends removal requests faster than one per second or more than ten per
 * minute, and the API issues at most ten tickets per administrator per minute, so this module is stricter than
 * both: one request at a time, at least `REMOVE_SPACING_MS` between two messages, at most `REMOVE_MAX_PER_MINUTE`
 * requests in `REMOVE_WINDOW_MS`, and an answer that takes longer than `REMOVE_TIMEOUT_MS` is a failure.
 *
 * The ticket lives in one local variable from the API's answer to the socket: never stored, shown or logged.
 * Pure of the browser: the API call, the connection and the clock are passed in.
 */
import type { ModerationTicket } from "@vila/shared/accounts/contract";
import { encodeRemove, REMOVE_MAX_PER_MINUTE, REMOVE_MIN_INTERVAL_MS } from "@vila/shared/net/protocol";

import type { PresenceEvent, PresenceLink } from "./multiplayer";

/** Spacing of two removal messages: the room's minimum plus a margin for the network. */
export const REMOVE_SPACING_MS = REMOVE_MIN_INTERVAL_MS + 100;
/** The window in which at most `REMOVE_MAX_PER_MINUTE` requests are made: the room's minute plus a margin. */
export const REMOVE_WINDOW_MS = 61_000;
/** The room answers within about 3 seconds; later than this counts as "not removed". */
export const REMOVE_TIMEOUT_MS = 5_000;
/** How long an answer that arrives after the timeout is still reported (the ticket is dead by then anyway). */
const LATE_ANSWER_MS = 30_000;

export type RemovalFailure =
  /** Another removal is waiting for its answer. */
  | "busy"
  /** Ten requests were already made in the last minute. */
  | "limit"
  /** No open connection to a room, or the target is this very connection. */
  | "offline"
  /** The API refused or could not issue the ticket (`error` says why), or sent one this client will not send. */
  | "ticket"
  /** The connection closed or changed before the answer. */
  | "closed"
  /** The room answered `ok: false`: nobody was removed. */
  | "refused"
  /** No answer in `REMOVE_TIMEOUT_MS`. */
  | "timeout";

export type RemovalResult = { ok: true } | { ok: false; reason: RemovalFailure; error?: unknown };

export interface RemovalDeps {
  /** `POST /admin/moderation/ticket` for this room and target. */
  ticket: (room: number, target: number) => Promise<ModerationTicket>;
  /** The open, welcomed connection, or null. */
  link: () => PresenceLink | null;
  /** Subscribes to the room's moderation events; returns the unsubscribe function. */
  listen: (listener: (e: PresenceEvent) => void) => () => void;
  /** An `ok: true` that arrived after its request had already been reported as timed out. */
  onLateRemoval?: (target: number) => void;
  now?: () => number;
}

/** One remover per page: its counters are what keeps the page inside the limits. */
export function createRemover(deps: RemovalDeps): (target: number) => Promise<RemovalResult> {
  const now = deps.now ?? Date.now;
  let busy = false;
  /** When the last removal message left, and when each request of the current window started. */
  let sentAt = -Infinity;
  let started: number[] = [];
  /** Targets whose request timed out, and when: a late `ok: true` is still told to the administrator. */
  const late = new Map<number, number>();

  deps.listen((e) => {
    if (e.type !== "removal") return;
    const at = late.get(e.target);
    if (at === undefined) return;
    late.delete(e.target);
    if (e.ok && now() - at < LATE_ANSWER_MS) deps.onLateRemoval?.(e.target);
  });

  const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

  async function attempt(target: number): Promise<RemovalResult> {
    started = started.filter((at) => now() - at < REMOVE_WINDOW_MS);
    if (started.length >= REMOVE_MAX_PER_MINUTE) return { ok: false, reason: "limit" };
    const link = deps.link();
    if (!link || link.selfId === target) return { ok: false, reason: "offline" };
    started.push(now());

    let message: string | null;
    try {
      message = encodeRemove(target, (await deps.ticket(link.room, target)).ticket);
    } catch (error) {
      return { ok: false, reason: "ticket", error };
    }
    // A malformed request is protocol abuse to the room: never send one.
    if (!message) return { ok: false, reason: "ticket" };

    const wait = sentAt + REMOVE_SPACING_MS - now();
    if (wait > 0) await sleep(wait);
    // The ticket is bound to the room it was asked for: a connection opened meanwhile is another one.
    if (deps.link() !== link) return { ok: false, reason: "closed" };

    return new Promise<RemovalResult>((settle) => {
      const finish = (result: RemovalResult) => {
        clearTimeout(timer);
        stop();
        settle(result);
      };
      const stop = deps.listen((e) => {
        if (e.type === "closed") finish({ ok: false, reason: "closed" });
        else if (e.type === "removal" && e.target === target) finish(e.ok ? { ok: true } : { ok: false, reason: "refused" });
      });
      const timer = setTimeout(() => {
        late.set(target, now());
        finish({ ok: false, reason: "timeout" });
      }, REMOVE_TIMEOUT_MS);
      if (link.send(message)) sentAt = now();
      else finish({ ok: false, reason: "closed" });
    });
  }

  return async (target) => {
    if (busy) return { ok: false, reason: "busy" };
    busy = true;
    try {
      return await attempt(target);
    } finally {
      busy = false;
    }
  };
}
