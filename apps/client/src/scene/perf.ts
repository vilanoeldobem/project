/**
 * Runtime render statistics (debug overlay, verify.mjs, adaptive resolution). Written by `RenderStats`
 * inside the canvas; read anywhere without React re-renders.
 */
export const perf = {
  /** Draw calls and triangles of the last complete frame (every pass: shadow, scene, post). */
  calls: 0,
  triangles: 0,
  /** Frame-time percentiles (ms) over the last `WINDOW` frames. */
  p50: 0,
  p95: 0,
  /** Current device pixel ratio chosen by the adaptive resolution controller. */
  dpr: 1,
};

const WINDOW = 120;
const samples = new Float32Array(WINDOW);
const sorted = new Float32Array(WINDOW);
let count = 0;
let head = 0;

/** Records one frame time (ms) and refreshes the percentiles every 30 frames. */
export function recordFrame(ms: number) {
  samples[head] = ms;
  head = (head + 1) % WINDOW;
  count = Math.min(count + 1, WINDOW);
  if (head % 30 !== 0) return;
  sorted.set(samples);
  const view = sorted.subarray(0, count).sort();
  perf.p50 = view[Math.floor(count * 0.5)] ?? 0;
  perf.p95 = view[Math.min(count - 1, Math.floor(count * 0.95))] ?? 0;
}

/** Drops the window (after a resolution change the old samples no longer describe the cost). */
export function resetFrames() {
  count = 0;
  head = 0;
}
