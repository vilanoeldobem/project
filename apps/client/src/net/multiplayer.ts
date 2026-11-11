/**
 * Client presence (IMPL-0008): one WebSocket to a plaza room, own pose out at ≤ 10 Hz when it changed,
 * other visitors in with snapshot interpolation (rendered ~150 ms in the past between two known poses,
 * so motion stays smooth despite jitter). Purely presentational: nothing here affects missions, XP,
 * time or weather. Remote poses live in a mutable map read by the renderer; only the visitor count and
 * the connection status go through zustand.
 */
import { create } from "zustand";

import { DEFAULT_LOOK, type Look, SLOTS } from "@vila/shared/game/cosmetics";

import { sim } from "../game/sim";
import { useVila } from "../game/store";
import { SERVICES } from "../lib/services";
import {
  CLOSE_FULL,
  decodeServer,
  encodeLook,
  encodePose,
  MAX_ROOMS,
  type PoseEntry,
  SEND_MS,
} from "@vila/shared/net/protocol";

/** Interpolation delay: ~1.5 server ticks. */
const DELAY_MS = 150;
const HISTORY = 8;
const PING_MS = 20_000;

interface Sample {
  t: number;
  x: number;
  z: number;
  yaw: number;
  speed: number;
}

export interface Remote {
  id: number;
  samples: Sample[];
  /** Interpolated render pose (written by `sampleRemotes`). */
  x: number;
  z: number;
  yaw: number;
  speed: number;
  /** Walk-cycle phase, advanced by the distance walked on screen. */
  walk: number;
  /** Cosmetic look (IMPL-0010) and its key for grouping instanced draws. */
  look: Look;
  lookKey: string;
}

export const lookKey = (l: Look) => SLOTS.map((s) => l[s]).join("|");
const DEFAULT_KEY = lookKey(DEFAULT_LOOK);

export type NetStatus = "off" | "connecting" | "online" | "full" | "offline";

/** `looks`: distinct looks currently worn by others (one instanced group each). */
export const useNet = create<{ status: NetStatus; others: number; looks: Record<string, Look> }>(() => ({
  status: "off",
  others: 0,
  looks: { [DEFAULT_KEY]: DEFAULT_LOOK },
}));

/** Looks that arrived before the first pose of that visitor. */
const pendingLooks = new Map<number, Look>();

function refreshLooks() {
  const looks: Record<string, Look> = { [DEFAULT_KEY]: DEFAULT_LOOK };
  for (const r of remotes.values()) looks[r.lookKey] = r.look;
  const prev = useNet.getState().looks;
  if (Object.keys(prev).sort().join() !== Object.keys(looks).sort().join()) useNet.setState({ looks });
}

export function setRemoteLook(id: number, look: Look) {
  const r = remotes.get(id);
  if (!r) return void pendingLooks.set(id, look);
  r.look = look;
  r.lookKey = lookKey(look);
  refreshLooks();
}

export const remotes = new Map<number, Remote>();

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** Server-to-local clock offset: lowest observed (receive − tick), relaxing slowly upwards for drift. */
let offset: number | null = null;

export function ingestSnapshot(poses: PoseEntry[], tick: number, selfId: number | null, now = Date.now()) {
  const o = now - tick;
  offset = offset === null || o < offset ? o : offset + (o - offset) * 0.02;
  for (const [id, x, z, yaw, speed, age] of poses) {
    if (id === selfId) continue;
    let r = remotes.get(id);
    if (!r) {
      const look = pendingLooks.get(id) ?? DEFAULT_LOOK;
      pendingLooks.delete(id);
      r = { id, samples: [], x, z, yaw, speed, walk: 0, look, lookKey: lookKey(look) };
      remotes.set(id, r);
      refreshLooks();
    }
    r.samples.push({ t: tick - age, x, z, yaw, speed });
    if (r.samples.length > HISTORY) r.samples.shift();
  }
  useNet.setState({ others: remotes.size });
}

/** Moves every remote to its interpolated pose for this frame. */
/** Drops every remote and the clock estimate (disconnect, tests). */
export function resetRemotes() {
  remotes.clear();
  pendingLooks.clear();
  useNet.setState({ looks: { [DEFAULT_KEY]: DEFAULT_LOOK } });
  offset = null;
  useNet.setState({ others: 0 });
}

export function sampleRemotes(now = Date.now()) {
  if (offset === null) return;
  const t = now - offset - DELAY_MS;
  for (const r of remotes.values()) {
    const s = r.samples;
    if (s.length === 0) continue;
    let a = s[0], b = s[s.length - 1];
    if (t >= b.t) a = b; // no fresher data: hold the last pose (no extrapolation)
    else if (t <= a.t) b = a;
    else
      for (let i = 1; i < s.length; i++)
        if (s[i].t >= t) {
          a = s[i - 1];
          b = s[i];
          break;
        }
    const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
    r.x = a.x + (b.x - a.x) * k;
    r.z = a.z + (b.z - a.z) * k;
    r.yaw = a.yaw + wrap(b.yaw - a.yaw) * k;
    r.speed = a.speed + (b.speed - a.speed) * k;
  }
}

/**
 * Connects while `enabled`; returns the disconnect function. Full room → next room; dropped connection →
 * retry with exponential backoff (1 s … 30 s).
 */
export function connectPresence(): () => void {
  let ws: WebSocket | null = null;
  let room = 0;
  let tries = 0;
  let selfId: number | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let sendTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let last = "";
  // Re-send the look whenever the person changes it (the room relays it to everyone else).
  const offLook = useVila.subscribe((s, prev) => {
    if (s.look !== prev.look && ws?.readyState === WebSocket.OPEN) ws.send(encodeLook(s.look));
  });

  const clear = () => {
    if (sendTimer) clearInterval(sendTimer);
    if (pingTimer) clearInterval(pingTimer);
    sendTimer = pingTimer = null;
    resetRemotes();
  };

  const open = () => {
    if (closed) return;
    useNet.setState({ status: "connecting" });
    ws = new WebSocket(`${SERVICES.realtime}/room?i=${room}`);
    ws.onmessage = (ev) => {
      if (typeof ev.data !== "string" || ev.data === "pong") return;
      const m = decodeServer(ev.data);
      if (!m) return;
      if (m.t === "w") {
        selfId = m.id;
        tries = 0;
        useNet.setState({ status: "online" });
      } else if (m.t === "s") ingestSnapshot(m.poses, m.tick, selfId);
      else if (m.t === "k") {
        if (m.id !== selfId) setRemoteLook(m.id, m.look);
      } else if (m.t === "l") {
        remotes.delete(m.id);
        pendingLooks.delete(m.id);
        useNet.setState({ others: remotes.size });
        refreshLooks();
      }
    };
    ws.onopen = () => {
      last = "";
      ws?.send(encodeLook(useVila.getState().look));
      sendTimer = setInterval(() => {
        const p = sim.pose;
        const msg = encodePose({ x: p.x, z: p.z, yaw: p.yaw, speed: p.speed < 0.05 ? 0 : p.speed });
        if (msg !== last && ws?.readyState === WebSocket.OPEN) {
          ws.send(msg);
          last = msg;
        }
      }, SEND_MS);
      pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
    };
    ws.onclose = (ev) => {
      clear();
      selfId = null;
      if (closed) return;
      if (ev.code === CLOSE_FULL) {
        room = (room + 1) % MAX_ROOMS;
        if (++tries >= MAX_ROOMS) {
          useNet.setState({ status: "full" });
          tries = 0;
          retry = setTimeout(open, 30_000);
          return;
        }
        open();
        return;
      }
      useNet.setState({ status: "offline" });
      retry = setTimeout(open, Math.min(30_000, 1000 * 2 ** Math.min(tries++, 5)));
    };
  };

  open();
  return () => {
    closed = true;
    offLook();
    if (retry) clearTimeout(retry);
    clear();
    ws?.close(1000, "bye");
    useNet.setState({ status: "off" });
  };
}
