import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVE_MESSAGE, CLOSE_ABUSE, CLOSE_FULL, CLOSE_IDLE, CLOSE_REMOVED, encodeRemove, MAX_ROOMS } from "@vila/shared/net/protocol";

import {
  connectPresence,
  ingestSnapshot,
  onPresenceEvent,
  planAfterClose,
  type PresenceEvent,
  presenceLink,
  remotes,
  REMOVED_HOLD_MS,
  resetRemotes,
  sampleRemotes,
  useNet,
} from "./multiplayer";

describe("snapshot interpolation", () => {
  beforeEach(resetRemotes);

  it("ignores the local visitor's own id", () => {
    ingestSnapshot([[1, 0, 0, 0, 0, 0], [2, 1, 1, 0, 0, 0]], 1000, 1, 1000);
    expect([...remotes.keys()]).toEqual([2]);
  });

  it("renders 150 ms in the past between two known poses", () => {
    // Server clock = local clock (offset 0 after the first sample arrives instantly).
    ingestSnapshot([[2, 0, 0, 0, 4, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 1, 0, 0, 4, 0]], 1100, null, 1100);
    sampleRemotes(1100 + 150 - 50); // render time = 1050 → halfway
    expect(remotes.get(2)!.x).toBeCloseTo(0.5);
  });

  it("holds the last pose instead of extrapolating", () => {
    ingestSnapshot([[2, 0, 0, 0, 4, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 1, 0, 0, 4, 0]], 1100, null, 1100);
    sampleRemotes(5000);
    expect(remotes.get(2)!.x).toBe(1);
  });

  it("uses the per-entry age to place samples in time", () => {
    ingestSnapshot([[2, 0, 0, 0, 4, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 1, 0, 0, 4, 80]], 1100, null, 1100); // accepted at 1020
    sampleRemotes(1010 + 150); // render time 1010 → halfway between 1000 and 1020
    expect(remotes.get(2)!.x).toBeCloseTo(0.5);
  });

  it("turns along the shortest arc", () => {
    ingestSnapshot([[2, 0, 0, 3.1, 0, 0]], 1000, null, 1000);
    ingestSnapshot([[2, 0, 0, -3.1, 0, 0]], 1100, null, 1100);
    sampleRemotes(1050 + 150);
    expect(Math.abs(Math.cos(remotes.get(2)!.yaw) + 1)).toBeLessThan(0.01);
  });
});

describe("reconnect policy (planAfterClose)", () => {
  it("waits for the person's input after an idle close, with no timer", () => {
    expect(planAfterClose(CLOSE_IDLE, 3, 4)).toEqual({ status: "idle", delayMs: null, room: 3, tries: 0 });
  });

  it("waits for input, with no timer, only after an idle close or a removal", () => {
    for (const code of [1000, 1001, 1005, 1006, 1011, 1012, CLOSE_ABUSE, CLOSE_FULL, 4000, 4004])
      expect(planAfterClose(code, 0, 0).delayMs).not.toBeNull();
  });

  it("holds for 60 s after a removal by an administrator, and is never a network error", () => {
    expect(planAfterClose(CLOSE_REMOVED, 3, 4)).toEqual({ status: "removed", delayMs: null, holdMs: 60_000, room: 3, tries: 0 });
    expect(REMOVED_HOLD_MS).toBe(60_000);
    expect(planAfterClose(CLOSE_IDLE, 3, 4).holdMs).toBeUndefined();
  });

  it("retries a dropped connection in the same room with exponential backoff, 1 s to 30 s", () => {
    const delays = [0, 1, 2, 3, 4, 5, 6, 20].map((tries) => planAfterClose(1006, 2, tries));
    expect(delays.map((p) => p.delayMs)).toEqual([1000, 2000, 4000, 8000, 16_000, 30_000, 30_000, 30_000]);
    expect(delays.every((p) => p.status === "offline" && p.room === 2)).toBe(true);
    expect(planAfterClose(1006, 2, 4).tries).toBe(5);
  });

  it("moves to the next room at once when full, and rests 30 s after a full round", () => {
    expect(planAfterClose(CLOSE_FULL, 0, 0)).toEqual({ status: "connecting", delayMs: 0, room: 1, tries: 1 });
    expect(planAfterClose(CLOSE_FULL, MAX_ROOMS - 1, 3)).toEqual({ status: "connecting", delayMs: 0, room: 0, tries: 4 });
    expect(planAfterClose(CLOSE_FULL, 6, MAX_ROOMS - 1)).toEqual({ status: "full", delayMs: 30_000, room: 7, tries: 0 });
  });
});

/** Minimal browser stand-ins: just what `connectPresence` touches. */
class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  closedWith: [number?, string?] | null = null;
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(msg: string) {
    this.sent.push(msg);
  }
  close(code?: number, reason?: string) {
    this.readyState = 3;
    this.closedWith = [code, reason];
  }
  /** The room accepted the connection and sent the welcome. */
  welcome() {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({ data: '["w",7,0]' });
  }
  /** The connection ended with this close code. */
  end(code: number) {
    this.readyState = 3;
    this.onclose?.({ code });
  }
}

describe("presence connection (idle timeout, IMPL-0014)", () => {
  const MINUTE = 60_000;
  let page: EventTarget, doc: EventTarget & { hidden: boolean };
  let disconnect: () => void;
  const latest = () => FakeSocket.all[FakeSocket.all.length - 1];
  const input = (type: "pointerdown" | "keydown") => page.dispatchEvent(new Event(type));
  const setHidden = (hidden: boolean) => {
    doc.hidden = hidden;
    doc.dispatchEvent(new Event("visibilitychange"));
  };

  beforeEach(() => {
    vi.useFakeTimers();
    FakeSocket.all = [];
    page = new EventTarget();
    doc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal("WebSocket", FakeSocket);
    vi.stubGlobal("window", page);
    vi.stubGlobal("document", doc);
    disconnect = connectPresence();
  });
  afterEach(() => {
    disconnect();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("does not reconnect by itself after an idle close; the next click or key reconnects once", () => {
    latest().welcome();
    expect(useNet.getState().status).toBe("online");
    latest().end(CLOSE_IDLE);
    expect(useNet.getState().status).toBe("idle");
    vi.advanceTimersByTime(30 * MINUTE);
    expect(FakeSocket.all).toHaveLength(1);
    expect(vi.getTimerCount()).toBe(0); // nothing scheduled: no ping, no pose loop, no retry
    input("pointerdown");
    expect(FakeSocket.all).toHaveLength(2);
    expect(useNet.getState().status).toBe("connecting");
    input("keydown"); // more input while connecting opens nothing else
    expect(FakeSocket.all).toHaveLength(2);
    latest().welcome();
    expect(useNet.getState().status).toBe("online");
  });

  it("still retries a dropped connection by itself, with backoff", () => {
    latest().welcome();
    latest().end(1006);
    expect(useNet.getState().status).toBe("offline");
    vi.advanceTimersByTime(999);
    expect(FakeSocket.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(2);
    latest().end(1006); // failed again before any welcome: wait twice as long
    vi.advanceTimersByTime(1999);
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(1);
    expect(FakeSocket.all).toHaveLength(3);
  });

  it("still moves to the next room when the room is full", () => {
    latest().end(CLOSE_FULL);
    expect(FakeSocket.all).toHaveLength(2);
    expect(latest().url).toMatch(/\/room\?i=1$/);
  });

  it("reports input as activity at most every 20 s, and only when nothing else was sent", () => {
    latest().welcome();
    vi.advanceTimersByTime(1000); // the look and the first pose went out
    const s = latest();
    expect(s.sent.some((m) => m.startsWith('["p"'))).toBe(true);
    input("pointerdown");
    expect(s.sent).not.toContain(ACTIVE_MESSAGE);
    vi.advanceTimersByTime(20_000);
    input("pointerdown");
    input("keydown");
    expect(s.sent.filter((m) => m === ACTIVE_MESSAGE)).toHaveLength(1);
    vi.advanceTimersByTime(20_000);
    expect(s.sent.filter((m) => m === ACTIVE_MESSAGE)).toHaveLength(1); // no input, no report: pings only
    expect(s.sent).toContain("ping");
    input("keydown");
    expect(s.sent.filter((m) => m === ACTIVE_MESSAGE)).toHaveLength(2);
  });

  it("hangs up when the tab stays hidden for 2 minutes and waits for input once visible", () => {
    latest().welcome();
    const first = latest();
    setHidden(true);
    vi.advanceTimersByTime(2 * MINUTE - 1);
    expect(first.closedWith).toBeNull();
    vi.advanceTimersByTime(1);
    expect(first.closedWith).toEqual([1000, "hidden"]);
    expect(useNet.getState().status).toBe("idle");
    setHidden(false);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(FakeSocket.all).toHaveLength(1);
    input("pointerdown");
    expect(FakeSocket.all).toHaveLength(2);
    // The old socket's handlers were detached: its late close event cannot disturb the new connection.
    expect(first.onclose).toBeNull();
    latest().welcome();
    expect(useNet.getState().status).toBe("online");
  });

  it("keeps the connection when the tab comes back before 2 minutes", () => {
    latest().welcome();
    setHidden(true);
    vi.advanceTimersByTime(MINUTE);
    setHidden(false);
    vi.advanceTimersByTime(10 * MINUTE);
    expect(latest().closedWith).toBeNull();
    expect(FakeSocket.all).toHaveLength(1);
    expect(useNet.getState().status).toBe("online");
  });

  it("after a removal by an administrator, holds for 60 s whatever the input, then reconnects on the next input", () => {
    latest().welcome();
    latest().end(CLOSE_REMOVED);
    expect(useNet.getState().status).toBe("removed");
    expect(vi.getTimerCount()).toBe(0); // no retry, no ping, no pose loop: it cannot loop
    input("pointerdown");
    input("keydown");
    vi.advanceTimersByTime(MINUTE - 1);
    input("pointerdown");
    expect(FakeSocket.all).toHaveLength(1);
    expect(useNet.getState().status).toBe("removed");
    // Time alone never reconnects, however long.
    vi.advanceTimersByTime(30 * MINUTE);
    expect(FakeSocket.all).toHaveLength(1);
    input("keydown");
    expect(FakeSocket.all).toHaveLength(2);
    expect(latest().url).toMatch(/\/room\?i=0$/); // same room, and not counted as a failed attempt
    expect(useNet.getState().status).toBe("connecting");
    latest().welcome();
    expect(useNet.getState().status).toBe("online");
  });

  it("is removed again without looping, and an idle close afterwards has no hold", () => {
    latest().welcome();
    latest().end(CLOSE_REMOVED);
    vi.advanceTimersByTime(MINUTE);
    input("pointerdown");
    latest().welcome();
    latest().end(CLOSE_REMOVED);
    input("pointerdown");
    expect(FakeSocket.all).toHaveLength(2);
    vi.advanceTimersByTime(MINUTE);
    input("pointerdown");
    latest().welcome();
    latest().end(CLOSE_IDLE);
    expect(useNet.getState().status).toBe("idle");
    input("pointerdown"); // at once: the hold belongs to the removal only
    expect(FakeSocket.all).toHaveLength(4);
  });

  it("gives the moderation flow the welcomed connection, its answers and its end", () => {
    const heard: PresenceEvent[] = [];
    const stop = onPresenceEvent((e) => heard.push(e));
    expect(presenceLink()).toBeNull(); // not welcomed yet
    latest().welcome();
    const link = presenceLink()!;
    expect(link).toMatchObject({ room: 0, selfId: 7 });
    const request = encodeRemove(9, "A".repeat(32))!;
    expect(link.send(request)).toBe(true);
    expect(latest().sent).toContain(request);
    latest().onmessage?.({ data: '["l",9]' });
    latest().onmessage?.({ data: '["m",9,1]' });
    latest().onmessage?.({ data: '["m",9,2]' }); // junk: no event
    expect(heard).toEqual([{ type: "left", id: 9 }, { type: "removal", target: 9, ok: true }]);
    // A removal request is not activity: the next input still reports ["a"] after 20 s.
    vi.advanceTimersByTime(21_000);
    const before = latest().sent.filter((m) => m === ACTIVE_MESSAGE).length;
    expect(link.send(request)).toBe(true);
    input("keydown");
    expect(latest().sent.filter((m) => m === ACTIVE_MESSAGE)).toHaveLength(before + 1);
    latest().end(1006);
    expect(heard.at(-1)).toEqual({ type: "closed" });
    expect(presenceLink()).toBeNull();
    expect(link.send(request)).toBe(false); // the old link never writes to a later socket
    stop();
  });

  it("stops everything when the person turns other visitors off", () => {
    latest().welcome();
    latest().end(CLOSE_IDLE);
    disconnect();
    expect(useNet.getState().status).toBe("off");
    input("pointerdown");
    expect(FakeSocket.all).toHaveLength(1);
  });
});
