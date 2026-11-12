/**
 * Presence protocol (IMPL-0008), shared by the client and the `VillageRoom` Durable Object.
 *
 * What travels: an anonymous numeric id per connection (no name, no account, no device data) and the
 * avatar pose. No chat, no free text (minors: ECA Digital, LGPD). Messages are compact JSON arrays.
 *
 *   client → server  ["p", x, z, yaw, speed]                 pose, ≤ 10 Hz, only when it changed
 *                    ["k", hat, scarf, sweater, palette]     avatar look (catalogue ids only, IMPL-0010)
 *                    ["a"]                                   the person clicked, tapped or typed; ≤ 1 per ACTIVE_MS
 *                    "ping"                                  keep-alive (answered "pong" without waking the room)
 *   server → client  ["w", selfId, room]                     welcome
 *                    ["s", tickMs, [[id, x, z, yaw, speed, ageMs], …]]  poses that changed since the last tick
 *                    ["k", id, [hat, scarf, sweater, palette]] someone's look (on change; all of them on join)
 *                    ["l", id]                                someone left
 *   close 4001 = room full (try the next room) · 4002 = idle (IMPL-0014: reconnect on the next real input) ·
 *         1008 = protocol abuse
 *
 * Activity (IMPL-0014): a pose that moves or turns the avatar, a look and ["a"] count; "ping" never does.
 */
import { COSMETICS, type Look, SLOTS } from "../game/cosmetics";
import { MOTION } from "../game/motion";
import { WORLD_RADIUS } from "../game/world";

export const MAX_ROOMS = 8;
export const ROOM_CAPACITY = 40;
export const TICK_MS = 100;
export const SEND_MS = 100;
export const MAX_MESSAGE_BYTES = 96;
export const CLOSE_FULL = 4001;
/** The room closed a connection with no real activity for the idle limit (IMPL-0014). */
export const CLOSE_IDLE = 4002;
export const CLOSE_ABUSE = 1008;
/** Minimum spacing of the client's ["a"] activity reports; the room's idle limit must stay well above it. */
export const ACTIVE_MS = 20_000;
/** "The person is here": sent after a real click, tap or key when no pose or look went out recently. */
export const ACTIVE_MESSAGE = '["a"]';

export interface Pose {
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

/** [id, x, z, yaw, speed, ageMs]: pose and how long before the tick it was accepted. */
export type PoseEntry = [number, number, number, number, number, number];

export type ServerMessage =
  | { t: "w"; id: number; room: number }
  | { t: "s"; tick: number; poses: PoseEntry[] }
  | { t: "k"; id: number; look: Look }
  | { t: "l"; id: number };

const q = (n: number) => Math.round(n * 100) / 100;
const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export const encodePose = (p: Pose) => JSON.stringify(["p", q(p.x), q(p.z), q(wrap(p.yaw)), q(p.speed)]);

/** Parses and sanitises a client pose (finite, inside the world, speed within the avatar's limit). */
export function decodePose(raw: string): Pose | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(m) || m.length !== 5 || m[0] !== "p") return null;
  const [, x, z, yaw, speed] = m as unknown[];
  if (![x, z, yaw, speed].every((n) => typeof n === "number" && Number.isFinite(n))) return null;
  let px = x as number, pz = z as number;
  const r = Math.hypot(px, pz);
  if (r > WORLD_RADIUS) {
    px = (px / r) * WORLD_RADIUS;
    pz = (pz / r) * WORLD_RADIUS;
  }
  return { x: px, z: pz, yaw: wrap(yaw as number), speed: Math.min(Math.max(speed as number, 0), MOTION.maxSpeed) };
}

/** Look as the four slot ids, in `SLOTS` order. */
const lookArray = (l: Look) => SLOTS.map((s) => l[s]);

/**
 * Validates a look array: exactly one known catalogue id per slot. (Unlocks are checked on the client
 * and, with accounts, on the server; here only "is this a real item in the right slot".)
 */
export function parseLook(raw: unknown): Look | null {
  if (!Array.isArray(raw) || raw.length !== SLOTS.length) return null;
  const out = {} as Look;
  for (let i = 0; i < SLOTS.length; i++) {
    const c = COSMETICS.find((x) => x.id === raw[i]);
    if (!c || c.slot !== SLOTS[i]) return null;
    out[SLOTS[i]] = c.id;
  }
  return out;
}

export const encodeLook = (l: Look) => JSON.stringify(["k", ...lookArray(l)]);

/** Client message → pose, look or activity report (null = junk). */
export function decodeClient(raw: string): { t: "p"; pose: Pose } | { t: "k"; look: Look } | { t: "a" } | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  if (raw === ACTIVE_MESSAGE) return { t: "a" };
  if (raw.startsWith('["k"')) {
    try {
      const m = JSON.parse(raw) as unknown[];
      const look = parseLook(m.slice(1));
      return look ? { t: "k", look } : null;
    } catch {
      return null;
    }
  }
  const pose = decodePose(raw);
  return pose ? { t: "p", pose } : null;
}

export function encodeServer(m: ServerMessage): string {
  if (m.t === "k") return JSON.stringify(["k", m.id, lookArray(m.look)]);
  if (m.t === "w") return JSON.stringify(["w", m.id, m.room]);
  if (m.t === "l") return JSON.stringify(["l", m.id]);
  return JSON.stringify(["s", m.tick, m.poses.map((p) => [p[0], q(p[1]), q(p[2]), q(p[3]), q(p[4]), Math.round(p[5])])]);
}

export function decodeServer(raw: string): ServerMessage | null {
  let m: unknown;
  try {
    m = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(m)) return null;
  const num = (v: unknown) => typeof v === "number" && Number.isFinite(v);
  if (m[0] === "w" && num(m[1]) && num(m[2])) return { t: "w", id: m[1], room: m[2] };
  if (m[0] === "l" && num(m[1])) return { t: "l", id: m[1] };
  if (m[0] === "k" && num(m[1])) {
    const look = parseLook(m[2]);
    return look ? { t: "k", id: m[1], look } : null;
  }
  if (m[0] === "s" && num(m[1]) && Array.isArray(m[2])) {
    const poses = (m[2] as unknown[]).filter(
      (p): p is PoseEntry => Array.isArray(p) && p.length === 6 && p.every(num)
    );
    return { t: "s", tick: m[1], poses };
  }
  return null;
}
