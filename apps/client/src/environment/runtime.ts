/**
 * Client environment runtime: server snapshot + network clock + the current frame.
 *
 * The frame lives in a mutable module object (`env.frame`) refreshed once per render frame by
 * `EnvironmentDriver`; scene subsystems read it inside `useFrame`, so per-frame values never go
 * through React state. A small zustand store carries the slow-changing bits the HTML UI shows.
 */
import { create } from "zustand";

import { SERVICES } from "../lib/services";

import { localSnapshot, parseSnapshot, type EnvironmentSnapshot } from "@vila/shared/environment/config";
import { computeFrame, type EnvironmentFrame } from "@vila/shared/environment/frame";
import { NetworkClock } from "@vila/shared/environment/network-clock";
import { lookAt } from "@vila/shared/environment/keyframes";
import { PROFILES, WEATHER_KINDS, type WeatherKind } from "@vila/shared/environment/weather";

const RESYNC_MS = 3 * 60_000;

/** Developer overrides (spec §4.6 "debug"): only on localhost or a dev build, never in production. */
export interface DebugOverride {
  /** Fixed São Paulo-relative epoch the clock starts from (time keeps running at 1:1). */
  startEpochMs?: number;
  weather?: WeatherKind;
}

export const debugAllowed = () =>
  import.meta.env.DEV || (typeof location !== "undefined" && /^(localhost|127\.0\.0\.1)$/.test(location.hostname));

function readDebugOverride(): DebugOverride | null {
  if (typeof location === "undefined" || !debugAllowed()) return null;
  const q = new URLSearchParams(location.search);
  const out: DebugOverride = {};
  const t = q.get("envTime"); // e.g. 2026-12-24T23:00 (interpreted as São Paulo time, -03:00)
  if (t) {
    const ms = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(t) ? t : `${t}-03:00`);
    if (Number.isFinite(ms)) out.startEpochMs = ms;
  }
  const w = q.get("envWeather")?.toUpperCase() as WeatherKind | undefined;
  if (w && WEATHER_KINDS.includes(w)) out.weather = w;
  return out.startEpochMs !== undefined || out.weather ? out : null;
}

export interface EnvUiState {
  /** "synced" = server anchor; "local" = device clock fallback (shown honestly in the debug panel). */
  source: "local" | "synced";
  rttMs: number | null;
  lastSyncAt: number | null;
  snapshot: EnvironmentSnapshot;
  debug: DebugOverride | null;
}

export const useEnvUi = create<EnvUiState>(() => ({
  source: "local",
  rttMs: null,
  lastSyncAt: null,
  snapshot: localSnapshot(Date.now()),
  debug: readDebugOverride(),
}));

const clock = new NetworkClock();
const debugStartMono = typeof performance !== "undefined" ? performance.now() : 0;

export function worldNow(): number {
  const d = useEnvUi.getState().debug;
  if (d?.startEpochMs !== undefined) return d.startEpochMs + (performance.now() - debugStartMono);
  return clock.now();
}

export function frameAt(epochMs: number): EnvironmentFrame {
  const s = useEnvUi.getState();
  const f = computeFrame(epochMs, s.snapshot);
  const forced = s.debug?.weather;
  if (!forced) return f;
  const weather = { ...f.weather, ...PROFILES[forced], kind: forced, aurora: forced === "CLEAR_FROST" ? 1 : 0 };
  return { ...f, weather, look: lookAt(f.hour, weather) };
}

/** Shared mutable frame, refreshed once per rendered frame. */
export const env: { frame: EnvironmentFrame } = { frame: frameAt(Date.now()) };

export function tickEnvironment(): EnvironmentFrame {
  env.frame = frameAt(worldNow());
  return env.frame;
}

async function syncOnce(): Promise<void> {
  const sent = performance.now();
  try {
    const res = await fetch(`${SERVICES.api}/environment`, { cache: "no-store", headers: { Accept: "application/json" } });
    const received = performance.now();
    if (!res.ok) return;
    const snap = parseSnapshot(await res.json());
    if (!snap) return;
    // Ignore stale config (out-of-order responses).
    if (snap.configVersion < useEnvUi.getState().snapshot.configVersion) return;
    const sample = clock.update(snap.serverTimeMs, sent, received);
    if (!sample) return;
    useEnvUi.setState({ snapshot: snap, source: "synced", rttMs: clock.getStatus().rttMs, lastSyncAt: Date.now() });
  } catch {
    /* offline: keep the last anchor and the deterministic weather; retry later */
  }
}

let started = false;

/** Bootstrap + periodic resync + resync when the tab comes back (spec §4.5 step 7). */
export function startEnvironmentSync(): () => void {
  if (started) return () => undefined;
  started = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  const loop = async () => {
    // A burst of 3 samples at start feeds the min-RTT filter.
    const burst = useEnvUi.getState().source === "synced" ? 1 : 3;
    for (let i = 0; i < burst; i++) await syncOnce();
    const ok = useEnvUi.getState().source === "synced";
    attempt = ok ? 0 : attempt + 1;
    // Backoff with jitter while failing; regular cadence once synced.
    const delay = ok ? RESYNC_MS : Math.min(RESYNC_MS, 2000 * 2 ** attempt) * (0.75 + Math.random() * 0.5);
    timer = setTimeout(loop, delay);
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void syncOnce();
  };
  void loop();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    started = false;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
