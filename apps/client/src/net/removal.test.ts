/**
 * Removing a visitor from the room, client side (PROPOSTA, IMPL-0021): the ticket, the message on the open
 * connection and the room's answer, inside the limits the room enforces by closing the sender. Fake API, fake
 * connection, fake clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError } from "@vila/shared/accounts/errors";
import { decodeRemove, REMOVE_MAX_PER_MINUTE, REMOVE_MIN_INTERVAL_MS } from "@vila/shared/net/protocol";

import type { PresenceEvent, PresenceLink } from "./multiplayer";
import { pickAvatar } from "./pick";
import { createRemover, REMOVE_SPACING_MS, REMOVE_TIMEOUT_MS, REMOVE_WINDOW_MS } from "./removal";

const TICKET = "abcdefghijklmnopqrstuvwxyzABCD_-";

/** A room on the other end of a fake connection: records what was sent and when, answers on demand. */
function fakeRoom() {
  const listeners = new Set<(e: PresenceEvent) => void>();
  const sent: Array<{ at: number; message: string }> = [];
  const asked: Array<{ room: number; target: number }> = [];
  const late: number[] = [];
  let link: PresenceLink | null = { room: 2, selfId: 7, send: (message) => (sent.push({ at: Date.now(), message }), true) };
  let ticket: () => Promise<{ ticket: string; expiresAt: string }> = async () => ({ ticket: TICKET, expiresAt: "" });
  const emit = (e: PresenceEvent) => [...listeners].forEach((listener) => listener(e));
  const remove = createRemover({
    ticket: (room, target) => (asked.push({ room, target }), ticket()),
    link: () => link,
    listen: (listener) => (listeners.add(listener), () => void listeners.delete(listener)),
    onLateRemoval: (target) => late.push(target),
  });
  return {
    remove,
    sent,
    asked,
    late,
    answer: (target: number, ok: boolean) => emit({ type: "removal", target, ok }),
    drop: () => {
      link = null;
      emit({ type: "closed" });
    },
    setLink: (next: PresenceLink | null) => (link = next),
    setTicket: (next: typeof ticket) => (ticket = next),
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

/** Lets the promise chain reach its next timer or listener. */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("removal request", () => {
  it("asks a ticket for this room and target, sends exactly encodeRemove on the open connection and succeeds only on ok: true", async () => {
    const room = fakeRoom();
    const result = room.remove(9);
    await settle();
    expect(room.asked).toEqual([{ room: 2, target: 9 }]);
    expect(room.sent).toHaveLength(1);
    expect(decodeRemove(room.sent[0].message)).toEqual({ target: 9, ticket: TICKET });
    room.answer(9, true);
    expect(await result).toEqual({ ok: true });
  });

  it("is a failure when the room answers ok: false, and ignores answers about other targets", async () => {
    const room = fakeRoom();
    const result = room.remove(9);
    await settle();
    room.answer(8, true);
    room.answer(9, false);
    expect(await result).toEqual({ ok: false, reason: "refused" });
  });

  it("treats no answer in about 5 s as a failure, and still reports an ok that arrives late", async () => {
    const room = fakeRoom();
    const result = room.remove(9);
    await settle();
    await vi.advanceTimersByTimeAsync(REMOVE_TIMEOUT_MS - 1);
    let done = false;
    void result.then(() => (done = true));
    await settle();
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ ok: false, reason: "timeout" });
    expect(REMOVE_TIMEOUT_MS).toBe(5_000);
    room.answer(9, true);
    expect(room.late).toEqual([9]);
    room.answer(9, true); // only once
    expect(room.late).toEqual([9]);
  });

  it("fails when the connection closes before the answer, or is not open at all", async () => {
    const room = fakeRoom();
    const result = room.remove(9);
    await settle();
    room.drop();
    expect(await result).toEqual({ ok: false, reason: "closed" });
    expect(await room.remove(9)).toEqual({ ok: false, reason: "offline" });
    expect(room.asked).toHaveLength(1); // no ticket is asked without a connection
  });

  it("never asks to remove its own connection", async () => {
    const room = fakeRoom();
    expect(await room.remove(7)).toEqual({ ok: false, reason: "offline" });
    expect(room.asked).toEqual([]);
    expect(room.sent).toEqual([]);
  });

  it("reports the API's refusal and sends nothing", async () => {
    const room = fakeRoom();
    const refusal = new ApiError(429, "too_many_requests");
    room.setTicket(() => Promise.reject(refusal));
    expect(await room.remove(9)).toEqual({ ok: false, reason: "ticket", error: refusal });
    expect(room.sent).toEqual([]);
  });

  it("never sends a ticket of the wrong shape", async () => {
    const room = fakeRoom();
    room.setTicket(async () => ({ ticket: "short", expiresAt: "" }));
    expect(await room.remove(9)).toEqual({ ok: false, reason: "ticket" });
    expect(room.sent).toEqual([]);
  });

  it("does not send a ticket on a connection opened after it was asked", async () => {
    const room = fakeRoom();
    let release!: () => void;
    room.setTicket(() => new Promise((resolve) => (release = () => resolve({ ticket: TICKET, expiresAt: "" }))));
    const result = room.remove(9);
    await settle();
    const other: string[] = [];
    room.setLink({ room: 3, selfId: 12, send: (message) => (other.push(message), true) });
    release();
    expect(await result).toEqual({ ok: false, reason: "closed" });
    expect(other).toEqual([]);
  });
});

describe("limits (the room closes a sender that breaks them)", () => {
  it("is single flight: a second request while one waits is refused without a ticket or a message", async () => {
    const room = fakeRoom();
    const first = room.remove(9);
    await settle();
    expect(await room.remove(10)).toEqual({ ok: false, reason: "busy" });
    expect(room.asked).toHaveLength(1);
    expect(room.sent).toHaveLength(1);
    room.answer(9, true);
    await first;
    // Free again once the first one ended.
    const next = room.remove(10);
    await vi.advanceTimersByTimeAsync(REMOVE_SPACING_MS);
    room.answer(10, true);
    expect(await next).toEqual({ ok: true });
  });

  it("keeps at least 1100 ms between two messages, however fast the answers come", async () => {
    const room = fakeRoom();
    expect(REMOVE_SPACING_MS).toBeGreaterThanOrEqual(1100);
    expect(REMOVE_SPACING_MS).toBeGreaterThan(REMOVE_MIN_INTERVAL_MS);
    const first = room.remove(9);
    await settle();
    room.answer(9, true); // answered at once
    await first;
    for (const target of [10, 11]) {
      const before = room.sent.length;
      const result = room.remove(target);
      await settle();
      await vi.advanceTimersByTimeAsync(REMOVE_SPACING_MS - 1);
      expect(room.sent).toHaveLength(before); // has its ticket, waits for its turn
      await vi.advanceTimersByTimeAsync(1);
      expect(room.sent).toHaveLength(before + 1);
      room.answer(target, true);
      expect(await result).toEqual({ ok: true });
    }
    const gaps = room.sent.slice(1).map((m, i) => m.at - room.sent[i].at);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(1100);
  });

  it("does not wait when the last message is old enough", async () => {
    const room = fakeRoom();
    const first = room.remove(9);
    await settle();
    room.answer(9, true);
    await first;
    await vi.advanceTimersByTimeAsync(REMOVE_SPACING_MS);
    const at = Date.now();
    const second = room.remove(10);
    await settle();
    expect(room.sent[1].at).toBe(at);
    room.answer(10, false);
    await second;
  });

  it("never makes more than 10 requests in a minute, failed ones included, and recovers when the window moves", async () => {
    const room = fakeRoom();
    expect(REMOVE_WINDOW_MS).toBeGreaterThanOrEqual(60_000);
    const start = Date.now();
    for (let i = 0; i < REMOVE_MAX_PER_MINUTE; i++) {
      const result = room.remove(100 + i);
      await vi.advanceTimersByTimeAsync(REMOVE_SPACING_MS);
      room.answer(100 + i, i % 2 === 0);
      await result;
    }
    expect(room.asked).toHaveLength(10);
    expect(room.sent).toHaveLength(10);
    expect(await room.remove(200)).toEqual({ ok: false, reason: "limit" });
    expect(room.asked).toHaveLength(10); // refused here: no ticket, no message
    expect(room.sent).toHaveLength(10);
    // Still refused until the first request is more than a minute old.
    await vi.advanceTimersByTimeAsync(start + 60_000 - Date.now());
    expect(await room.remove(200)).toEqual({ ok: false, reason: "limit" });
    await vi.advanceTimersByTimeAsync(start + REMOVE_WINDOW_MS - Date.now());
    const again = room.remove(200);
    await settle();
    room.answer(200, true);
    expect(await again).toEqual({ ok: true });
    // In any 60 s of the whole run, at most 10 messages left.
    for (const m of room.sent) expect(room.sent.filter((n) => n.at >= m.at && n.at - m.at < 60_000).length).toBeLessThanOrEqual(10);
  });

  it("counts a request whose ticket the API refused (the API counts tickets per minute too)", async () => {
    const room = fakeRoom();
    room.setTicket(() => Promise.reject(new ApiError(0, "network")));
    for (let i = 0; i < REMOVE_MAX_PER_MINUTE; i++) expect((await room.remove(100 + i)).ok).toBe(false);
    expect(room.asked).toHaveLength(10);
    expect(await room.remove(200)).toEqual({ ok: false, reason: "limit" });
    expect(room.asked).toHaveLength(10);
  });
});

describe("picking a visitor with the click ray", () => {
  const down = { x: 0, y: -1, z: -1 }; // the camera looks down and forward
  const from = (x: number, z: number) => ({ x, y: 10, z: z + 10 }); // a ray that reaches the ground at (x, z)

  it("picks the avatar the ray passes through, by its body and not only its feet", () => {
    const avatars = [{ id: 4, x: 0, z: 0 }, { id: 5, x: 6, z: 0 }];
    expect(pickAvatar(from(0, 0), down, avatars)).toBe(4);
    // A click on the head lands on the ground well behind the feet.
    expect(pickAvatar(from(6, -2.2), down, avatars)).toBe(5);
  });

  it("picks nobody on empty ground, so the click walks", () => {
    const avatars = [{ id: 4, x: 0, z: 0 }];
    expect(pickAvatar(from(3, 0), down, avatars)).toBeNull();
    expect(pickAvatar(from(0, 3), down, avatars)).toBeNull();
    expect(pickAvatar(from(0, 0), down, [])).toBeNull();
  });

  it("prefers the avatar nearest to the camera when two overlap", () => {
    const avatars = [{ id: 4, x: 0, z: -1 }, { id: 5, x: 0, z: 0.4 }];
    expect(pickAvatar(from(0, -1), down, avatars)).toBe(5);
  });
});
