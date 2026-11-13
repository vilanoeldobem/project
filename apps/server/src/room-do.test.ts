/**
 * `VillageRoom` wiring for the idle timeout (IMPL-0014) and for removal at an administrator's request
 * (PROPOSTA, IMPL-0021), run in Node with fake sockets, a fake `API` binding and fake timers. The rooms are
 * built the way the runtime rebuilds them after a wake-up: from the sockets it kept attached.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ACTIVE_MESSAGE, CLOSE_ABUSE, CLOSE_IDLE, CLOSE_REMOVED, encodePose, encodeRemove, encodeServer } from "@vila/shared/net/protocol";
import type { Env } from "./env";
import { CONSUME_TIMEOUT_MS, REMOVAL_WARMUP_MS } from "./moderation";
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
  /** Every touch of the object's storage (or of anything else the room has no business with) lands here. */
  const storageUse: string[] = [];
  const storage = new Proxy({}, { get: (_, key) => (storageUse.push(String(key)), () => Promise.reject(new Error("storage is never used"))) });
  const ctx = {
    getWebSockets: () => sockets,
    setWebSocketAutoResponse: (pair: { request: string; response: string }) => void autoResponses.push(pair),
    get storage() {
      storageUse.push("storage");
      return storage;
    },
  };
  const room = new VillageRoom(ctx as unknown as DurableObjectState, env);
  const say = (ws: FakeSocket, msg: string) => room.webSocketMessage(ws as unknown as WebSocket, msg);
  const hangUp = (ws: FakeSocket, code: number) => room.webSocketClose(ws as unknown as WebSocket, code);
  return { room, say, hangUp, autoResponses, storageUse };
}

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
  vi.restoreAllMocks();
});

describe("VillageRoom idle timeout", () => {
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

describe("VillageRoom removal at an administrator's request (PROPOSTA, IMPL-0021)", () => {
  const TICKET = "Ab3_-zZ09Ab3_-zZ09Ab3_-zZ09Ab3_-";
  const OTHER_TICKET = "zZ09Ab3_-zZ09Ab3_-zZ09Ab3_-zZ09A";
  const ROOM = 3;
  const remove = (target: number, ticket = TICKET) => encodeRemove(target, ticket)!;
  const answered = (target: number, ok: boolean) => encodeServer({ t: "m", target, ok });
  const count = (ws: FakeSocket, msg: string) => ws.sent.filter((m) => m === msg).length;
  const yes = () => new Response('{"ok":true}', { status: 200 });
  const no = (status = 404, body = '{"error":"not_found"}') => new Response(body, { status });

  interface Call {
    url: string;
    init: RequestInit;
  }

  /** A stand-in for the `API` binding: records every call and answers with `respond`. */
  function binding(respond: (call: Call) => Response | Promise<Response> = yes) {
    const calls: Call[] = [];
    const api = {
      fetch: async (url: string, init: RequestInit) => {
        const call = { url, init };
        calls.push(call);
        return respond(call);
      },
    };
    return { api: api as unknown as Fetcher, calls };
  }

  /** A binding whose answer waits until the test releases it. */
  function heldBinding() {
    const release: Array<(r: Response) => void> = [];
    const held = binding(() => new Promise<Response>((resolve) => release.push(resolve)));
    return { ...held, release };
  }

  /**
   * A room past its warm-up with an administrator's connection (1), a visitor (2) and a bystander (3). The
   * idle limit is a day so that only the behaviour under test closes anybody.
   */
  async function open(api: Fetcher | undefined, overrides: Partial<Env> = {}) {
    const admin = new FakeSocket({ id: 1, room: ROOM, seen: T0 });
    const visitor = new FakeSocket({ id: 2, room: ROOM, seen: T0 });
    const bystander = new FakeSocket({ id: 3, room: ROOM, seen: T0 });
    const sockets = [admin, visitor, bystander];
    const env: Env = { IDLE_TIMEOUT_SECONDS: "86400", PRESENCE_MODERATION_ENABLED: "true", API: api, ...overrides };
    const woken = wake(sockets, env);
    await vi.advanceTimersByTimeAsync(REMOVAL_WARMUP_MS);
    return { ...woken, admin, visitor, bystander, sockets };
  }

  /** True when `needle` is reachable from `root` through own properties, Map/Set entries or array items. */
  function holds(root: unknown, needle: string, seen = new Set<unknown>()): boolean {
    if (typeof root === "string") return root.includes(needle);
    if (typeof root !== "object" || root === null || seen.has(root)) return false;
    seen.add(root);
    if (root instanceof Map) return [...root.entries()].some(([k, v]) => holds(k, needle, seen) || holds(v, needle, seen));
    if (root instanceof Set) return [...root.values()].some((v) => holds(v, needle, seen));
    return Reflect.ownKeys(root).some((key) => {
      const d = Object.getOwnPropertyDescriptor(root, key);
      return holds(String(key), needle, seen) || (d !== undefined && "value" in d && holds(d.value, needle, seen));
    });
  }

  it("closes the target with 4003 once the API consumed the ticket, and tells everybody exactly once", async () => {
    const { api, calls } = binding();
    const { say, hangUp, admin, visitor, bystander } = await open(api);
    await say(admin, remove(2));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.internal/moderation/consume");
    expect(calls[0].init.method).toBe("POST");
    expect(calls[0].init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(calls[0].init.body as string)).toEqual({ ticket: TICKET, room: ROOM, target: 2 });

    expect(CLOSE_REMOVED).toBe(4003);
    expect(visitor.closed).toEqual([CLOSE_REMOVED, "removed"]);
    expect(admin.closed).toBeNull();
    expect(bystander.closed).toBeNull();
    expect(count(admin, answered(2, true))).toBe(1);
    expect(count(admin, answered(2, false))).toBe(0);
    expect(count(bystander, answered(2, true))).toBe(0); // only the sender gets the answer
    expect(count(admin, left(2))).toBe(1);
    expect(count(bystander, left(2))).toBe(1);
    expect(visitor.sent).not.toContain(left(2));

    // The browser's close echo arrives later: nobody is told twice, and the room does not try to close again.
    await hangUp(visitor, CLOSE_REMOVED);
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(count(admin, left(2))).toBe(1);
    expect(count(bystander, left(2))).toBe(1);
    expect(visitor.closed).toEqual([CLOSE_REMOVED, "removed"]);
  });

  it("drops what a removed connection still sends, and a second request for it answers 0 without a call", async () => {
    const { api, calls } = binding();
    const { say, admin, visitor, bystander } = await open(api);
    await say(admin, remove(2));
    const before = bystander.sent.length;
    await say(visitor, pose(3, 9));
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(bystander.sent.length).toBe(before); // the pose is not broadcast
    await say(admin, remove(2, OTHER_TICKET));
    expect(calls).toHaveLength(1);
    expect(count(admin, answered(2, false))).toBe(1);
  });

  it("answers 0 and calls nothing while the flag is anything but \"true\"", async () => {
    for (const flag of ["false", undefined, "", "TRUE", "1"]) {
      const { api, calls } = binding();
      const { say, admin, visitor } = await open(api, { PRESENCE_MODERATION_ENABLED: flag });
      await say(admin, remove(2));
      expect(calls, String(flag)).toHaveLength(0);
      expect(admin.sent.filter((m) => m.startsWith('["m"')), String(flag)).toEqual([answered(2, false)]);
      expect(visitor.closed, String(flag)).toBeNull();
      expect(admin.closed, String(flag)).toBeNull(); // not protocol abuse: a client may be newer than the server
    }
  });

  it("answers 0 and closes nobody when the API binding is missing", async () => {
    const { say, admin, visitor, sockets } = await open(undefined);
    await say(admin, remove(2));
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(2, false)]);
    expect(sockets.map((ws) => ws.closed)).toEqual([null, null, null]);
    expect(visitor.sent).not.toContain(left(2));
  });

  it("refuses a connection that targets itself, without asking the API", async () => {
    const { api, calls } = binding();
    const { say, admin, sockets } = await open(api);
    await say(admin, remove(1));
    expect(calls).toHaveLength(0);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(1, false)]);
    expect(sockets.map((ws) => ws.closed)).toEqual([null, null, null]);
  });

  it("refuses a target that is not in this room, without asking the API", async () => {
    const { api, calls } = binding();
    const { say, hangUp, admin, visitor, sockets } = await open(api);
    await say(admin, remove(99));
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(99, false)]);
    // Somebody who already left is nobody too.
    await hangUp(visitor, 1000);
    await vi.advanceTimersByTimeAsync(SECOND);
    await say(admin, remove(2));
    expect(count(admin, answered(2, false))).toBe(1);
    expect(calls).toHaveLength(0);
    expect(sockets.map((ws) => ws.closed?.[0] ?? null)).toEqual([null, 1000, null]);
  });

  it("closes nobody when the API refuses, fails or answers nonsense", async () => {
    const refusals: Array<() => Response | Promise<Response>> = [
      () => no(404),
      () => no(409, '{"error":"bad_transition"}'),
      () => no(500, '{"error":"internal"}'),
      () => no(200, "not json"),
      () => no(200, '{"ok":false}'),
      () => no(200, '{"ok":true,"more":1}'),
      () => no(201, '{"ok":true}'),
      () => Promise.reject(new Error("network")),
    ];
    for (const [i, respond] of refusals.entries()) {
      const { api, calls } = binding(respond);
      const { say, admin, sockets } = await open(api);
      await say(admin, remove(2));
      expect(calls, `case ${i}`).toHaveLength(1);
      expect(admin.sent.filter((m) => m.startsWith('["m"')), `case ${i}`).toEqual([answered(2, false)]);
      expect(sockets.map((ws) => ws.closed), `case ${i}`).toEqual([null, null, null]);
      expect(sockets.some((ws) => ws.sent.includes(left(2))), `case ${i}`).toBe(false);
    }
  });

  it("answers 0 after 3 seconds when the API is slow, and a late yes removes nobody", async () => {
    const { api, calls, release } = heldBinding();
    const { say, admin, visitor, sockets } = await open(api);
    const pending = say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(CONSUME_TIMEOUT_MS - 1);
    expect(calls).toHaveLength(1);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    await pending;
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(2, false)]);
    release[0](yes());
    await vi.advanceTimersByTimeAsync(10 * SECOND);
    expect(sockets.map((ws) => ws.closed)).toEqual([null, null, null]);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(2, false)]);
    expect(visitor.sent).not.toContain(left(2));
  });

  it("refuses a second request from the same connection while its first is being checked", async () => {
    const { api, calls, release } = heldBinding();
    const { say, admin, visitor, bystander } = await open(api);
    const first = say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(SECOND);
    await say(admin, remove(3, OTHER_TICKET)); // a different target and ticket: still one check at a time
    expect(calls).toHaveLength(1);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(3, false)]);
    expect(bystander.closed).toBeNull();
    release[0](yes());
    await first;
    expect(visitor.closed).toEqual([CLOSE_REMOVED, "removed"]);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(3, false), answered(2, true)]);
    // Once the check ended the connection may ask again.
    await vi.advanceTimersByTimeAsync(SECOND);
    const second = say(admin, remove(3, OTHER_TICKET));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    release[1](yes());
    await second;
    expect(bystander.closed).toEqual([CLOSE_REMOVED, "removed"]);
  });

  it("lets a failed check end too: the connection is not stuck as 'being checked'", async () => {
    const { api, calls } = binding(() => Promise.reject(new Error("network")));
    const { say, admin } = await open(api);
    await say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(SECOND);
    await say(admin, remove(2, OTHER_TICKET));
    expect(calls).toHaveLength(2);
  });

  it("checks two connections' requests independently, and the second yes for the same target removes nobody else", async () => {
    const { api, calls, release } = heldBinding();
    const { say, admin, visitor, bystander } = await open(api);
    const one = say(admin, remove(2));
    const two = say(bystander, remove(2, OTHER_TICKET));
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    release[0](yes());
    release[1](yes());
    await Promise.all([one, two]);
    expect(visitor.closed).toEqual([CLOSE_REMOVED, "removed"]);
    expect(count(admin, answered(2, true))).toBe(1);
    expect(count(bystander, answered(2, false))).toBe(1);
    expect(count(admin, left(2))).toBe(1);
    expect(count(bystander, left(2))).toBe(1);
    expect(admin.closed).toBeNull();
    expect(bystander.closed).toBeNull();
  });

  it("removes nobody when the target leaves while the API is being asked", async () => {
    const { api, release } = heldBinding();
    const { say, hangUp, admin, visitor, bystander } = await open(api);
    const pending = say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(500);
    await hangUp(visitor, 1001);
    expect(count(admin, left(2))).toBe(1);
    release[0](yes());
    await pending;
    expect(visitor.closed).toEqual([1001, "bye"]); // its own goodbye, never 4003
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(2, false)]);
    expect(count(admin, left(2))).toBe(1);
    expect(count(bystander, left(2))).toBe(1);
    expect(admin.closed).toBeNull();
    expect(bystander.closed).toBeNull();
  });

  it("removes nobody when the target is closed as idle while the API is being asked", async () => {
    const { api, release } = heldBinding();
    const { say, admin, visitor, bystander } = await open(api, { IDLE_TIMEOUT_SECONDS: "60" });
    await vi.advanceTimersByTimeAsync(23 * SECOND); // 58 s after the last activity of everybody
    await say(admin, ACTIVE_MESSAGE);
    await say(bystander, ACTIVE_MESSAGE);
    const pending = say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(2500); // the visitor passes the idle limit during the call
    expect(visitor.closed).toEqual([CLOSE_IDLE, "idle"]);
    release[0](yes());
    await pending;
    expect(visitor.closed).toEqual([CLOSE_IDLE, "idle"]);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(2, false)]);
    expect(count(bystander, left(2))).toBe(1);
  });

  it("still removes the target when the sender leaves while the API is being asked", async () => {
    const { api, release } = heldBinding();
    const { say, hangUp, admin, visitor, bystander } = await open(api);
    const pending = say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(500);
    await hangUp(admin, 1001);
    const sentToAdmin = admin.sent.length;
    release[0](yes());
    await expect(pending).resolves.toBeUndefined(); // sending to a closed socket must not crash the room
    expect(visitor.closed).toEqual([CLOSE_REMOVED, "removed"]);
    expect(admin.sent.length).toBe(sentToAdmin);
    expect(count(bystander, left(2))).toBe(1);
    expect(count(bystander, left(1))).toBe(1);
    expect(bystander.closed).toBeNull();
  });

  it("closes a connection that asks twice within a second, whatever the first answer was", async () => {
    const { api, calls } = binding(() => no(404));
    const { say, admin, visitor } = await open(api);
    await say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(SECOND - 1);
    await say(admin, remove(2, OTHER_TICKET));
    expect(admin.closed).toEqual([CLOSE_ABUSE, "rate"]);
    expect(CLOSE_ABUSE).toBe(1008);
    expect(calls).toHaveLength(1); // the abusive request is not passed on
    expect(count(admin, answered(2, false))).toBe(1); // and gets no answer
    expect(visitor.closed).toBeNull();
    // Whatever it still sends before the close completes changes nothing and does not crash the room.
    await expect(say(admin, remove(2))).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
    expect(admin.closed).toEqual([CLOSE_ABUSE, "rate"]);
  });

  it("closes a connection on its eleventh request within a minute", async () => {
    const { api, calls } = binding(() => no(404));
    const { say, admin } = await open(api);
    for (let i = 0; i < 10; i++) {
      await say(admin, remove(2));
      await vi.advanceTimersByTimeAsync(2 * SECOND);
    }
    expect(admin.closed).toBeNull();
    expect(calls).toHaveLength(10);
    await say(admin, remove(2));
    expect(admin.closed).toEqual([CLOSE_ABUSE, "rate"]);
    expect(calls).toHaveLength(10);
  });

  it("applies the same limits with the flag off", async () => {
    const { api, calls } = binding();
    const { say, admin } = await open(api, { PRESENCE_MODERATION_ENABLED: "false" });
    await say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(500);
    await say(admin, remove(2));
    expect(admin.closed).toEqual([CLOSE_ABUSE, "rate"]);
    expect(calls).toHaveLength(0);

    const quiet = await open(api, { PRESENCE_MODERATION_ENABLED: "false" });
    for (let i = 0; i < 10; i++) {
      await quiet.say(quiet.admin, remove(2));
      await vi.advanceTimersByTimeAsync(2 * SECOND);
    }
    expect(quiet.admin.closed).toBeNull();
    expect(count(quiet.admin, answered(2, false))).toBe(10);
    await quiet.say(quiet.admin, remove(2));
    expect(quiet.admin.closed).toEqual([CLOSE_ABUSE, "rate"]);
    expect(calls).toHaveLength(0);
  });

  it("gives a malformed request no answer and no call: it is junk like any other", async () => {
    const { api, calls } = binding();
    const { say, admin, sockets } = await open(api);
    for (const raw of [`["m",2,"${TICKET.slice(1)}"]`, `["m",2,"${TICKET}",1]`, `["m",2.5,"${TICKET}"]`, `["m",2]`, `["m", 2, "${TICKET}"]`]) await say(admin, raw);
    expect(calls).toHaveLength(0);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([]);
    expect(sockets.map((ws) => ws.closed)).toEqual([null, null, null]);
    // Enough junk closes the connection as abusive: the 201st dropped message (5 above, 196 here).
    let more = 0;
    while (!admin.closed && more < 1000) {
      await vi.advanceTimersByTimeAsync(100);
      await say(admin, `["m",2,"${TICKET}",${more++}]`);
    }
    expect(more).toBe(196);
    expect(admin.closed).toEqual([CLOSE_ABUSE, "rate"]);
    expect(calls).toHaveLength(0);
  });

  it("does not act on requests until the room has been in memory for longer than a ticket lives", async () => {
    // A restarted room hands the low ids out again: connection 2 here may not be who a ticket issued just
    // before the restart was about.
    const { api, calls } = binding();
    const admin = new FakeSocket({ id: 1, room: ROOM, seen: T0 }), newcomer = new FakeSocket({ id: 2, room: ROOM, seen: T0 });
    const { say } = wake([admin, newcomer], { IDLE_TIMEOUT_SECONDS: "86400", PRESENCE_MODERATION_ENABLED: "true", API: api });
    await say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(REMOVAL_WARMUP_MS - 1);
    await say(admin, remove(2));
    expect(calls).toHaveLength(0);
    expect(admin.sent.filter((m) => m.startsWith('["m"'))).toEqual([answered(2, false), answered(2, false)]);
    expect(newcomer.closed).toBeNull();
    await vi.advanceTimersByTimeAsync(SECOND);
    await say(admin, remove(2));
    expect(calls).toHaveLength(1);
    expect(newcomer.closed).toEqual([CLOSE_REMOVED, "removed"]);
  });

  it("keeps and writes nothing: no storage, no log, no ticket left in the room or with the sockets", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => {}));
    const { api, release } = heldBinding();
    const { room, say, hangUp, storageUse, admin, visitor, bystander, sockets } = await open(api);
    const attachments = sockets.map((ws) => ({ ...ws.attachment }));

    // While the API is being asked the ticket exists only in the call itself.
    const pending = say(admin, remove(2));
    await vi.advanceTimersByTimeAsync(SECOND);
    expect(holds(room, TICKET)).toBe(false);
    release[0](yes());
    await pending;
    await hangUp(visitor, CLOSE_REMOVED);

    // A refused and a failed request leave nothing either.
    await vi.advanceTimersByTimeAsync(SECOND);
    await say(admin, remove(1, OTHER_TICKET));
    await vi.advanceTimersByTimeAsync(SECOND);
    const failing = say(admin, remove(3, OTHER_TICKET));
    await vi.advanceTimersByTimeAsync(0);
    release[1](no(404));
    await failing;
    await vi.advanceTimersByTimeAsync(SECOND);

    expect(storageUse).toEqual([]);
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(holds(room, TICKET)).toBe(false);
    expect(holds(room, OTHER_TICKET)).toBe(false);
    expect(sockets.map((ws) => ws.attachment)).toEqual(attachments); // { id, room, seen } and nothing else
    for (const ws of sockets) expect(holds(ws, TICKET) || holds(ws, OTHER_TICKET)).toBe(false);
    expect(bystander.closed).toBeNull();
    expect(vi.getTimerCount()).toBe(1); // only the room's tick: the call's timeout is gone
  });
});
