/**
 * Room presence logic (pure; the Durable Object in `room-do.ts` only wires sockets to it).
 *
 * The room is authoritative for what other visitors see: it sanitises every pose, refuses teleports
 * (a pose may only move as far as the avatar's top speed allows since the last accepted one), rate-limits
 * each connection with a token bucket and batches changed poses into one broadcast per tick.
 */
import { MOTION } from "@vila/shared/game/motion";
import { DEFAULT_LOOK, type Look } from "@vila/shared/game/cosmetics";
import { decodeClient, type Pose, type PoseEntry, ROOM_CAPACITY } from "@vila/shared/net/protocol";
import { SPAWN } from "@vila/shared/game/world";

/** Messages per second allowed per connection, and the burst. */
const RATE = 20;
const BURST = 40;
/** Dropped messages tolerated before the connection is closed as abusive. */
const ABUSE_LIMIT = 200;
/** Slack for network jitter on the speed check (units). */
const SLACK = 0.75;

interface Member {
  pose: Pose;
  acceptedAt: number;
  dirty: boolean;
  tokens: number;
  refilledAt: number;
  dropped: number;
  /** False until the first pose: a (re)connecting visitor may start anywhere, once. */
  placed: boolean;
  look: Look;
  lookDirty: boolean;
}

export type AcceptResult = "ok" | "dropped" | "abuse";

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

  /** Adds a member at the spawn point; returns its anonymous id, or null when full. */
  join(now: number, id = this.nextId++): number | null {
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
      look: DEFAULT_LOOK,
      lookDirty: false,
    });
    return id;
  }

  leave(id: number) {
    return this.members.delete(id);
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
    if (msg.t === "k") {
      m.look = msg.look;
      m.lookDirty = true;
      return "ok";
    }
    const pose = msg.pose;
    // Anti-teleport: clamp the step to what the avatar could have walked since the last pose.
    const dt = Math.min((now - m.acceptedAt) / 1000, 2);
    const max = MOTION.maxSpeed * 1.25 * dt + SLACK;
    const dx = pose.x - m.pose.x, dz = pose.z - m.pose.z;
    const d = Math.hypot(dx, dz);
    if (m.placed && d > max) {
      pose.x = m.pose.x + (dx / d) * max;
      pose.z = m.pose.z + (dz / d) * max;
    }
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
