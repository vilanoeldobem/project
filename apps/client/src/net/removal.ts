/**
 * Removing a visitor from the room, as the administrator's client does it (PROPOSTA, IMPL-0021):
 *
 *   1. a single-use ticket from the API for this room and that connection id (`POST /admin/moderation/ticket`);
 *   2. `encodeRemove(target, ticket)` on the open connection;
 *   3. the room's answer for that target: only `ok: true` is a removal.
 *
 * The room closes a connection that sends removal requests faster than one per second or more than ten per
 * minute, and the API issues at most ten tickets per administrator per minute. The room counts a message when it
 * arrives and this page only knows when it left, so the rules here do not depend on how long the network takes:
 *
 *   - one request at a time, and after a request that timed out nothing else is sent on that connection until
 *     its answer arrives. So every earlier message has reached the room before the next one leaves;
 *   - at least `REMOVE_SPACING_MS` between the last moment the room is known to have heard a message (it left,
 *     or its answer arrived) and the next one;
 *   - at most `REMOVE_BUDGET` requests in `REMOVE_WINDOW_MS`, a message counted from the moment it leaves. With
 *     the first rule the room sees at most one more message in its minute than left in ours, hence one fewer
 *     than the room allows.
 *
 * Neither the API (`TICKET_TIMEOUT_MS`) nor the room (`REMOVE_TIMEOUT_MS`) can keep a request waiting for ever.
 * Answers carry no request id: the first rule is also what makes an answer belong to the one message that is out.
 *
 * The ticket lives in one local variable from the API's answer to the socket: never stored, shown or logged.
 * Pure of the browser: the API call, the connection and the clock are passed in.
 */
import type { ModerationTicket } from "@vila/shared/accounts/contract";
import { encodeRemove, REMOVE_MAX_PER_MINUTE, REMOVE_MIN_INTERVAL_MS } from "@vila/shared/net/protocol";

import type { PresenceEvent, PresenceLink } from "./multiplayer";

/** Spacing of two removal messages: the room's minimum plus a margin. */
export const REMOVE_SPACING_MS = REMOVE_MIN_INTERVAL_MS + 100;
/** The window in which at most `REMOVE_BUDGET` requests are made: the room's minute plus a margin. */
export const REMOVE_WINDOW_MS = 61_000;
/** Requests per window: one fewer than the room allows (see the header). */
export const REMOVE_BUDGET = REMOVE_MAX_PER_MINUTE - 1;
/** The room answers within about 3 seconds; later than this counts as "not removed". */
export const REMOVE_TIMEOUT_MS = 5_000;
/** The API answers a ticket request at once; later than this the request is given up (and aborted). */
export const TICKET_TIMEOUT_MS = 5_000;
/** How long an answer that arrives after the timeout is still reported (the ticket is dead by then anyway). */
const LATE_ANSWER_MS = 30_000;

export type RemovalFailure =
  /** Another removal is waiting for its answer. */
  | "busy"
  /** The requests of the last minute are used up. */
  | "limit"
  /** No open connection to a room, or the target is this very connection. */
  | "offline"
  /** The request before this one timed out and the room has not answered it yet: nothing is sent meanwhile. */
  | "waiting"
  /** The API refused or could not issue the ticket (`error` says why), or sent one this client will not send. */
  | "ticket"
  /** The API did not answer the ticket request in `TICKET_TIMEOUT_MS`: nothing was sent to the room. */
  | "ticket_timeout"
  /** The visitor left the room before the message was sent: nothing was sent. */
  | "left"
  /** The connection closed or changed before the answer. */
  | "closed"
  /** The room answered `ok: false`: nobody was removed. */
  | "refused"
  /** No answer in `REMOVE_TIMEOUT_MS`. */
  | "timeout";

export type RemovalResult = { ok: true } | { ok: false; reason: RemovalFailure; error?: unknown };

export interface RemovalDeps {
  /** `POST /admin/moderation/ticket` for this room and target; `signal` gives the request up. */
  ticket: (room: number, target: number, signal: AbortSignal) => Promise<ModerationTicket>;
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
  /** The last moment the room is known to have heard a removal message: it left, or its answer arrived. */
  let heardAt = -Infinity;
  /** The requests of the current window: when each one's message left, or when it started if none did. */
  let used: number[] = [];
  /** The request that timed out and is still unanswered: nothing else is sent on its connection. */
  let unanswered: { link: PresenceLink; target: number; at: number } | null = null;

  // The answer of a request that had timed out (there is at most one, and no other message is out meanwhile).
  deps.listen((e) => {
    if (!unanswered) return;
    if (e.type === "closed") unanswered = null;
    else if (e.type === "removal" && e.target === unanswered.target) {
      const { at } = unanswered;
      unanswered = null;
      heardAt = now();
      // The room removed the visitor after this page had said it could not: still told to the administrator.
      if (e.ok && now() - at < LATE_ANSWER_MS) deps.onLateRemoval?.(e.target);
    }
  });

  const sleep = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

  /** The message to send for `target`, or why there is none. */
  async function prepare(link: PresenceLink, target: number): Promise<string | RemovalResult> {
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tooLate = new Promise<null>((done) => (timer = setTimeout(() => done(null), TICKET_TIMEOUT_MS)));
    try {
      const answer = await Promise.race([deps.ticket(link.room, target, abort.signal), tooLate]);
      if (!answer) {
        abort.abort();
        return { ok: false, reason: "ticket_timeout" };
      }
      // A malformed request is protocol abuse to the room: never send one.
      return encodeRemove(target, answer.ticket) ?? { ok: false, reason: "ticket" };
    } catch (error) {
      return { ok: false, reason: "ticket", error };
    } finally {
      clearTimeout(timer);
    }
  }

  /** Sends `message` on `link` and waits for the room's answer about `target`. */
  function exchange(link: PresenceLink, target: number, message: string): Promise<RemovalResult> {
    return new Promise<RemovalResult>((settle) => {
      const finish = (result: RemovalResult) => {
        clearTimeout(timer);
        stop();
        settle(result);
      };
      const stop = deps.listen((e) => {
        if (e.type === "closed") finish({ ok: false, reason: "closed" });
        else if (e.type === "removal" && e.target === target) {
          heardAt = now();
          finish(e.ok ? { ok: true } : { ok: false, reason: "refused" });
        }
      });
      const timer = setTimeout(() => {
        unanswered = { link, target, at: now() };
        finish({ ok: false, reason: "timeout" });
      }, REMOVE_TIMEOUT_MS);
      if (!link.send(message)) return finish({ ok: false, reason: "closed" });
      // The room counts this message when it arrives: here it counts from now, not from when the request began.
      heardAt = used[used.length - 1] = now();
    });
  }

  async function attempt(target: number): Promise<RemovalResult> {
    used = used.filter((at) => now() - at < REMOVE_WINDOW_MS);
    if (used.length >= REMOVE_BUDGET) return { ok: false, reason: "limit" };
    const link = deps.link();
    if (!link || link.selfId === target) return { ok: false, reason: "offline" };
    // Two messages that arrive together close the administrator's connection: wait for the answer still owed.
    if (unanswered?.link === link) return { ok: false, reason: "waiting" };
    unanswered = null; // another connection: the old one cannot answer any more
    used.push(now());

    let left = false;
    const stop = deps.listen((e) => {
      if (e.type === "left" && e.id === target) left = true;
    });
    try {
      const message = await prepare(link, target);
      if (typeof message !== "string") return message;
      const wait = heardAt + REMOVE_SPACING_MS - now();
      if (wait > 0) await sleep(wait);
      // The ticket is bound to the room it was asked for: a connection opened meanwhile is another one.
      if (deps.link() !== link) return { ok: false, reason: "closed" };
      // The visitor left while the ticket was on its way: there is nobody to remove, so nothing is sent.
      if (left) return { ok: false, reason: "left" };
      return await exchange(link, target, message);
    } finally {
      stop();
    }
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
