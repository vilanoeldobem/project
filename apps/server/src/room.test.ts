import { describe, expect, it } from "vitest";

import { MOTION } from "@vila/shared/game/motion";
import { ACTIVE_MESSAGE, encodePose, ROOM_CAPACITY } from "@vila/shared/net/protocol";
import { DEFAULT_IDLE_TIMEOUT_SECONDS, type Env, idleTimeoutMs } from "./env";
import { handle } from "./handler";
import { RoomState } from "./room";

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

  it("lets the first pose place a visitor anywhere, then refuses teleports", () => {
    const r = new RoomState();
    const id = r.join(0)!;
    expect(r.accept(id, pose(20, 0), 0)).toBe("ok");
    r.accept(id, pose(-20, 0), 100); // 40 units in 0.1 s
    const [[, x]] = r.flush(100);
    expect(x).toBeGreaterThan(20 - (MOTION.maxSpeed * 1.25 * 0.1 + 0.75) - 1e-9);
    expect(x).toBeLessThan(20);
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
    let ok = 0, last = "";
    for (let i = 0; i < 400; i++) {
      last = r.accept(id, pose(0, 9), 0);
      if (last === "ok") ok++;
    }
    expect(ok).toBe(40); // burst only, no refill at the same instant
    expect(last).toBe("abuse");
  });
});

describe("idle bookkeeping (IMPL-0014)", () => {
  const LIMIT = 60_000;
  const look = JSON.stringify(["k", "hat-beanie", "scarf-stripes", "sweater-none", "palette-classic"]);

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
});

describe("looks", () => {
  const look = (...ids: string[]) => JSON.stringify(["k", ...ids]);

  it("stores valid looks, broadcasts changes once, and replays custom looks to newcomers", () => {
    const r = new RoomState();
    const a = r.join(0)!, b = r.join(0)!;
    expect(r.accept(a, look("hat-beanie", "scarf-stripes", "sweater-none", "palette-classic"), 0)).toBe("ok");
    expect(r.flushLooks().map((x) => x.id)).toEqual([a]);
    expect(r.flushLooks()).toEqual([]);
    expect(r.flushLooks(true).map((x) => x.id)).toEqual([a]); // b still wears the default
    expect(b).toBeGreaterThan(0);
  });

  it("rejects unknown ids, wrong slots and wrong lengths", () => {
    const r = new RoomState();
    const a = r.join(0)!;
    for (const bad of [look("hat-crown", "scarf-none", "sweater-none", "palette-classic"), look("scarf-none", "hat-santa", "sweater-none", "palette-classic"), look("hat-santa")])
      expect(r.accept(a, bad, 0)).toBe("dropped");
    expect(r.flushLooks()).toEqual([]);
  });
});
