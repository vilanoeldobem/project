import { describe, expect, it } from "vitest";

import { MOTION } from "../game/motion";
import { WORLD_RADIUS } from "../game/world";
import { decodePose, decodeServer, encodePose, encodeServer } from "./protocol";

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


describe("look messages", () => {
  it("round-trips a valid look and rejects invalid ones", async () => {
    const { DEFAULT_LOOK } = await import("../game/cosmetics");
    const { decodeClient, encodeLook } = await import("./protocol");
    const look = { ...DEFAULT_LOOK, hat: "hat-holly", palette: "palette-night" };
    const raw = encodeLook(look);
    expect(raw.length).toBeLessThanOrEqual(96);
    expect(decodeClient(raw)).toEqual({ t: "k", look });
    expect(decodeServer(encodeServer({ t: "k", id: 4, look }))).toEqual({ t: "k", id: 4, look });
    expect(decodeClient('["k","hat-holly"]')).toBeNull();
    expect(decodeServer('["k",4,["x","y","z","w"]]')).toBeNull();
  });
});
