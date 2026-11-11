/**
 * Per-device environment settings (spec §9.4, §17.2). They change rendering QUALITY only, never the
 * clock, the macro weather or game rules (R-12). Stored locally; unavailable storage = defaults.
 */
import { create } from "zustand";

export type Quality = "low" | "medium" | "high" | "ultra";
export type QualitySetting = Quality | "auto";

export interface EnvironmentSettings {
  quality: QualitySetting;
  /** Fewer moving effects (snow drift, sway, shooting stars); defaults to prefers-reduced-motion. */
  reduceMotion: boolean;
  /** Steady lights instead of twinkling (photosensitivity). */
  reduceFlicker: boolean;
  /** Falling snow and sparkles. */
  particles: boolean;
  /** Procedural ambience; off until the person turns it on. */
  sound: boolean;
  /** See other visitors (anonymous avatars, no names, no chat) and be seen (IMPL-0008). */
  multiplayer: boolean;
}

export interface QualityPreset {
  snowFlakes: number;
  maxDpr: number;
  shadowMapSize: number;
  shadows: boolean;
  bloom: boolean;
  bloomStrength: number;
  sparkles: number;
  footprints: number;
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { snowFlakes: 400, maxDpr: 1, shadowMapSize: 512, shadows: false, bloom: false, bloomStrength: 0, sparkles: 60, footprints: 24 },
  medium: { snowFlakes: 1200, maxDpr: 1.25, shadowMapSize: 1024, shadows: true, bloom: false, bloomStrength: 0, sparkles: 120, footprints: 48 },
  high: { snowFlakes: 2400, maxDpr: 1.5, shadowMapSize: 2048, shadows: true, bloom: true, bloomStrength: 0.3, sparkles: 200, footprints: 80 },
  ultra: { snowFlakes: 4800, maxDpr: 2, shadowMapSize: 2048, shadows: true, bloom: true, bloomStrength: 0.4, sparkles: 320, footprints: 120 },
};

/** Conservative guess from cheap signals; the person can override it in "Ambiente". */
export function detectQuality(): Quality {
  if (typeof navigator === "undefined") return "medium";
  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 4;
  const coarse = typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;
  if (coarse) return cores >= 8 && memory >= 6 ? "medium" : "low";
  if (cores >= 8 && memory >= 8) return "high";
  return "medium";
}

const KEY = "vila.environment.v1";

const prefersReducedMotion = () =>
  typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function load(): EnvironmentSettings {
  const defaults: EnvironmentSettings = {
    quality: "auto",
    reduceMotion: prefersReducedMotion(),
    reduceFlicker: prefersReducedMotion(),
    particles: true,
    sound: false,
    multiplayer: true,
  };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw) as Partial<EnvironmentSettings>;
      const quality = ["auto", "low", "medium", "high", "ultra"].includes(saved.quality as string) ? saved.quality : "auto";
      const bool = (v: unknown, d: boolean) => (typeof v === "boolean" ? v : d);
      return {
        quality: quality as QualitySetting,
        reduceMotion: bool(saved.reduceMotion, defaults.reduceMotion),
        reduceFlicker: bool(saved.reduceFlicker, defaults.reduceFlicker),
        particles: bool(saved.particles, defaults.particles),
        sound: false,
        multiplayer: bool(saved.multiplayer, defaults.multiplayer),
      };
    }
  } catch {
    /* storage unavailable */
  }
  return defaults;
}

interface SettingsState extends EnvironmentSettings {
  detected: Quality;
  set: (patch: Partial<EnvironmentSettings>) => void;
}

export const useEnvSettings = create<SettingsState>((set, get) => ({
  ...load(),
  detected: detectQuality(),
  set: (patch) => {
    set(patch);
    const { quality, reduceMotion, reduceFlicker, particles, multiplayer } = get();
    try {
      // Sound is never persisted on: audio must start from a fresh, explicit gesture.
      localStorage.setItem(KEY, JSON.stringify({ quality, reduceMotion, reduceFlicker, particles, multiplayer }));
    } catch {
      /* same as above */
    }
  },
}));

export const resolveQuality = (s: Pick<SettingsState, "quality" | "detected">): Quality =>
  s.quality === "auto" ? s.detected : s.quality;

export const useQuality = () => useEnvSettings((s) => resolveQuality(s));
export const usePreset = () => PRESETS[useQuality()];
