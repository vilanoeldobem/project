import { useEffect, useRef } from "react";

/**
 * Lightweight voxel snowfall for the public site (no Three.js: the site must stay fast and
 * indexable, IMPL-0005). Flakes are integer-aligned squares — and a few 5-block "cross" flakes —
 * on a fixed canvas above the page, so they never move layout.
 *
 * Comfort rules: the visitor can switch the snow off; `prefers-reduced-motion: reduce` keeps a calm
 * static frost instead of falling flakes; the loop stops when the tab is hidden or the canvas is
 * off screen. Motion is written directly to the canvas, never to layout properties.
 */

export interface Snowflake {
  x: number;
  y: number;
  /** Square edge in CSS px (2, 3 or 4). */
  size: number;
  /** Fall speed in CSS px/s. */
  speed: number;
  /** Horizontal sway amplitude in CSS px/s. */
  drift: number;
  /** Phase of the sway, radians. */
  phase: number;
  /** Five-block flake instead of a single square. */
  cross: boolean;
  /** Warm gold sparkle instead of snow. */
  sparkle: boolean;
  alpha: number;
}

export const SNOW_SEED = 0x5eed_2026;

/** Deterministic 32-bit hash → [0, 1). Same seed always yields the same flake field. */
function hash(n: number): number {
  let h = Math.imul(n ^ 0x9e37_79b9, 0x85eb_ca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2_ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4_294_967_296;
}

/**
 * Pure flake field for a viewport. Coordinates stay inside the given box and sizes stay in
 * {2, 3, 4} px, so the renderer never needs bounds checks of its own.
 */
export function createSnowflakes(width: number, height: number, count: number, seed = SNOW_SEED): Snowflake[] {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  return Array.from({ length: Math.max(0, Math.round(count)) }, (_, i) => {
    const base = (seed + i * 16) >>> 0;
    const r = (k: number) => hash(base + k);
    const roll = r(1);
    const cross = r(4) > 0.82;
    return {
      x: Math.round(r(2) * w),
      y: Math.round(r(3) * h),
      size: cross ? 3 : roll > 0.66 ? 4 : roll > 0.33 ? 3 : 2,
      speed: 16 + r(5) * 52,
      drift: 6 + r(6) * 22,
      phase: r(7) * Math.PI * 2,
      cross,
      sparkle: r(8) > 0.88,
      alpha: 0.3 + r(9) * 0.5,
    };
  });
}

const FALLBACK_FLAKE = "#e8f2f8";
const FALLBACK_SPARKLE = "#e4b863";

function safeColor(value: string, fallback: string): string {
  if (!value) return fallback;
  return typeof CSS !== "undefined" && CSS.supports?.("color", value) ? value : fallback;
}

export function VoxelSnow({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const ctx = context;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let width = 0;
    let height = 0;
    let flakes: Snowflake[] = [];
    let frame = 0;
    let last = 0;
    let clock = 0;
    let resizeTimer = 0;
    let running = false;

    const palette = () => {
      const styles = getComputedStyle(document.documentElement);
      return {
        flake: safeColor(styles.getPropertyValue("--flake").trim(), FALLBACK_FLAKE),
        sparkle: safeColor(styles.getPropertyValue("--sparkle").trim(), FALLBACK_SPARKLE),
      };
    };

    const paint = () => {
      const { flake, sparkle } = palette();
      ctx.clearRect(0, 0, width, height);
      for (const snow of flakes) {
        const x = Math.round(snow.x);
        const y = Math.round(snow.y);
        const size = snow.size;
        const rgb = snow.sparkle ? sparkle : flake;
        // Soft colour wash first, then the block itself: keeps flakes readable on cream and on pine.
        ctx.globalAlpha = snow.alpha;
        ctx.fillStyle = rgb;
        if (snow.cross) {
          ctx.fillRect(x, y - size, size, size * 3);
          ctx.fillRect(x - size, y, size * 3, size);
        } else {
          ctx.fillRect(x, y, size, size);
        }
      }
      ctx.globalAlpha = 1;
    };

    const measure = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.max(36, Math.min(150, Math.round((width * height) / 14_000)));
      flakes = createSnowflakes(width, height, count);
      paint();
    };

    const tick = (now: number) => {
      const dt = Math.min(50, now - last) / 1000;
      last = now;
      clock += dt;
      for (const snow of flakes) {
        snow.y += snow.speed * dt;
        snow.x += Math.sin(clock * 0.9 + snow.phase) * snow.drift * dt;
        if (snow.y > height + 8) {
          snow.y = -8;
          snow.x = hash(Math.round(snow.x + snow.phase * 1000) ^ Math.round(clock * 1000)) * width;
        }
        if (snow.x < -8) snow.x = width + 8;
        else if (snow.x > width + 8) snow.x = -8;
      }
      paint();
      frame = window.requestAnimationFrame(tick);
    };

    const stop = () => {
      running = false;
      if (frame) window.cancelAnimationFrame(frame);
      frame = 0;
    };

    const start = () => {
      if (running) return;
      running = true;
      last = performance.now();
      frame = window.requestAnimationFrame(tick);
    };

    const sync = () => {
      const shouldMove = active && !reducedMotion.matches && !document.hidden;
      if (shouldMove) start();
      else {
        stop();
        paint();
      }
    };

    const onResize = () => {
      window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        measure();
        sync();
      }, 100);
    };

    measure();
    sync();

    window.addEventListener("resize", onResize, { passive: true });
    document.addEventListener("visibilitychange", sync);
    reducedMotion.addEventListener("change", sync);
    // Tokens change with the theme; repaint so flakes keep contrast on the new canvas.
    const themeObserver = new MutationObserver(paint);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    return () => {
      stop();
      window.clearTimeout(resizeTimer);
      window.removeEventListener("resize", onResize);
      document.removeEventListener("visibilitychange", sync);
      reducedMotion.removeEventListener("change", sync);
      themeObserver.disconnect();
    };
  }, [active]);

  return <canvas ref={canvasRef} className="voxel-snow" aria-hidden="true" />;
}
