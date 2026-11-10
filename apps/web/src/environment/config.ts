/**
 * Environment contract shared by the Worker (authority) and the client (renderer).
 *
 * PROPOSAL (IMPL-0006, "CHRISTMAS WORLD" spec v1.0): the world clock follows the real civil time of
 * America/Sao_Paulo at 1:1; weather is fictional and procedural. Changing any value that alters the
 * deterministic output (seed, slot length, algorithm) requires bumping `WEATHER_ALGORITHM_VERSION` or
 * `CONFIG_VERSION` — never change it silently (spec §7.4, §14.4).
 */

export const ENVIRONMENT_SCHEMA_VERSION = 1;
export const WORLD_ID = "vila-noel-do-bem";
export const TIME_ZONE = "America/Sao_Paulo";
export const TIME_SCALE = 1;
export const CONFIG_VERSION = 1;
export const WEATHER_ALGORITHM_VERSION = 1;

/** Stable FNV-1a hash of the world id: the seed is derived, never random. */
export function seedFromWorldId(worldId: string): number {
  let hash = 2166136261 >>> 0;
  for (let i = 0; i < worldId.length; i++) {
    hash ^= worldId.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash;
}

export const WEATHER_SEED = seedFromWorldId(WORLD_ID);
/** 45 real minutes per weather slot, 5-minute blend between slots. */
export const WEATHER_SLOT_MS = 45 * 60 * 1000;
export const WEATHER_TRANSITION_MS = 5 * 60 * 1000;

/** Artistic phase boundaries in São Paulo local time (not astronomical sunrise/sunset). */
export const CYCLE = { dawnStart: "05:00", dayStart: "06:00", duskStart: "17:00", nightStart: "18:30" } as const;

export interface EnvironmentSnapshot {
  type: "environment.snapshot";
  schemaVersion: number;
  worldId: string;
  serverTimeMs: number;
  timezone: string;
  timeScale: number;
  configVersion: number;
  weatherAlgorithmVersion: number;
  weatherSeed: number;
  weatherSlotDurationMs: number;
  weatherTransitionMs: number;
  cycle: typeof CYCLE;
}

/** Snapshot without the server time: the client uses it before (or without) the first sync. */
export function localSnapshot(serverTimeMs: number): EnvironmentSnapshot {
  return {
    type: "environment.snapshot",
    schemaVersion: ENVIRONMENT_SCHEMA_VERSION,
    worldId: WORLD_ID,
    serverTimeMs,
    timezone: TIME_ZONE,
    timeScale: TIME_SCALE,
    configVersion: CONFIG_VERSION,
    weatherAlgorithmVersion: WEATHER_ALGORITHM_VERSION,
    weatherSeed: WEATHER_SEED,
    weatherSlotDurationMs: WEATHER_SLOT_MS,
    weatherTransitionMs: WEATHER_TRANSITION_MS,
    cycle: CYCLE,
  };
}

/** Validates an untrusted snapshot; returns null when incompatible or malformed. */
export function parseSnapshot(raw: unknown): EnvironmentSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const num = (k: string) => typeof s[k] === "number" && Number.isFinite(s[k] as number);
  if (s.type !== "environment.snapshot") return null;
  if (s.schemaVersion !== ENVIRONMENT_SCHEMA_VERSION) return null;
  if (s.timezone !== TIME_ZONE || s.timeScale !== TIME_SCALE) return null;
  if (s.weatherAlgorithmVersion !== WEATHER_ALGORITHM_VERSION) return null;
  if (!["serverTimeMs", "configVersion", "weatherSeed", "weatherSlotDurationMs", "weatherTransitionMs"].every(num)) return null;
  const slot = s.weatherSlotDurationMs as number;
  const transition = s.weatherTransitionMs as number;
  if (!(slot > 0 && transition > 0 && transition <= slot)) return null;
  if (typeof s.worldId !== "string") return null;
  return { ...(s as unknown as EnvironmentSnapshot), cycle: CYCLE };
}
