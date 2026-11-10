/**
 * One environment frame = everything every subsystem needs, derived from ONE timestamp (spec §15.7:
 * never let each subsystem call `new Date()`). Pure, so it is unit-tested and identical on all clients.
 */
import type { EnvironmentSnapshot } from "./config";
import { activeEvents, applyEvents, type WorldEvent } from "./events";
import { lookAt, type Look } from "./keyframes";
import { dayPhase, saoPauloSecondsOfDay, type DayPhase } from "./time";
import { weatherAt, type InterpolatedWeather } from "./weather";

export interface EnvironmentFrame {
  timestampMs: number;
  /** São Paulo local hour, 0..24 with fraction. */
  hour: number;
  phase: DayPhase;
  phaseProgress: number;
  weather: InterpolatedWeather;
  events: WorldEvent[];
  look: Look;
  /** Shared seconds for synchronised animation (twinkle patterns); wraps daily to keep float precision. */
  worldSeconds: number;
}

export function computeFrame(epochMs: number, snap: EnvironmentSnapshot): EnvironmentFrame {
  const hour = saoPauloSecondsOfDay(epochMs) / 3600;
  const phase = dayPhase(epochMs, snap.cycle);
  const active = activeEvents(epochMs);
  const weather = applyEvents(
    weatherAt(snap.weatherSeed, epochMs, snap.weatherSlotDurationMs, snap.weatherTransitionMs),
    active
  );
  return {
    timestampMs: epochMs,
    hour,
    phase: phase.kind,
    phaseProgress: phase.progress,
    weather,
    events: active.map((a) => a.event),
    look: lookAt(hour, weather),
    worldSeconds: (((epochMs % 86_400_000) + 86_400_000) % 86_400_000) / 1000,
  };
}
