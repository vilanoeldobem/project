/**
 * São Paulo civil time from an absolute UTC epoch. Uses the IANA zone through Intl — never a fixed
 * UTC-3 offset, so future legal changes are picked up by the runtime's tz database (spec §4.6).
 */
import { TIME_ZONE } from "./config";

const formatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

export interface CivilTime {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

// Intl formatting is comparatively slow; the per-frame path caches by whole second.
let cacheSecond = Number.NaN;
let cacheValue: CivilTime = { year: 1970, month: 1, day: 1, hour: 0, minute: 0, second: 0 };

export function saoPauloCivil(epochMs: number): CivilTime {
  const sec = Math.floor(epochMs / 1000);
  if (sec === cacheSecond) return cacheValue;
  const v: Record<string, number> = {};
  for (const p of formatter.formatToParts(new Date(sec * 1000))) if (p.type !== "literal") v[p.type] = Number(p.value);
  cacheSecond = sec;
  cacheValue = { year: v.year, month: v.month, day: v.day, hour: v.hour, minute: v.minute, second: v.second };
  return cacheValue;
}

/** Seconds since São Paulo local midnight, with millisecond fraction (0 ≤ x < 86400). */
export function saoPauloSecondsOfDay(epochMs: number): number {
  const c = saoPauloCivil(epochMs);
  const frac = (((epochMs % 1000) + 1000) % 1000) / 1000;
  return c.hour * 3600 + c.minute * 60 + c.second + frac;
}

/** Epoch for a São Paulo civil date-time (resolves the zone offset through Intl, two passes). */
export function saoPauloToEpoch(year: number, month: number, day: number, hour = 0, minute = 0): number {
  const wanted = Date.UTC(year, month - 1, day, hour, minute);
  let guess = wanted;
  for (let i = 0; i < 2; i++) {
    const c = saoPauloCivil(guess);
    const seen = Date.UTC(c.year, c.month - 1, c.day, c.hour, c.minute, c.second);
    guess += wanted - seen;
  }
  return guess;
}

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
}

export type DayPhase = "dawn" | "day" | "dusk" | "night";

const hm = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h + m / 60;
};

/** Discrete phase label (for UI/debug). Visuals use the continuous keyframes in `keyframes.ts`. */
export function dayPhase(
  epochMs: number,
  cycle: { dawnStart: string; dayStart: string; duskStart: string; nightStart: string }
): { kind: DayPhase; progress: number } {
  const h = saoPauloSecondsOfDay(epochMs) / 3600;
  const [dawn, day, dusk, night] = [cycle.dawnStart, cycle.dayStart, cycle.duskStart, cycle.nightStart].map(hm);
  if (h >= dawn && h < day) return { kind: "dawn", progress: (h - dawn) / (day - dawn) };
  if (h >= day && h < dusk) return { kind: "day", progress: (h - day) / (dusk - day) };
  if (h >= dusk && h < night) return { kind: "dusk", progress: (h - dusk) / (night - dusk) };
  const len = 24 - night + dawn;
  return { kind: "night", progress: h >= night ? (h - night) / len : (h + 24 - night) / len };
}
