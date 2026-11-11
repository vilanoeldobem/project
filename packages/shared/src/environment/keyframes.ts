/**
 * Artistic lighting keyframes by São Paulo local hour (spec §4.4, §5.3). Continuous across midnight:
 * the 24:00 key equals the 00:00 key. Colours are sRGB art targets (spec §2.3), not physical values.
 * Segments are eased with smoothstep, so no property overshoots its keys.
 */
import { clamp01, lerp, smoothstep } from "./time";
import type { WeatherParams } from "./weather";

export type Rgb = [number, number, number];

export interface LightKey {
  h: number;
  skyTop: string;
  skyHorizon: string;
  sunColor: string;
  /** 0..1 key light strength (sun by day). */
  sun: number;
  /** 0..1 moon light strength. */
  moon: number;
  hemiSky: string;
  hemiGround: string;
  hemi: number;
  /** 0..1 emissive Christmas lights and windows. */
  artificial: number;
  stars: number;
  exposure: number;
}

const NIGHT: Omit<LightKey, "h"> = {
  // Night stays readable (spec §5.5): deep blue, never black; strong cool fill + moon key.
  skyTop: "#0B1530", skyHorizon: "#1F3466", sunColor: "#A1BBFF", sun: 0, moon: 1,
  hemiSky: "#7C98CC", hemiGround: "#4A5A80", hemi: 0.95, artificial: 1, stars: 1, exposure: 1.1,
};

export const KEYS: LightKey[] = [
  { h: 0, ...NIGHT },
  { h: 4.5, ...NIGHT, skyHorizon: "#24386B" },
  { h: 5, skyTop: "#1B2A55", skyHorizon: "#6C5A8E", sunColor: "#FFB08A", sun: 0.1, moon: 0.6, hemiSky: "#8C8FC4", hemiGround: "#3D4566", hemi: 0.6, artificial: 0.9, stars: 0.6, exposure: 1.02 },
  { h: 6, skyTop: "#5E8FCB", skyHorizon: "#F2B497", sunColor: "#FFC98F", sun: 0.55, moon: 0, hemiSky: "#C7D9F2", hemiGround: "#6F7E9A", hemi: 0.8, artificial: 0.25, stars: 0, exposure: 1 },
  { h: 9, skyTop: "#5FAEDD", skyHorizon: "#CDE8F5", sunColor: "#FFE7C7", sun: 0.9, moon: 0, hemiSky: "#D4ECFA", hemiGround: "#7184A1", hemi: 0.95, artificial: 0, stars: 0, exposure: 1 },
  { h: 12, skyTop: "#4FA3D9", skyHorizon: "#BFE3F4", sunColor: "#FFF3DE", sun: 1, moon: 0, hemiSky: "#DCF0FB", hemiGround: "#7184A1", hemi: 1, artificial: 0, stars: 0, exposure: 1 },
  { h: 16.5, skyTop: "#5AA6D6", skyHorizon: "#D5E6EE", sunColor: "#FFE1B5", sun: 0.85, moon: 0, hemiSky: "#D2E6F4", hemiGround: "#7A86A0", hemi: 0.92, artificial: 0.1, stars: 0, exposure: 1 },
  { h: 17, skyTop: "#6C8CC8", skyHorizon: "#F0C29A", sunColor: "#FFC27E", sun: 0.7, moon: 0, hemiSky: "#D9C9D8", hemiGround: "#76718C", hemi: 0.85, artificial: 0.45, stars: 0, exposure: 1 },
  { h: 18.5, skyTop: "#2E3A78", skyHorizon: "#EB9678", sunColor: "#FF9C6B", sun: 0.18, moon: 0.4, hemiSky: "#9A8CC0", hemiGround: "#433F62", hemi: 0.65, artificial: 1, stars: 0.35, exposure: 1.03 },
  { h: 21, ...NIGHT, skyTop: "#111E3D", skyHorizon: "#283C70" },
  { h: 24, ...NIGHT },
];

export function hexToRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const grey = (c: Rgb, amount: number, to: Rgb = [0.72, 0.77, 0.82]): Rgb => mix(c, to, amount);

const RGB_KEYS = KEYS.map((k) => ({
  ...k,
  skyTopRgb: hexToRgb(k.skyTop),
  skyHorizonRgb: hexToRgb(k.skyHorizon),
  sunRgb: hexToRgb(k.sunColor),
  hemiSkyRgb: hexToRgb(k.hemiSky),
  hemiGroundRgb: hexToRgb(k.hemiGround),
}));

export interface Look {
  skyTop: Rgb;
  skyHorizon: Rgb;
  fogColor: Rgb;
  sunColor: Rgb;
  sunIntensity: number;
  /** Unit vector toward the key light (sun by day, moon by night). */
  sunDirection: [number, number, number];
  moonIntensity: number;
  hemiSky: Rgb;
  hemiGround: Rgb;
  hemiIntensity: number;
  artificial: number;
  stars: number;
  exposure: number;
  /** FogExp2 density, capped for gameplay visibility (spec §8.3). */
  fogDensity: number;
  /** 0 = night, 1 = full day (useful for shaders). */
  daylight: number;
}

/** Visibility floor: the densest fog still shows the avatar and the nearest lots. */
export const MAX_FOG_DENSITY = 0.03;
const BASE_FOG_DENSITY = 0.006;

/** Pure: São Paulo hour (0..24) + macro weather → final look. */
export function lookAt(hour: number, weather: Pick<WeatherParams, "cloudCover" | "fogStrength">): Look {
  const h = ((hour % 24) + 24) % 24;
  let i = 0;
  while (i < RGB_KEYS.length - 2 && RGB_KEYS[i + 1].h <= h) i++;
  const a = RGB_KEYS[i], b = RGB_KEYS[i + 1];
  const t = smoothstep(a.h, b.h, h);

  const clouds = clamp01(weather.cloudCover);
  const fog = clamp01(weather.fogStrength);
  const overcast = clouds * 0.55 + fog * 0.25;

  const sun = lerp(a.sun, b.sun, t) * (1 - 0.6 * clouds);
  const moon = lerp(a.moon, b.moon, t) * (1 - 0.5 * clouds);
  const daylight = clamp01(lerp(a.sun, b.sun, t));
  const greyTo: Rgb = mix([0.16, 0.2, 0.3], [0.78, 0.82, 0.87], daylight);
  const skyTop = grey(mix(a.skyTopRgb, b.skyTopRgb, t), overcast, greyTo);
  const skyHorizon = grey(mix(a.skyHorizonRgb, b.skyHorizonRgb, t), overcast, greyTo);

  // Artistic arc (not astronomy): sun rises in the east (+x) around 05:00, sets west around 19:00;
  // at night the key light is the moon from the opposite side, kept high so shadows stay readable.
  const dayArc = clamp01((h - 5) / 14);
  const isSun = daylight > 0.02 || (h >= 5 && h <= 19);
  const ang = isSun ? Math.PI * dayArc : Math.PI * (((h + 5) % 24) / 10);
  const elev = 0.35 + 0.65 * Math.sin(Math.min(Math.PI, Math.max(0, ang)));
  const x = Math.cos(ang) * (isSun ? 1 : -1);
  const len = Math.hypot(x, elev, 0.45);

  return {
    skyTop,
    skyHorizon,
    fogColor: mix(skyHorizon, skyTop, 0.15),
    sunColor: mix(a.sunRgb, b.sunRgb, t),
    sunIntensity: sun,
    sunDirection: [x / len, elev / len, 0.45 / len],
    moonIntensity: moon,
    hemiSky: grey(mix(a.hemiSkyRgb, b.hemiSkyRgb, t), clouds * 0.3, greyTo),
    hemiGround: mix(a.hemiGroundRgb, b.hemiGroundRgb, t),
    hemiIntensity: lerp(a.hemi, b.hemi, t) * (1 + 0.15 * clouds),
    artificial: Math.min(1, lerp(a.artificial, b.artificial, t) + 0.35 * overcast),
    stars: lerp(a.stars, b.stars, t) * (1 - clouds),
    exposure: lerp(a.exposure, b.exposure, t),
    fogDensity: Math.min(MAX_FOG_DENSITY, BASE_FOG_DENSITY + fog * 0.024),
    daylight,
  };
}
