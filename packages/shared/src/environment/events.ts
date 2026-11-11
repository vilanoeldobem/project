/**
 * Scheduled world events (spec §7.6) — PROPOSAL. Code constants versioned with CONFIG_VERSION, not
 * admin mutations (there is no authenticated admin yet, DEC-037). Every event is a pure function of
 * the absolute time: it starts, blends and expires by timestamp, so late joiners see the same state.
 */
import type { NumericWeatherKey, WeatherParams } from "./weather";
import { lerp, smoothstep } from "./time";
import { lerpAngle } from "./weather";
import { saoPauloCivil, saoPauloToEpoch } from "./time";

export type WorldEventKind = "CHRISTMAS_EVE_SPARKLES" | "CHRISTMAS_DAY" | "NEW_YEAR_SPARKLES";

export interface WorldEvent {
  eventId: string;
  kind: WorldEventKind;
  startsAtMs: number;
  endsAtMs: number;
  transitionMs: number;
  priority: number;
  params: Partial<Record<NumericWeatherKey, number>>;
}

const MIN = 60_000;

const byYear = new Map<number, WorldEvent[]>();

/** Events of one São Paulo calendar year (Christmas season). Memoised: the frame loop asks every frame. */
export function eventsForYear(year: number): WorldEvent[] {
  let list = byYear.get(year);
  if (!list) byYear.set(year, (list = buildYear(year)));
  return list;
}

function buildYear(year: number): WorldEvent[] {
  return [
    {
      eventId: `christmas-eve-${year}`,
      kind: "CHRISTMAS_EVE_SPARKLES",
      startsAtMs: saoPauloToEpoch(year, 12, 24, 18, 0),
      endsAtMs: saoPauloToEpoch(year, 12, 25, 2, 0),
      transitionMs: 10 * MIN,
      priority: 100,
      params: { snowfall: 0.35, windStrength: 0.12, fogStrength: 0.1, sparkle: 1, aurora: 1, cloudCover: 0.3 },
    },
    {
      eventId: `christmas-day-${year}`,
      kind: "CHRISTMAS_DAY",
      startsAtMs: saoPauloToEpoch(year, 12, 25, 6, 0),
      endsAtMs: saoPauloToEpoch(year, 12, 26, 0, 0),
      transitionMs: 10 * MIN,
      priority: 50,
      params: { snowfall: 0.25, fogStrength: 0.08, sparkle: 0.8 },
    },
    {
      eventId: `new-year-${year}`,
      kind: "NEW_YEAR_SPARKLES",
      startsAtMs: saoPauloToEpoch(year, 12, 31, 23, 0),
      endsAtMs: saoPauloToEpoch(year + 1, 1, 1, 1, 0),
      transitionMs: 5 * MIN,
      priority: 100,
      params: { snowfall: 0.15, fogStrength: 0.05, sparkle: 1, aurora: 1, cloudCover: 0.2 },
    },
  ];
}

/** 0..1 weight of an event at `epochMs` (smooth in and out, 0 outside its window). */
export function eventWeight(e: WorldEvent, epochMs: number): number {
  if (epochMs < e.startsAtMs || epochMs >= e.endsAtMs) return 0;
  const t = Math.max(1, e.transitionMs);
  return Math.min(smoothstep(e.startsAtMs, e.startsAtMs + t, epochMs), 1 - smoothstep(e.endsAtMs - t, e.endsAtMs, epochMs));
}

/** Active events at a timestamp, lowest priority first (higher priority applied last wins). */
export function activeEvents(epochMs: number): Array<{ event: WorldEvent; weight: number }> {
  const { year } = saoPauloCivil(epochMs);
  const out: Array<{ event: WorldEvent; weight: number }> = [];
  for (const e of [...eventsForYear(year - 1), ...eventsForYear(year)]) {
    const weight = eventWeight(e, epochMs);
    if (weight > 0) out.push({ event: e, weight });
  }
  return out.sort((a, b) => a.event.priority - b.event.priority);
}

export function applyEvents<T extends WeatherParams>(base: T, events: Array<{ event: WorldEvent; weight: number }>): T {
  const w = { ...base };
  for (const { event, weight } of events) {
    for (const [k, v] of Object.entries(event.params) as Array<[NumericWeatherKey, number]>) {
      w[k] = k === "windDirectionRad" ? lerpAngle(w[k], v, weight) : lerp(w[k], v, weight);
    }
  }
  return w;
}
