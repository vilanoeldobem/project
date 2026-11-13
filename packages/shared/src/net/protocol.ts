/**
 * Presence protocol (IMPL-0008), shared by the client and the `VillageRoom` Durable Object.
 *
 * What travels: an anonymous numeric id per connection (no name, no account, no device data) and the
 * avatar pose. No chat, no free text (minors: ECA Digital, LGPD). Messages are compact JSON arrays.
 *
 *   client → server  ["p", x, z, yaw, speed]                 pose, ≤ 10 Hz, only when it changed
 *                    ["k", hat, scarf, sweater, palette]     avatar look (catalogue ids only, IMPL-0010)
 *                    ["a"]                                   the person clicked, tapped or typed; ≤ 1 per ACTIVE_MS
 *                    ["m", target, ticket]                   PROPOSTA (IMPL-0021): an administrator asks the room to remove
 *                                                            the connection `target`; see "Removal" below
 *                    "ping"                                  keep-alive (answered "pong" without waking the room)
 *   server → client  ["w", selfId, room]                     welcome
 *                    ["s", tickMs, [[id, x, z, yaw, speed, ageMs], …]]  poses that changed since the last tick
 *                    ["k", id, [hat, scarf, sweater, palette]] someone's look (on change; all of them on join)
 *                    ["l", id]                                someone left
 *                    ["m", target, 0 | 1]                     answer to the sender of ["m", …]: 1 = the room closed
 *                                                             `target` with 4003, 0 = nobody was closed
 *   close 4001 = room full (try the next room) · 4002 = idle (IMPL-0014: reconnect on the next real input) ·
 *         4003 = removed by an administrator (PROPOSTA, IMPL-0021) · 1008 = protocol abuse
 *
 * Activity (IMPL-0014): a pose that moves or turns the avatar, a look and ["a"] count; "ping" and ["m", …]
 * never do.
 *
 * Removal (PROPOSTA, IMPL-0021; server flag `PRESENCE_MODERATION_ENABLED`, off in production). Presence stays
 * anonymous: the room never learns who anybody is, the administrator included. The administrator's client gets
 * a single-use ticket from the API (bound to that administrator, the room and `target`; it lives 30 seconds)
 * and sends ["m", target, ticket] on its open connection. `target` is a connection id (positive safe integer)
 * and `ticket` is exactly 32 characters of [A-Za-z0-9_-]; only the exact output of `encodeRemove` is accepted,
 * anything else that starts with ["m" is junk like any other malformed message. The room asks the API to
 * consume the ticket and, only when the API confirms, closes `target` with 4003; the others get the usual
 * ["l", target]. Every well-formed ["m", …] gets exactly one ["m", target, 0 | 1] back, unless the sender is
 * closed first. The answer is 0, and nobody is closed, when the flag is off (a client may be newer than the
 * server), `target` is the sender or is not in the room, the room started less than 35 seconds ago, another
 * request of the same connection is still being checked, or the API refuses, fails or does not answer in 3
 * seconds. Limits per connection: one ["m", …] per `REMOVE_MIN_INTERVAL_MS` and `REMOVE_MAX_PER_MINUTE` per
 * minute, answered or not; beyond that the room closes the sender with 1008. A removal is not a ban: the
 * removed visitor's client shows an honest message and waits before reconnecting, nothing more.
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
/** The room closed a connection at an administrator's request (PROPOSTA, IMPL-0021). */
export const CLOSE_REMOVED = 4003;
export const CLOSE_ABUSE = 1008;
/** Minimum spacing of the client's ["a"] activity reports; the room's idle limit must stay well above it. */
export const ACTIVE_MS = 20_000;
/** "The person is here": sent after a real click, tap or key when no pose or look went out recently. */
export const ACTIVE_MESSAGE = '["a"]';
/** Length of a moderation ticket: 32 characters of [A-Za-z0-9_-] (192 random bits when issued by the API). */
export const MODERATION_TICKET_LENGTH = 32;
/** Minimum spacing of one connection's ["m", …] requests; a second one sooner closes it with `CLOSE_ABUSE`. */
export const REMOVE_MIN_INTERVAL_MS = 1000;
/** ["m", …] requests one connection may send in any 60 seconds; one more closes it with `CLOSE_ABUSE`. */
export const REMOVE_MAX_PER_MINUTE = 10;

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
  | { t: "l"; id: number }
  /** Answer to ["m", target, ticket]: `ok` only when the room closed `target` with `CLOSE_REMOVED`. */
  | { t: "m"; target: number; ok: boolean };

export type ClientMessage = { t: "p"; pose: Pose } | { t: "k"; look: Look } | { t: "a" } | { t: "m"; target: number; ticket: string };

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

const TICKET = new RegExp(`^[A-Za-z0-9_-]{${MODERATION_TICKET_LENGTH}}$`);
/** The only accepted spelling of a removal request: what `encodeRemove` writes (no spaces, plain digits). */
const REMOVE = new RegExp(`^\\["m",([1-9][0-9]{0,15}),"([A-Za-z0-9_-]{${MODERATION_TICKET_LENGTH}})"\\]$`);

/** A connection id as the room assigns it: a positive safe integer. */
export const isConnectionId = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 1;

/** A moderation ticket by its shape only (length and alphabet); whether it is valid is the API's answer. */
export const isModerationTicket = (v: unknown): v is string => typeof v === "string" && TICKET.test(v);

/**
 * Removal request ["m", target, ticket] (PROPOSTA, IMPL-0021), or null when either part has the wrong shape:
 * the room counts a malformed request as protocol abuse, so a caller must not send one.
 */
export function encodeRemove(target: number, ticket: string): string | null {
  return isConnectionId(target) && isModerationTicket(ticket) ? `["m",${target},"${ticket}"]` : null;
}

/** Parses a removal request; accepts exactly what `encodeRemove` writes (57 characters at most). */
export function decodeRemove(raw: string): { target: number; ticket: string } | null {
  const m = REMOVE.exec(raw);
  if (!m) return null;
  const target = Number(m[1]);
  return isConnectionId(target) ? { target, ticket: m[2] } : null;
}

/** Client message → pose, look, activity report or removal request (null = junk). */
export function decodeClient(raw: string): ClientMessage | null {
  if (raw.length > MAX_MESSAGE_BYTES) return null;
  if (raw === ACTIVE_MESSAGE) return { t: "a" };
  if (raw.startsWith('["m"')) {
    const remove = decodeRemove(raw);
    return remove ? { t: "m", ...remove } : null;
  }
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
  if (m.t === "m") return JSON.stringify(["m", m.target, m.ok ? 1 : 0]);
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
  if (m[0] === "m") return m.length === 3 && isConnectionId(m[1]) && (m[2] === 0 || m[2] === 1) ? { t: "m", target: m[1], ok: m[2] === 1 } : null;
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
