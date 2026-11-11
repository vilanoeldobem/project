import { useFrame, useThree } from "@react-three/fiber";
import { useEffect, useRef } from "react";

import { perf, recordFrame, resetFrames } from "./perf";

/** Lowest pixel ratio the controller may choose; below this the voxel edges get mushy. */
const MIN_DPR = 0.75;
const STEP = 0.25;
/** p95 above this (≈ under 45 fps) → lower the resolution. */
const SLOW_MS = 22;
/** p95 under this (vsync-bound at 60 Hz) for a while → try a higher resolution again. */
const FAST_MS = 18;

interface Controller {
  dpr: number;
  /** Seconds since the last change, and since mount. */
  since: number;
  clock: number;
  raiseWait: number;
  raisedAt: number;
  /** p95 just before the last step down (0 = nothing to judge). */
  p95Before: number;
  cpuBound: boolean;
  lastChange: "none" | "up" | "down";
}

/**
 * Collects per-frame render cost and keeps frame pacing stable by trading resolution for time
 * (frame-time p95, not average FPS: spikes are what people feel). Runs first in the frame and reads the
 * totals of the previous frame, because every pass (shadow, scene, bloom) adds to `gl.info`.
 */
export function RenderStats({ maxDpr }: { maxDpr: number }) {
  const gl = useThree((s) => s.gl);
  const setDpr = useThree((s) => s.setDpr);
  const ctl = useRef<Controller>({
    dpr: Math.min(window.devicePixelRatio || 1, maxDpr),
    since: 0,
    clock: 0,
    raiseWait: 5,
    raisedAt: -Infinity,
    p95Before: 0,
    cpuBound: false,
    lastChange: "none",
  });
  const apply = (c: Controller, next: number, change: Controller["lastChange"]) => {
    if (next === c.dpr) return;
    c.dpr = next;
    c.since = 0;
    c.lastChange = change;
    perf.dpr = next;
    setDpr(next);
    resetFrames();
  };

  useEffect(() => {
    gl.info.autoReset = false;
    const c = ctl.current;
    c.dpr = Math.min(window.devicePixelRatio || 1, maxDpr);
    c.since = 0;
    c.cpuBound = false;
    c.lastChange = "none";
    perf.dpr = c.dpr;
    resetFrames();
    return () => void (gl.info.autoReset = true);
  }, [gl, maxDpr]);

  useFrame((_, dt) => {
    perf.calls = gl.info.render.calls;
    perf.triangles = gl.info.render.triangles;
    gl.info.reset();
    recordFrame(dt * 1000);

    const c = ctl.current;
    c.since += dt;
    c.clock += dt;
    if (c.since < 2) return;
    const native = Math.min(window.devicePixelRatio || 1, maxDpr);
    // A step down that bought < 10% frame time means the device is CPU-bound: resolution is not the cost.
    // Undo it and stop trading pixels until the preset changes.
    if (c.lastChange === "down" && c.p95Before > 0 && perf.p95 > c.p95Before * 0.9) {
      c.cpuBound = true;
      c.p95Before = 0;
      apply(c, Math.min(native, c.dpr + STEP), "none");
      return;
    }
    c.p95Before = 0;
    if (perf.p95 > SLOW_MS && c.dpr > MIN_DPR && !c.cpuBound) {
      // Only a raise that fails quickly doubles the wait before the next attempt (no oscillation);
      // a raise that held for a while resets it.
      if (c.lastChange === "up" && c.clock - c.raisedAt < 10) c.raiseWait = Math.min(c.raiseWait * 2, 120);
      else c.raiseWait = 5;
      c.p95Before = perf.p95;
      apply(c, Math.max(MIN_DPR, c.dpr - STEP), "down");
    } else if (perf.p95 < FAST_MS && c.dpr < native && c.since > c.raiseWait) {
      c.raisedAt = c.clock;
      apply(c, Math.min(native, c.dpr + STEP), "up");
    }
  }, -2);

  return null;
}
