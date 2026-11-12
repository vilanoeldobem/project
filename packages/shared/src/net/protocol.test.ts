import { describe, expect, it } from "vitest";

import { MOTION } from "../game/motion";
import { WORLD_RADIUS } from "../game/world";
import {
  CLOSE_ABUSE,
  CLOSE_FULL,
  CLOSE_IDLE,
  CLOSE_REMOVED,
  decodeClient,
  decodePose,
  decodeRemove,
  decodeServer,
  encodePose,
  encodeRemove,
  encodeServer,
  isConnectionId,
  isModerationTicket,
  MAX_MESSAGE_BYTES,
  MODERATION_TICKET_LENGTH,
  REMOVE_MAX_PER_MINUTE,
  REMOVE_MIN_INTERVAL_MS,
} from "./protocol";

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

describe("activity report", () => {
  it("decodes the exact activity message and nothing that merely looks like it", async () => {
    const { ACTIVE_MESSAGE, decodeClient } = await import("./protocol");
    expect(decodeClient(ACTIVE_MESSAGE)).toEqual({ t: "a" });
    for (const bad of ['["a",1]', '["a"] ', "a", "ping", '["A"]']) expect(decodeClient(bad)).toBeNull();
  });
});

describe("removal request (PROPOSTA, IMPL-0021)", () => {
  const TICKET = "Ab3_-zZ09Ab3_-zZ09Ab3_-zZ09Ab3_-"; // 32 characters of [A-Za-z0-9_-]
  const request = (target: unknown, ticket: unknown = TICKET) => JSON.stringify(["m", target, ticket]);

  it("round-trips a request and is the only client message that carries a ticket", () => {
    expect(TICKET).toHaveLength(MODERATION_TICKET_LENGTH);
    const raw = encodeRemove(7, TICKET);
    expect(raw).toBe(`["m",7,"${TICKET}"]`);
    expect(decodeRemove(raw!)).toEqual({ target: 7, ticket: TICKET });
    expect(decodeClient(raw!)).toEqual({ t: "m", target: 7, ticket: TICKET });
    expect(decodePose(raw!)).toBeNull();
  });

  it("keeps the longest valid request inside the message size limit", () => {
    const longest = encodeRemove(Number.MAX_SAFE_INTEGER, TICKET)!;
    expect(longest).toHaveLength(57);
    expect(longest).toMatch(/^[\x20-\x7e]+$/); // ASCII only: characters and bytes are the same count
    expect(longest.length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
    expect(decodeClient(longest)).toEqual({ t: "m", target: Number.MAX_SAFE_INTEGER, ticket: TICKET });
    // The limit still holds: a request padded past it is junk even though every part is well formed.
    expect(decodeClient(`${longest.slice(0, -1)}${" ".repeat(MAX_MESSAGE_BYTES)}]`)).toBeNull();
  });

  it("rejects a ticket of the wrong length or alphabet", () => {
    const wrong = [
      "",
      TICKET.slice(1), // 31
      `${TICKET}A`, // 33
      TICKET.repeat(2), // 64
      `${TICKET.slice(1)}+`,
      `${TICKET.slice(1)}/`,
      `${TICKET.slice(1)}=`,
      `${TICKET.slice(1)}.`,
      `${TICKET.slice(1)} `,
      `${TICKET.slice(1)}é`,
      `${TICKET.slice(1)}\n`,
      `${TICKET.slice(2)}\\"`,
    ];
    for (const ticket of wrong) {
      expect(isModerationTicket(ticket), JSON.stringify(ticket)).toBe(false);
      expect(encodeRemove(7, ticket), JSON.stringify(ticket)).toBeNull();
      expect(decodeClient(request(7, ticket)), JSON.stringify(ticket)).toBeNull();
    }
    for (const ticket of [null, 7, true, [TICKET], { ticket: TICKET }]) {
      expect(isModerationTicket(ticket)).toBe(false);
      expect(decodeClient(request(7, ticket))).toBeNull();
    }
    // An escape that spells a valid character is still not the exact form.
    expect(decodeClient(`["m",7,"\\u0041${TICKET.slice(1)}"]`)).toBeNull();
    expect(isModerationTicket(TICKET)).toBe(true);
  });

  it("rejects a target that is not a positive safe integer written in plain digits", () => {
    for (const target of [0, -1, -0, 1.5, 0.1, Number.MAX_SAFE_INTEGER + 1, 1e21, NaN, Infinity]) {
      expect(isConnectionId(target), String(target)).toBe(false);
      expect(encodeRemove(target, TICKET), String(target)).toBeNull();
    }
    for (const target of ["7", null, true, [7], { id: 7 }]) {
      expect(isConnectionId(target)).toBe(false);
      expect(decodeClient(request(target))).toBeNull();
    }
    for (const spelled of ["0", "-1", "1.5", "7.0", "1e3", "07", "+7", "0x7", "9007199254740992", "9007199254740993", "99999999999999999", "", " 7", "7 "])
      expect(decodeClient(`["m",${spelled},"${TICKET}"]`), spelled).toBeNull();
    for (const target of [1, 40, 123_456, Number.MAX_SAFE_INTEGER]) {
      expect(isConnectionId(target)).toBe(true);
      expect(decodeClient(encodeRemove(target, TICKET)!)).toEqual({ t: "m", target, ticket: TICKET });
    }
  });

  it("rejects extra or missing elements and anything that is not the exact form", () => {
    const good = encodeRemove(7, TICKET)!;
    const junk = [
      `["m",7,"${TICKET}",1]`,
      `["m",7,"${TICKET}","${TICKET}"]`,
      `["m",7,"${TICKET}",null]`,
      `["m",7]`,
      `["m","${TICKET}"]`,
      `["m"]`,
      `["m","${TICKET}",7]`,
      `["m",[7],"${TICKET}"]`,
      `["m", 7, "${TICKET}"]`,
      `["m",7,"${TICKET}"] `,
      ` ${good}`,
      `${good}\n`,
      `[${good}]`,
      `${good}${good}`,
      `["M",7,"${TICKET}"]`,
      `["mm",7,"${TICKET}"]`,
      `{"m":7,"ticket":"${TICKET}"}`,
      good.slice(0, -1),
    ];
    for (const raw of junk) {
      expect(decodeClient(raw), raw).toBeNull();
      expect(decodeRemove(raw), raw).toBeNull();
    }
    expect(decodeClient(good)).not.toBeNull();
  });

  it("round-trips the room's answer and rejects any other shape", () => {
    expect(encodeServer({ t: "m", target: 7, ok: true })).toBe('["m",7,1]');
    expect(encodeServer({ t: "m", target: 7, ok: false })).toBe('["m",7,0]');
    expect(decodeServer('["m",7,1]')).toEqual({ t: "m", target: 7, ok: true });
    expect(decodeServer('["m",7,0]')).toEqual({ t: "m", target: 7, ok: false });
    for (const bad of ['["m",7,2]', '["m",7,true]', '["m",7,"1"]', '["m",7]', '["m",7,1,1]', '["m",0,1]', '["m",1.5,1]', '["m","7",1]', '["m",-7,0]', `["m",7,"${TICKET}"]`])
      expect(decodeServer(bad), bad).toBeNull();
  });

  it("uses its own close code and states the limits the room enforces", () => {
    expect(CLOSE_REMOVED).toBe(4003);
    expect(new Set([CLOSE_FULL, CLOSE_IDLE, CLOSE_REMOVED, CLOSE_ABUSE]).size).toBe(4);
    expect(REMOVE_MIN_INTERVAL_MS).toBe(1000);
    expect(REMOVE_MAX_PER_MINUTE).toBe(10);
  });
});
