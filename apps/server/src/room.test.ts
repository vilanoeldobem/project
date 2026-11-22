import { describe, expect, it } from "vitest";

import { DEFAULT_LOOK } from "@vila/shared/game/cosmetics";
import { MOTION } from "@vila/shared/game/motion";
import { ACTIVE_MESSAGE, encodeLook, encodePose, encodeRemove, REMOVE_MAX_PER_MINUTE, REMOVE_MIN_INTERVAL_MS, ROOM_CAPACITY } from "@vila/shared/net/protocol";
import { DEFAULT_IDLE_TIMEOUT_SECONDS, type Env, idleTimeoutMs } from "./env";
import { handle } from "./handler";
import { MOVE_ALLOWANCE_CAP, RoomState, WALK_RATE } from "./room";

const pose = (x: number, z: number, yaw = 0, speed = 0) => encodePose({ x, z, yaw, speed });

describe("RoomState", () => {
  it("assigns anonymous ids and enforces capacity", () => {
    const r = new RoomState();
    const ids = Array.from({ length: ROOM_CAPACITY }, () => r.join(0));
    expect(new Set(ids).size).toBe(ROOM_CAPACITY);
    expect(r.join(0)).toBeNull();
    r.leave(ids[0]!);
    expect(r.join(0)).not.toBeNull();
  });

  it("broadcasts only what changed", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    r.flush(0);
    r.accept(a, pose(1, 9), 50);
    const out = r.flush(100);
    expect(out.map((p) => p[0])).toEqual([a]);
    expect(out[0][5]).toBe(50); // accepted 50 ms before the tick
    expect(r.flush(200)).toEqual([]);
    expect(r.flush(200, true).map((p) => p[0]).sort()).toEqual([a, b].sort());
  });

  it("rate-limits a flooding connection and flags abuse", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    let ok = 0, last: unknown = "";
    for (let i = 0; i < 400; i++) {
      last = r.accept(id, pose(0, 9), 0);
      if (last === "ok") ok++;
    }
    expect(ok).toBe(40); // burst only, no refill at the same instant
    expect(last).toBe("abuse");
  });
});

describe("movement allowance (anti-teleport)", () => {
  const Z = 9;
  /** x of the member's pose as the room broadcasts it. */
  const xOf = (r: RoomState, id: number, now: number) => r.flush(now, true).find((p) => p[0] === id)![1];
  /** Sends poses that each ask for `ask` units along +x, every `every` ms for `ms` ms after `t0`; returns where it ends. */
  const run = (r: RoomState, id: number, t0: number, every: number, ms: number, ask: number) => {
    let x = xOf(r, id, t0);
    for (let t = t0 + every; t <= t0 + ms; t += every) {
      r.accept(id, pose(x + ask, Z), t);
      x = xOf(r, id, t);
    }
    return x;
  };

  it("never clamps a normal 10 Hz walk at top speed", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    r.accept(id, pose(-40, Z), 0);
    const step = MOTION.maxSpeed * 0.1;
    for (let i = 1; i <= 80; i++) {
      r.accept(id, pose(-40 + step * i, Z), i * 100);
      expect(xOf(r, id, i * 100)).toBeCloseTo(-40 + step * i, 9);
    }
  });

  it("does not clamp poses bunched after a 400 ms stall", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    r.accept(id, pose(-40, Z), 0);
    const step = MOTION.maxSpeed * 0.1;
    // Ten seconds of walking at top speed and 10 Hz...
    let x = -40;
    for (let i = 1; i <= 100; i++) r.accept(id, pose((x = -40 + step * i), Z), i * 100);
    // ...then the network holds four poses for 400 ms and delivers them, with the fifth, within 2 ms.
    for (let k = 1; k <= 5; k++) r.accept(id, pose(x + step * k, Z), 10_400 + k * 0.4);
    expect(xOf(r, id, 10_402)).toBeCloseTo(x + step * 5, 9);
  });

  it("gives a 100 Hz flood no more distance in a second than 10 Hz", () => {
    const at10 = new RoomState(), at100 = new RoomState();
    const a = at10.join(0)!, b = at100.join(0)!;
    at10.accept(a, pose(-30, Z), 0);
    at100.accept(b, pose(-30, Z), 0);
    // Each pose asks for 5 units: far more than the old per-pose check allowed at 100 Hz (0.106 + 0.75 of slack,
    // which let ~60 accepted poses a second cover ~50 units). First second: both spend the full allowance and what
    // a second refills, never more; the flood is ahead by at most the 0.1 s of refill that the 10 Hz sender lost
    // to the cap before its first step.
    const slow1 = run(at10, a, 0, 100, 1000, 5);
    const fast1 = run(at100, b, 0, 10, 1000, 5);
    const most = -30 + MOVE_ALLOWANCE_CAP + WALK_RATE * 1 + 1e-9;
    expect(slow1).toBeLessThanOrEqual(most);
    expect(fast1).toBeLessThanOrEqual(most);
    expect(fast1 - slow1).toBeLessThanOrEqual(WALK_RATE * 0.1 + 1e-9);
    // Next second, with the allowance spent: exactly one second's walk each, however many poses.
    const slow2 = run(at10, a, 1000, 100, 1000, 5);
    const fast2 = run(at100, b, 1000, 10, 1000, 5);
    expect(slow2 - slow1).toBeCloseTo(WALK_RATE * 1, 9);
    expect(fast2 - fast1).toBeLessThanOrEqual(slow2 - slow1 + 1e-9);
  });

  it("still clamps a teleport along its direction", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    r.accept(id, pose(20, Z), 0);
    r.accept(id, pose(-20, Z), 100); // 40 units in 0.1 s
    const [[, x, z]] = r.flush(100);
    expect(x).toBeCloseTo(20 - MOVE_ALLOWANCE_CAP, 9); // the allowance is capped: idle time banks no more
    expect(z).toBe(Z);
    r.accept(id, pose(-20, Z), 200); // the budget is spent: only 0.1 s of refill
    expect(xOf(r, id, 200)).toBeCloseTo(20 - MOVE_ALLOWANCE_CAP - WALK_RATE * 0.1, 9);
    r.accept(id, pose(-20, Z), 60_000); // a long wait banks one second's walk, not a minute's
    expect(xOf(r, id, 60_000)).toBeCloseTo(20 - 2 * MOVE_ALLOWANCE_CAP - WALK_RATE * 0.1, 9);
  });

  it("lets the first pose place a visitor anywhere, also after a reconnect", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    expect(r.accept(id, pose(40, -40), 0)).toBe("ok");
    expect(r.flush(0, true)[0].slice(1, 3)).toEqual([40, -40]);
    // A connection rebuilt after hibernation is a new member: its first pose is free again.
    const again = new RoomState();
    again.join(1000, id);
    again.accept(id, pose(-40, 40), 1000);
    expect(again.flush(1000, true)[0].slice(1, 3)).toEqual([-40, 40]);
  });
});

describe("idle bookkeeping (IMPL-0014)", () => {
  const LIMIT = 60_000;
  const look = encodeLook({ ...DEFAULT_LOOK, helmet: "helmet-beanie" });

  it("removes only members idle for longer than the limit, once", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    r.accept(a, pose(1, 9), 30_000);
    expect(r.reapIdle(LIMIT, LIMIT)).toEqual([]); // exactly at the limit is not "longer than"
    expect(r.reapIdle(LIMIT + 1, LIMIT)).toEqual([b]);
    expect(r.ids()).toEqual([a]);
    expect(r.reapIdle(LIMIT + 2, LIMIT)).toEqual([]);
    expect(r.leave(b)).toBe(false); // the close handler finds nothing left to announce
    expect(r.accept(b, pose(2, 9), LIMIT + 3)).toBe("dropped"); // a late message does not bring it back
    expect(r.size).toBe(1);
    expect(r.reapIdle(30_000 + LIMIT + 1, LIMIT)).toEqual([a]);
    expect(r.size).toBe(0);
  });

  it("counts a pose that moves or turns, a look and an activity report", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    expect(r.activeAt(id)).toBe(0);
    r.accept(id, pose(1, 9), 1000); // first pose: placed
    expect(r.activeAt(id)).toBe(1000);
    r.accept(id, pose(1.5, 9), 2000); // moved
    expect(r.activeAt(id)).toBe(2000);
    r.accept(id, pose(1.5, 9, 1), 3000); // turned
    expect(r.activeAt(id)).toBe(3000);
    r.accept(id, look, 4000);
    expect(r.activeAt(id)).toBe(4000);
    expect(r.accept(id, ACTIVE_MESSAGE, 5000)).toBe("ok");
    expect(r.activeAt(id)).toBe(5000);
    expect(r.flush(5000, true)[0].slice(1, 4)).toEqual([1.5, 9, 1]); // the report leaves the pose alone
  });

  it("does not count a repeated pose, a keep-alive, junk or rate-limited messages", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    r.accept(id, pose(1, 9), 1000);
    expect(r.accept(id, pose(1, 9), 2000)).toBe("ok"); // same place, same heading
    expect(r.accept(id, pose(1, 9, 0, 2), 2500)).toBe("ok"); // only the speed differs
    for (const junk of ["ping", "pong", "", "{}", '["a",1]', '["x"]']) expect(r.accept(id, junk, 3000)).toBe("dropped");
    expect(r.activeAt(id)).toBe(1000);
    // Out of tokens: even a moving pose is dropped and keeps nobody present.
    const flood = r.join(10_000)!;
    for (let i = 0; i < 60; i++) r.accept(flood, pose(i / 100, 9), 10_000);
    expect(r.accept(flood, pose(5, 9), 10_010)).toBe("dropped");
    expect(r.activeAt(flood)).toBe(10_000);
    expect(r.reapIdle(1000 + LIMIT + 1, LIMIT)).toEqual([id]);
  });

  it("restores the activity time of a connection that survived hibernation, never in the future", () => {
    const r = new RoomState();
    expect(r.join(100_000, 7, 20_000)).toBe(7);
    expect(r.join(100_000, 8, 999_000)).toBe(8);
    expect(r.activeAt(7)).toBe(20_000);
    expect(r.activeAt(8)).toBe(100_000);
    expect(r.reapIdle(100_000, LIMIT)).toEqual([7]);
    expect(r.activeAt(7)).toBeUndefined();
  });
});

describe("removal requests (PROPOSTA, IMPL-0021)", () => {
  const TICKET = "Ab3_-zZ09Ab3_-zZ09Ab3_-zZ09Ab3_-";
  const remove = (target: number, ticket = TICKET) => encodeRemove(target, ticket)!;
  const SECOND = 1000;

  it("hands a well-formed request back with whether the target is another member of this room", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    expect(r.accept(a, remove(b), 0)).toEqual({ target: b, ticket: TICKET, valid: true });
    expect(r.accept(a, remove(a), 1 * SECOND)).toEqual({ target: a, ticket: TICKET, valid: false }); // itself
    expect(r.accept(a, remove(99), 2 * SECOND)).toEqual({ target: 99, ticket: TICKET, valid: false }); // nobody
    r.leave(b);
    expect(r.accept(a, remove(b), 3 * SECOND)).toEqual({ target: b, ticket: TICKET, valid: false }); // already left
    expect(r.has(a)).toBe(true);
    expect(r.has(b)).toBe(false);
  });

  it("is not activity and changes nothing the others see", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    r.flush(0);
    r.accept(a, remove(b), 5 * SECOND);
    expect(r.activeAt(a)).toBe(0);
    expect(r.activeAt(b)).toBe(0);
    expect(r.flush(5 * SECOND)).toEqual([]);
    expect(r.flushLooks()).toEqual([]);
    expect(r.reapIdle(60 * SECOND + 1, 60 * SECOND).sort()).toEqual([a, b].sort());
  });

  it("allows one request per second: a second one sooner is abuse", () => {
    expect(REMOVE_MIN_INTERVAL_MS).toBe(SECOND);
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!, c = r.join(0)!;
    expect(r.accept(a, remove(b), 10 * SECOND)).toMatchObject({ valid: true });
    expect(r.accept(a, remove(b), 11 * SECOND)).toMatchObject({ valid: true }); // exactly one second later
    expect(r.accept(a, remove(c), 12 * SECOND - 1)).toBe("abuse"); // another target does not reset the clock
    // The limit is per connection: somebody else is not affected.
    expect(r.accept(b, remove(c), 12 * SECOND - 1)).toMatchObject({ valid: true });
  });

  it("counts a request that names nobody or the sender exactly like any other", () => {
    const r = new RoomState();
    const a = r.join(0)!;
    expect(r.accept(a, remove(a), 0)).toMatchObject({ valid: false });
    expect(r.accept(a, remove(99), 999)).toBe("abuse");
  });

  it("allows ten requests per minute: the eleventh is abuse, and the window slides", () => {
    expect(REMOVE_MAX_PER_MINUTE).toBe(10);
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    for (let i = 0; i < 10; i++) expect(r.accept(a, remove(b), i * 2 * SECOND)).toMatchObject({ valid: true }); // 0 s … 18 s
    expect(r.accept(a, remove(b), 59 * SECOND)).toBe("abuse"); // eleventh inside 60 s of the first

    const s = new RoomState();
    const c = s.join(0)!, d = s.join(0)!;
    for (let i = 0; i < 10; i++) s.accept(c, remove(d), i * 2 * SECOND);
    expect(s.accept(c, remove(d), 60 * SECOND)).toMatchObject({ valid: true }); // the first one is a minute old
    expect(s.accept(c, remove(d), 61 * SECOND)).toBe("abuse"); // the second (at 2 s) still counts
    // Kept per connection: only the times of the last minute's requests, nothing about tickets or targets.
    for (let i = 0; i < 40; i++) expect(s.accept(d, remove(c), 1000 * SECOND + i * 7 * SECOND)).toMatchObject({ valid: true });
  });

  it("treats a malformed request as junk like any other malformed message, and it uses up no request", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    const junk = [`["m",${b},"${TICKET.slice(1)}"]`, `["m",${b},"${TICKET}",1]`, `["m",1.5,"${TICKET}"]`, `["m",0,"${TICKET}"]`, `["m",${b}]`, `["m", ${b}, "${TICKET}"]`];
    let now = 0;
    for (const raw of junk) expect(r.accept(a, raw, (now += 10))).toBe("dropped");
    // None of them counted towards the one-per-second limit…
    expect(r.accept(a, remove(b), (now += 10))).toMatchObject({ valid: true });
    // …but they count as dropped messages: past the tolerance the connection is closed as abusive.
    let last: unknown;
    for (let i = 0; i < 200; i++) last = r.accept(a, junk[i % junk.length], (now += 100));
    expect(last).toBe("abuse");
  });

  it("is dropped, not passed on, when the connection has no message allowance left", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    for (let i = 0; i < 40; i++) r.accept(a, pose(i / 100, 9), 0); // burst spent
    expect(r.accept(a, remove(b), 0)).toBe("dropped");
    expect(r.accept(a, remove(b), SECOND)).toMatchObject({ valid: true }); // and it used up no request
  });

  it("never hands an id out twice while the room stays in memory, but a restarted room counts again", () => {
    const r = new RoomState();
    const first = [r.join(0)!, r.join(0)!, r.join(0)!];
    r.leave(first[2]);
    r.leave(first[0]);
    const later = [r.join(0)!, r.join(0)!];
    expect(new Set([...first, ...later]).size).toBe(5);
    // What a wake-up does: the survivors keep their ids and the next newcomer gets the lowest free one above
    // them, which may be an id that meant somebody else before (hence REMOVAL_WARMUP_MS in moderation.ts).
    const woken = new RoomState();
    woken.join(0, first[1]);
    expect(woken.join(0)).toBe(first[2]);
    expect(new RoomState().join(0)).toBe(first[0]);
  });
});

describe("idle limit configuration", () => {
  const ms = (v?: string) => idleTimeoutMs({ IDLE_TIMEOUT_SECONDS: v });

  it("defaults to 5 minutes", () => {
    expect(DEFAULT_IDLE_TIMEOUT_SECONDS).toBe(300);
    expect(idleTimeoutMs({})).toBe(300_000);
  });

  it("accepts whole seconds from one minute to one day", () => {
    expect(ms("60")).toBe(60_000);
    expect(ms(" 600 ")).toBe(600_000);
    expect(ms("86400")).toBe(86_400_000);
    expect(idleTimeoutMs({ IDLE_TIMEOUT_SECONDS: 120 as unknown as string })).toBe(120_000); // a JSON number var
  });

  it("falls back to the default on nonsense", () => {
    for (const bad of ["", " ", "0", "59", "86401", "-300", "12.5", "1e3", "5m", "abc", "NaN", "Infinity", "9999999999"])
      expect(ms(bad)).toBe(300_000);
  });
});

describe("realtime routes", () => {
  const env: Env = { ALLOWED_ORIGINS: "https://play.example, http://localhost:5173" };
  const req = (headers: Record<string, string>, path = "/room") => handle(new Request(`https://server.example${path}`, { headers }), env);
  const ok = { Upgrade: "websocket", Origin: "https://play.example" };

  it("requires a WebSocket upgrade from an allowed page origin", async () => {
    expect((await req({})).status).toBe(426);
    expect((await req({ Upgrade: "websocket", Origin: "https://evil.example" })).status).toBe(403);
    expect((await req({ Upgrade: "websocket", Origin: "https://play.example.evil.example" })).status).toBe(403);
    expect((await req({ Upgrade: "websocket" })).status).toBe(403);
  });

  it("bounds the room index and degrades without the binding", async () => {
    expect((await req(ok, "/room?i=99")).status).toBe(400);
    expect((await req(ok, "/room?i=0")).status).toBe(503);
  });

  it("answers health and 404s", async () => {
    expect(await (await req({}, "/health")).json()).toEqual({ ok: true, service: "server", rooms: false });
    expect((await req({}, "/nope")).status).toBe(404);
  });

  it("is ready only when room 0 answers its ping", async () => {
    const notReady = await req({}, "/ready");
    expect(notReady.status).toBe(503);
    expect(await notReady.json()).toEqual({ ok: false, rooms: "fail" });
    const names: string[] = [];
    const urls: string[] = [];
    const rooms = (status: number | Error) =>
      ({
        idFromName: (name: string) => (names.push(name), name),
        get: () => ({ fetch: async (url: string) => (urls.push(url), status instanceof Error ? Promise.reject(status) : new Response(null, { status })) }),
      }) as unknown as DurableObjectNamespace;
    const ready = (status: number | Error) => handle(new Request("https://server.example/ready"), { ...env, ROOMS: rooms(status) } as Env);
    const res = await ready(204);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, rooms: "ok" });
    expect(names).toEqual(["plaza-0"]);
    expect(urls).toEqual(["https://room.internal/ready"]);
    expect((await ready(426)).status).toBe(503);
    expect((await ready(new Error("gone"))).status).toBe(503);
  });
});

describe("looks", () => {
  const look = (helmet: string) => encodeLook({ ...DEFAULT_LOOK, helmet });

  it("stores valid looks, broadcasts changes once, and replays custom looks to newcomers", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    expect(r.accept(a, look("helmet-beanie"), 0)).toBe("ok");
    expect(r.flushLooks().map((x) => x.id)).toEqual([a]);
    expect(r.flushLooks()).toEqual([]);
    expect(r.flushLooks(true).map((x) => x.id)).toEqual([a]); // b still wears the default
    expect(b).toBeGreaterThan(0);
  });

  it("broadcasts a change back to the default once, but does not replay it to a newcomer", () => {
    const r = new RoomState();
    const a = r.join(0)!;
    expect(r.accept(a, look(DEFAULT_LOOK.helmet), 0)).toBe("ok");
    expect(r.flushLooks().map((x) => x.id)).toEqual([a]);
    expect(r.flushLooks()).toEqual([]);
    expect(r.flushLooks(true)).toEqual([]); // a newcomer already assumes the default
  });

  it("rejects unknown indexes, wrong lengths and the old array form", () => {
    const r = new RoomState();
    const a = r.join(0)!;
    for (const bad of [
      '["k","000000000z"]',
      '["k","000000000"]',
      '["k","00000000000"]',
      '["k",["helmet-santa","blouse-plain"]]',
      '["k","helmet-santa"]',
    ])
      expect(r.accept(a, bad, 0), bad).toBe("dropped");
    expect(r.flushLooks()).toEqual([]);
  });
});
