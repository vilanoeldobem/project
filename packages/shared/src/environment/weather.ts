/**
 * Deterministic procedural weather, algorithm v1 (spec §7, §15.4). Fictional: no real-world weather,
 * geolocation or astronomy. Same seed + version + timestamp → same macro state on every client.
 *
 * Known v1 limitation: slots are drawn independently, so clear → blizzard can follow each other
 * (the 5-minute blend hides the cut). Correlated sampling would be algorithm v2.
 */
import { clamp01, lerp, smoothstep } from "./time";
import { random01 } from "./random";

export type WeatherKind = "CLEAR_FROST" | "LIGHT_SNOW" | "SNOW" | "HEAVY_SNOW" | "BLIZZARD" | "MISTY_FROST";

/** Normalised art-direction coordinates (0..1), not physical units. */
export interface WeatherParams {
  kind: WeatherKind;
  snowfall: number;
  windStrength: number;
  /** 0..2π, world XZ plane. */
  windDirectionRad: number;
  fogStrength: number;
  cloudCover: number;
  sparkle: number;
  /** Rare aurora on clear nights (rendered only when the sky is dark). */
  aurora: number;
}

export type NumericWeatherKey = Exclude<keyof WeatherParams, "kind">;

const TYPES: Array<{ kind: WeatherKind; cumulative: number }> = [
  { kind: "CLEAR_FROST", cumulative: 0.12 },
  { kind: "LIGHT_SNOW", cumulative: 0.42 },
  { kind: "SNOW", cumulative: 0.74 },
  { kind: "HEAVY_SNOW", cumulative: 0.92 },
  { kind: "BLIZZARD", cumulative: 0.97 },
  { kind: "MISTY_FROST", cumulative: 1.0 },
];

type Profile = Pick<WeatherParams, "snowfall" | "windStrength" | "fogStrength" | "cloudCover" | "sparkle">;

export const PROFILES: Record<WeatherKind, Profile> = {
  CLEAR_FROST: { snowfall: 0.0, windStrength: 0.08, fogStrength: 0.02, cloudCover: 0.12, sparkle: 0.55 },
  LIGHT_SNOW: { snowfall: 0.2, windStrength: 0.15, fogStrength: 0.12, cloudCover: 0.4, sparkle: 0.45 },
  SNOW: { snowfall: 0.48, windStrength: 0.25, fogStrength: 0.26, cloudCover: 0.65, sparkle: 0.35 },
  HEAVY_SNOW: { snowfall: 0.78, windStrength: 0.5, fogStrength: 0.48, cloudCover: 0.85, sparkle: 0.22 },
  BLIZZARD: { snowfall: 1.0, windStrength: 0.9, fogStrength: 0.76, cloudCover: 1.0, sparkle: 0.06 },
  MISTY_FROST: { snowfall: 0.12, windStrength: 0.06, fogStrength: 0.82, cloudCover: 0.7, sparkle: 0.18 },
};

export const WEATHER_KINDS = TYPES.map((t) => t.kind);

/** Pure, deterministic macro weather for one slot. */
export function sampleWeatherSlot(seed: number, slot: number): WeatherParams {
  const r = random01(seed, slot, 1);
  const kind = (TYPES.find((x) => r < x.cumulative) ?? TYPES[TYPES.length - 1]).kind;
  const p = PROFILES[kind];
  return {
    kind,
    snowfall: p.snowfall,
    windStrength: clamp01(p.windStrength * (0.75 + 0.5 * random01(seed, slot, 2))),
    windDirectionRad: random01(seed, slot, 3) * Math.PI * 2,
    fogStrength: p.fogStrength,
    cloudCover: p.cloudCover,
    sparkle: p.sparkle,
    aurora: kind === "CLEAR_FROST" && random01(seed, slot, 4) < 0.35 ? 1 : 0,
  };
}

/** Shortest-arc angle interpolation (359° → 1° goes through 0°, never 180°). */
export function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  const r = a + delta * t;
  const tau = Math.PI * 2;
  return ((r % tau) + tau) % tau;
}

export interface InterpolatedWeather extends WeatherParams {
  /** 0..1 blend from the previous slot into this one. */
  transition: number;
  slot: number;
}

export function blendWeather(from: WeatherParams, to: WeatherParams, t: number): WeatherParams {
  return {
    kind: t < 0.5 ? from.kind : to.kind,
    snowfall: lerp(from.snowfall, to.snowfall, t),
    windStrength: lerp(from.windStrength, to.windStrength, t),
    windDirectionRad: lerpAngle(from.windDirectionRad, to.windDirectionRad, t),
    fogStrength: lerp(from.fogStrength, to.fogStrength, t),
    cloudCover: lerp(from.cloudCover, to.cloudCover, t),
    sparkle: lerp(from.sparkle, to.sparkle, t),
    aurora: lerp(from.aurora, to.aurora, t),
  };
}

export function weatherAt(seed: number, epochMs: number, slotMs: number, transitionMs: number): InterpolatedWeather {
  if (!(slotMs > 0) || !(transitionMs > 0 && transitionMs <= slotMs)) {
    throw new Error("Invalid weather timing configuration");
  }
  const slot = Math.floor(epochMs / slotMs);
  const alpha = smoothstep(0, transitionMs, epochMs - slot * slotMs);
  const w = blendWeather(sampleWeatherSlot(seed, slot - 1), sampleWeatherSlot(seed, slot), alpha);
  // The discrete kind is the destination once the blend starts (spec §15.4).
  return { ...w, kind: alpha > 0 ? sampleWeatherSlot(seed, slot).kind : w.kind, transition: alpha, slot };
}
