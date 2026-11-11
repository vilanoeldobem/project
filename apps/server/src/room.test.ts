import { describe, expect, it } from "vitest";

import { MOTION } from "@vila/shared/game/motion";
import { encodePose, ROOM_CAPACITY } from "@vila/shared/net/protocol";
import type { Env } from "./env";
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
