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
  ACTIVE_MESSAGE,
  ACTIVE_MS,
  CLOSE_FULL,
  CLOSE_IDLE,
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
/** A tab hidden this long hangs up by itself (IMPL-0014); shorter than the room's idle limit on purpose. */
const HIDDEN_PAUSE_MS = 120_000;

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

/** "idle": paused for inactivity (IMPL-0014); the next click, tap or key reconnects. */
export type NetStatus = "off" | "connecting" | "online" | "full" | "offline" | "idle";

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

/** What to do after the room closed the connection (or it dropped). */
export interface ClosePlan {
  /** Status to show meanwhile. */
  status: NetStatus;
  /** Milliseconds until the next attempt (0 = at once); null = wait for the person's next click, tap or key. */
  delayMs: number | null;
  /** Room to try next and the attempt counter to carry over. */
  room: number;
  tries: number;
}

/**
 * Pure reconnect policy. Idle close (IMPL-0014) → no timer at all: reconnecting by itself would only start
 * another idle period, so the next real input reconnects. Full room → next room at once (after a full round,
 * wait 30 s). Anything else (network drop, deploy, abuse) → same room with exponential backoff, 1 s … 30 s.
 */
export function planAfterClose(code: number, room: number, tries: number): ClosePlan {
  if (code === CLOSE_IDLE) return { status: "idle", delayMs: null, room, tries: 0 };
  if (code === CLOSE_FULL) {
    const next = (room + 1) % MAX_ROOMS;
    return tries + 1 >= MAX_ROOMS
      ? { status: "full", delayMs: 30_000, room: next, tries: 0 }
      : { status: "connecting", delayMs: 0, room: next, tries: tries + 1 };
  }
  return { status: "offline", delayMs: Math.min(30_000, 1000 * 2 ** Math.min(tries, 5)), room, tries: tries + 1 };
}

/**
 * Connects while `enabled`; returns the disconnect function. Reconnects follow `planAfterClose`. While
 * connected, a click, tap or key with no pose or look sent in the last `ACTIVE_MS` is reported as ["a"], so
 * someone playing a minigame or reading a panel is not taken for idle. A tab hidden for `HIDDEN_PAUSE_MS`
 * hangs up by itself and waits for input like an idle close.
 */
export function connectPresence(): () => void {
  let ws: WebSocket | null = null;
  let room = 0;
  let tries = 0;
  let selfId: number | null = null;
  let closed = false;
  /** Waiting for the person's next click, tap or key (idle close, or the tab stayed hidden). */
  let paused = false;
  let retry: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let sendTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let last = "";
  /** When the room last heard activity from here (pose, look or ["a"]). */
  let toldAt = 0;
  const tell = (msg: string) => {
    ws?.send(msg);
    toldAt = Date.now();
  };
  // Re-send the look whenever the person changes it (the room relays it to everyone else).
  const offLook = useVila.subscribe((s, prev) => {
    if (s.look !== prev.look && ws?.readyState === WebSocket.OPEN) tell(encodeLook(s.look));
  });

  const clear = () => {
    if (sendTimer) clearInterval(sendTimer);
    if (pingTimer) clearInterval(pingTimer);
    sendTimer = pingTimer = null;
    resetRemotes();
  };

  const pause = () => {
    paused = true;
    if (retry) clearTimeout(retry);
    retry = null;
    useNet.setState({ status: "idle" });
  };

  // Real input: resumes a paused connection, or tells the room the person is here (at most every ACTIVE_MS).
  const onInput = () => {
    if (closed) return;
    if (paused) {
      paused = false;
      tries = 0;
      open();
    } else if (ws?.readyState === WebSocket.OPEN && Date.now() - toldAt >= ACTIVE_MS) tell(ACTIVE_MESSAGE);
  };

  // Hidden for a while: hang up and wait for input. The old socket is detached first, so its late close
  // event cannot touch a connection opened after it.
  const onHiddenLong = () => {
    hideTimer = null;
    if (closed || paused || !document.hidden) return;
    pause();
    const old = ws;
    ws = null;
    selfId = null;
    clear();
    if (old) {
      old.onopen = old.onmessage = old.onclose = null;
      old.close(1000, "hidden");
    }
  };
  const onVisibility = () => {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = document.hidden ? setTimeout(onHiddenLong, HIDDEN_PAUSE_MS) : null;
  };

  const open = () => {
    if (closed || paused) return;
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
      tell(encodeLook(useVila.getState().look));
      sendTimer = setInterval(() => {
        const p = sim.pose;
        const msg = encodePose({ x: p.x, z: p.z, yaw: p.yaw, speed: p.speed < 0.05 ? 0 : p.speed });
        if (msg !== last && ws?.readyState === WebSocket.OPEN) {
          tell(msg);
          last = msg;
        }
      }, SEND_MS);
      // Keep-alive only: the room answers it without waking up and never counts it as activity.
      pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send("ping"), PING_MS);
    };
    ws.onclose = (ev) => {
      clear();
      selfId = null;
      if (closed) return;
      const plan = planAfterClose(ev.code, room, tries);
      room = plan.room;
      tries = plan.tries;
      if (plan.delayMs === null) return pause();
      if (plan.delayMs === 0) return open();
      useNet.setState({ status: plan.status });
      retry = setTimeout(open, plan.delayMs);
    };
  };

  window.addEventListener("pointerdown", onInput, true);
  window.addEventListener("keydown", onInput, true);
  document.addEventListener("visibilitychange", onVisibility);
  open();
  onVisibility();
  return () => {
    closed = true;
    offLook();
    window.removeEventListener("pointerdown", onInput, true);
    window.removeEventListener("keydown", onInput, true);
    document.removeEventListener("visibilitychange", onVisibility);
    if (retry) clearTimeout(retry);
    if (hideTimer) clearTimeout(hideTimer);
    clear();
    ws?.close(1000, "bye");
    useNet.setState({ status: "off" });
  };
}
