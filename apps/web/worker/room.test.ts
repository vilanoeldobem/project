import { describe, expect, it } from "vitest";

import { MOTION } from "../src/game/motion";
import { WORLD_RADIUS } from "../src/game/world";
import { decodePose, decodeServer, encodePose, encodeServer, ROOM_CAPACITY } from "../src/net/protocol";
import { handleApi, type Env } from "./api";
import { RoomState } from "./room";

const pose = (x: number, z: number, yaw = 0, speed = 0) => encodePose({ x, z, yaw, speed });

describe("presence protocol", () => {
  it("round-trips poses and rejects junk", () => {
    expect(decodePose(pose(1.234, -5.678, 1, 3))).toEqual({ x: 1.23, z: -5.68, yaw: 1, speed: 3 });
    for (const bad of ["", "{}", '["p",1,2,3]', '["p","1",2,3,4]', '["x",1,2,3,4]', '["p",1e400,0,0,0]', "x".repeat(200)])
      expect(decodePose(bad)).toBeNull();
  });

  it("clamps poses into the world and the speed limit", () => {
    const p = decodePose(pose(500, 0, 7, 99))!;
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(WORLD_RADIUS);
    expect(p.speed).toBe(MOTION.maxSpeed);
    expect(Math.abs(p.yaw)).toBeLessThanOrEqual(Math.PI);
  });

  it("round-trips server messages", () => {
    expect(decodeServer(encodeServer({ t: "w", id: 3, room: 1 }))).toEqual({ t: "w", id: 3, room: 1 });
    expect(decodeServer(encodeServer({ t: "l", id: 3 }))).toEqual({ t: "l", id: 3 });
    const s = decodeServer(encodeServer({ t: "s", tick: 1000, poses: [[1, 2.345, 3, 0.5, 4, 20.4]] }));
    expect(s).toEqual({ t: "s", tick: 1000, poses: [[1, 2.35, 3, 0.5, 4, 20]] });
    expect(decodeServer("nope")).toBeNull();
  });
});

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

describe("/api/room", () => {
  const env = { ASSETS: {} as Fetcher } as Env;
  const req = (headers: Record<string, string>, q = "") =>
    handleApi(new Request(`https://app.example/api/room${q}`, { headers }), env);

  it("requires a WebSocket upgrade from the same origin", async () => {
    expect((await req({})).status).toBe(426);
    expect((await req({ Upgrade: "websocket", Origin: "https://evil.example" })).status).toBe(403);
    expect((await req({ Upgrade: "websocket" })).status).toBe(403);
  });

  it("bounds the room index and degrades without the binding", async () => {
    const h = { Upgrade: "websocket", Origin: "https://app.example" };
    expect((await req(h, "?i=99")).status).toBe(400);
    expect((await req(h, "?i=0")).status).toBe(503);
  });
});
