/**
 * Room presence logic (pure; the Durable Object in `room-do.ts` only wires sockets to it).
 *
 * The room is authoritative for what other visitors see: it sanitises every pose, refuses teleports
 * (see "Movement allowance" below), rate-limits each connection with a token bucket and batches changed poses
 * into one broadcast per tick.
 *
 * Movement allowance: each member has a distance budget that refills with elapsed time at `WALK_RATE`
 * (25 % above the avatar's top speed), is capped at `MOVE_ALLOWANCE_CAP` (one second of that walking) and is
 * spent by the distance each pose actually moves; a pose that asks for more is cut short along its direction.
 * Over any window of T seconds a member moves at most `MOVE_ALLOWANCE_CAP + WALK_RATE * T`, however many poses
 * it sends: sending more often buys no extra distance. The cap is the jitter tolerance: poses that arrive
 * bunched after a network stall spend what the stall refilled, and a delay of up to about a second is absorbed
 * without a clamp. The first pose places the visitor anywhere (and fills the budget, which gives nothing a free
 * placement did not already give). O(1) per message, in memory only.
 *
 * Idle bookkeeping (IMPL-0014): every member carries the time of its last real activity (a pose that moves
 * or turns the avatar, a look, or the client's ["a"] report of a click, tap or key). The keep-alive "ping"
 * never reaches this module, and junk or rate-limited messages do not count. `reapIdle` removes whoever
 * stayed idle for longer than the limit so the room can empty, stop its timer and hibernate.
 *
 * Removal requests (PROPOSTA, IMPL-0021): `accept` only applies the per-connection limits to a well-formed
 * ["m", target, ticket] and says whether `target` is another member of this room. It keeps the times of the
 * last few requests of each connection (for the limits) and nothing else: no ticket, no target, no answer.
 * Asking the API and closing the target is the Durable Object's part (`room-do.ts`, `moderation.ts`).
 */
import { MOTION } from "@vila/shared/game/motion";
import { DEFAULT_LOOK, type Look } from "@vila/shared/game/cosmetics";
import {
  decodeClient,
  type Pose,
  type PoseEntry,
  REMOVE_MAX_PER_MINUTE,
  REMOVE_MIN_INTERVAL_MS,
  ROOM_CAPACITY,
} from "@vila/shared/net/protocol";
import { SPAWN } from "@vila/shared/game/world";

/** Messages per second allowed per connection, and the burst. */
const RATE = 20;
const BURST = 40;
/** Dropped messages tolerated before the connection is closed as abusive. */
const ABUSE_LIMIT = 200;
/** Refill rate of the movement allowance (units per second): the avatar's top speed plus 25 %. */
export const WALK_RATE = MOTION.maxSpeed * 1.25;
/** Most distance a member may have in hand (units): one second at `WALK_RATE`, the tolerated jitter. */
export const MOVE_ALLOWANCE_CAP = WALK_RATE * 1;
/** Window of the "requests per minute" limit on ["m", …]. */
const REMOVE_WINDOW_MS = 60_000;

interface Member {
  pose: Pose;
  acceptedAt: number;
  dirty: boolean;
  tokens: number;
  refilledAt: number;
  dropped: number;
  /** False until the first pose: a (re)connecting visitor may start anywhere, once. */
  placed: boolean;
  /** Distance (units) this member may still move; refilled from `acceptedAt` (see the module comment). */
  allowance: number;
  look: Look;
  lookDirty: boolean;
  /** Time of the last real activity (see the module comment). */
  activeAt: number;
  /** Times of this connection's ["m", …] requests in the last minute (at most `REMOVE_MAX_PER_MINUTE`). */
  removals: number[];
}

/**
 * A well-formed ["m", target, ticket] that passed the per-connection limits. `valid` says that `target` is
 * another member of this room; when it is false the caller answers 0 without asking anybody.
 */
export interface RemovalRequest {
  target: number;
  ticket: string;
  valid: boolean;
}

export type AcceptResult = "ok" | "dropped" | "abuse" | RemovalRequest;

export class RoomState {
  private members = new Map<number, Member>();
  private nextId = 1;

  get size() {
    return this.members.size;
  }

  get full() {
    return this.members.size >= ROOM_CAPACITY;
  }

  ids() {
    return [...this.members.keys()];
  }

  /**
   * Adds a member at the spawn point; returns its anonymous id, or null when full. `activeAt` restores the
   * last activity of a connection that survived hibernation (a newcomer is active "now").
   */
  join(now: number, id = this.nextId++, activeAt = now): number | null {
    if (this.full) return null;
    this.nextId = Math.max(this.nextId, id + 1);
    this.members.set(id, {
      pose: { x: SPAWN.x, z: SPAWN.z, yaw: Math.PI, speed: 0 },
      acceptedAt: now,
      dirty: true,
      tokens: BURST,
      refilledAt: now,
      dropped: 0,
      placed: false,
      allowance: MOVE_ALLOWANCE_CAP,
      look: DEFAULT_LOOK,
      lookDirty: false,
      activeAt: Math.min(activeAt, now),
      removals: [],
    });
    return id;
  }

  leave(id: number) {
    return this.members.delete(id);
  }

  has(id: number) {
    return this.members.has(id);
  }

  /** Time of the member's last real activity (undefined once it left). */
  activeAt(id: number): number | undefined {
    return this.members.get(id)?.activeAt;
  }

  /**
   * Removes every member idle for longer than `limitMs` and returns their ids (the caller closes those
   * connections and tells the others). A removed id is gone for good: late messages from it are dropped.
   */
  reapIdle(now: number, limitMs: number): number[] {
    const out: number[] = [];
    for (const [id, m] of this.members) if (now - m.activeAt > limitMs) out.push(id);
    for (const id of out) this.members.delete(id);
    return out;
  }

  accept(id: number, raw: string, now: number): AcceptResult {
    const m = this.members.get(id);
    if (!m) return "dropped";
    m.tokens = Math.min(BURST, m.tokens + ((now - m.refilledAt) / 1000) * RATE);
    m.refilledAt = now;
    const msg = m.tokens >= 1 ? decodeClient(raw) : null;
    if (!msg) {
      m.dropped++;
      return m.dropped > ABUSE_LIMIT ? "abuse" : "dropped";
    }
    m.tokens -= 1;
    if (msg.t === "m") {
      // Not activity, and never broadcast. A request too soon after the last one, or one more than the
      // minute allows, is abuse at once (the limits count every well-formed request, answered or not).
      m.removals = m.removals.filter((at) => now - at < REMOVE_WINDOW_MS);
      const last = m.removals[m.removals.length - 1];
      if ((last !== undefined && now - last < REMOVE_MIN_INTERVAL_MS) || m.removals.length >= REMOVE_MAX_PER_MINUTE) return "abuse";
      m.removals.push(now);
      return { target: msg.target, ticket: msg.ticket, valid: msg.target !== id && this.members.has(msg.target) };
    }
    if (msg.t === "a") {
      m.activeAt = now;
      return "ok";
    }
    if (msg.t === "k") {
      m.look = msg.look;
      m.lookDirty = true;
      m.activeAt = now;
      return "ok";
    }
    const pose = msg.pose;
    // Anti-teleport: refill the allowance for the time elapsed since the last pose, then spend the step on it.
    if (m.placed) {
      const dt = Math.max(0, now - m.acceptedAt) / 1000;
      const budget = Math.min(MOVE_ALLOWANCE_CAP, m.allowance + dt * WALK_RATE);
      const dx = pose.x - m.pose.x, dz = pose.z - m.pose.z;
      const d = Math.hypot(dx, dz);
      if (d > budget) {
        pose.x = m.pose.x + (dx / d) * budget;
        pose.z = m.pose.z + (dz / d) * budget;
      }
      m.allowance = d > budget ? 0 : budget - d;
    } else {
      m.allowance = MOVE_ALLOWANCE_CAP;
    }
    // Only a pose that moves or turns the avatar is activity: repeating the same pose keeps nobody "present".
    if (!m.placed || pose.x !== m.pose.x || pose.z !== m.pose.z || pose.yaw !== m.pose.yaw) m.activeAt = now;
    m.pose = pose;
    m.placed = true;
    m.acceptedAt = now;
    m.dirty = true;
    return "ok";
  }

  /** Looks changed since the last call (`all` = every non-default look, for a newcomer). */
  flushLooks(all = false): Array<{ id: number; look: Look }> {
    const out: Array<{ id: number; look: Look }> = [];
    for (const [id, m] of this.members) {
      const custom = Object.keys(DEFAULT_LOOK).some((k) => m.look[k as keyof Look] !== DEFAULT_LOOK[k as keyof Look]);
      if (all ? custom : m.lookDirty) out.push({ id, look: m.look });
      if (!all) m.lookDirty = false;
    }
    return out;
  }

  /** Poses changed since the last flush (`all` = the whole roster, for a newcomer). */
  flush(now: number, all = false): PoseEntry[] {
    const out: PoseEntry[] = [];
    for (const [id, m] of this.members) {
      if (!all && !m.dirty) continue;
      out.push([id, m.pose.x, m.pose.z, m.pose.yaw, m.pose.speed, Math.max(0, now - m.acceptedAt)]);
      if (!all) m.dirty = false;
    }
    return out;
  }
}
