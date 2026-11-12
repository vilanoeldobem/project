/**
 * `VillageRoom` wiring for the idle timeout (IMPL-0014), run in Node with fake sockets and fake timers. The
 * rooms are built the way the runtime rebuilds them after a wake-up: from the sockets it kept attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVE_MESSAGE, CLOSE_IDLE, encodePose, encodeServer } from "@vila/shared/net/protocol";
import type { Env } from "./env";
import { VillageRoom } from "./room-do";

vi.mock("cloudflare:workers", () => ({
  DurableObject: class {
    constructor(
      protected ctx: unknown,
      protected env: unknown,
    ) {}
  },
}));

class FakeSocket {
  sent: string[] = [];
  closed: [number, string] | null = null;
  constructor(public attachment: { id: number; room: number; seen?: number }) {}
  deserializeAttachment() {
    return this.attachment;
  }
  serializeAttachment(a: FakeSocket["attachment"]) {
    this.attachment = a;
  }
  send(msg: string) {
    if (this.closed) throw new TypeError("send after close");
    this.sent.push(msg);
  }
  close(code: number, reason: string) {
    if (this.closed) throw new TypeError("close after close");
    this.closed = [code, reason];
  }
}

const T0 = 1_800_000_000_000;
const SECOND = 1000;
const left = (id: number) => encodeServer({ t: "l", id });
const pose = (x: number, z: number) => encodePose({ x, z, yaw: 0, speed: 3 });

function wake(sockets: FakeSocket[], env: Env = { IDLE_TIMEOUT_SECONDS: "60" }) {
  const autoResponses: Array<{ request: string; response: string }> = [];
  const ctx = {
    getWebSockets: () => sockets,
    setWebSocketAutoResponse: (pair: { request: string; response: string }) => void autoResponses.push(pair),
  };
  const room = new VillageRoom(ctx as unknown as DurableObjectState, env);
  const say = (ws: FakeSocket, msg: string) => room.webSocketMessage(ws as unknown as WebSocket, msg);
  const hangUp = (ws: FakeSocket, code: number) => room.webSocketClose(ws as unknown as WebSocket, code);
  return { room, say, hangUp, autoResponses };
}

describe("VillageRoom idle timeout", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(T0);
    vi.stubGlobal(
      "WebSocketRequestResponsePair",
      class {
        constructor(
          public request: string,
          public response: string,
        ) {}
      },
    );
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("closes only the idle connection with 4002 'idle' and tells the others it left", async () => {
    const a = new FakeSocket({ id: 1, room: 0, seen: T0 }), b = new FakeSocket({ id: 2, room: 0, seen: T0 });
    const { say, hangUp } = wake([a, b]);
    await vi.advanceTimersByTimeAsync(50 * SECOND);
    await say(a, pose(1, 9)); // a walks; b does nothing
    await vi.advanceTimersByTimeAsync(15 * SECOND); // 65 s after b's last activity, 15 s after a's
    expect(b.closed).toEqual([CLOSE_IDLE, "idle"]);
    expect(CLOSE_IDLE).toBe(4002);
    expect(a.closed).toBeNull();
    expect(a.sent.filter((m) => m === left(2))).toHaveLength(1);
    // The browser's close echo arrives later: nobody is told twice.
    await hangUp(b, CLOSE_IDLE);
    expect(a.sent.filter((m) => m === left(2))).toHaveLength(1);
  });

  it("stops its timer once everyone left or was closed as idle, so the room can hibernate", async () => {
    const a = new FakeSocket({ id: 1, room: 0, seen: T0 });
    wake([a]);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(61 * SECOND);
    expect(a.closed).toEqual([CLOSE_IDLE, "idle"]);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("keeps a connection whose person reports input without walking, and never counts the keep-alive", async () => {
    const a = new FakeSocket({ id: 1, room: 0, seen: T0 });
    const { say, autoResponses } = wake([a]);
    // "ping" is answered by the runtime and never reaches the room…
    expect(autoResponses).toEqual([{ request: "ping", response: "pong" }]);
    for (let s = 0; s < 180; s += 20) {
      await vi.advanceTimersByTimeAsync(20 * SECOND);
      await say(a, ACTIVE_MESSAGE);
    }
    expect(a.closed).toBeNull();
    // …and if one did, it would not count as activity.
    for (let s = 0; s < 80; s += 20) {
      await vi.advanceTimersByTimeAsync(20 * SECOND);
      await say(a, "ping");
    }
    expect(a.closed).toEqual([CLOSE_IDLE, "idle"]);
  });

  it("drops a late message from a connection it already closed (no way back without reconnecting)", async () => {
    const a = new FakeSocket({ id: 1, room: 0, seen: T0 }), b = new FakeSocket({ id: 2, room: 0, seen: T0 });
    const { say } = wake([a, b]);
    await vi.advanceTimersByTimeAsync(59 * SECOND);
    await say(a, pose(1, 9));
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(b.closed).toEqual([CLOSE_IDLE, "idle"]);
    const before = a.sent.length;
    await say(b, pose(3, 9));
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(a.sent.length).toBe(before); // b's pose is not broadcast
  });

  it("after a wake-up closes at once whoever was already idle, using the time kept with the socket", async () => {
    const stale = new FakeSocket({ id: 1, room: 0, seen: T0 - 10 * 60 * SECOND });
    const fresh = new FakeSocket({ id: 2, room: 0, seen: T0 - 10 * SECOND });
    const legacy = new FakeSocket({ id: 3, room: 0 }); // accepted before IMPL-0014: gets a full window
    wake([stale, fresh, legacy]);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(stale.closed).toEqual([CLOSE_IDLE, "idle"]);
    expect(fresh.closed).toBeNull();
    expect(legacy.closed).toBeNull();
    expect(fresh.sent).toContain(left(1));
    await vi.advanceTimersByTimeAsync(50 * SECOND);
    expect(fresh.closed).toEqual([CLOSE_IDLE, "idle"]);
    expect(legacy.closed).toBeNull();
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(legacy.closed).toEqual([CLOSE_IDLE, "idle"]);
  });

  it("refreshes the activity time kept with the socket at most every 30 s", async () => {
    const a = new FakeSocket({ id: 1, room: 0, seen: T0 });
    const { say } = wake([a]);
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    await say(a, pose(1, 9));
    expect(a.attachment.seen).toBe(T0);
    await vi.advanceTimersByTimeAsync(25 * SECOND);
    await say(a, pose(2, 9));
    expect(a.attachment).toEqual({ id: 1, room: 0, seen: T0 + 35 * SECOND });
  });

  it("falls back to the 5 minute default when the variable is nonsense", async () => {
    const a = new FakeSocket({ id: 1, room: 0, seen: T0 });
    wake([a], { IDLE_TIMEOUT_SECONDS: "soon" });
    await vi.advanceTimersByTimeAsync(299 * SECOND);
    expect(a.closed).toBeNull();
    await vi.advanceTimersByTimeAsync(2 * SECOND);
    expect(a.closed).toEqual([CLOSE_IDLE, "idle"]);
  });
});
