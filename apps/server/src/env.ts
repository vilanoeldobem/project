export interface Env {
  ROOMS?: DurableObjectNamespace;
  /** Comma-separated page origins allowed to open a room (e.g. https://play.vilanoeldobem.com.br). */
  ALLOWED_ORIGINS?: string;
  /** Seconds without real activity before the room closes a connection (IMPL-0014); see `idleTimeoutMs`. */
  IDLE_TIMEOUT_SECONDS?: string;
  ENVIRONMENT?: string;
}

/** Default idle limit: 5 minutes (IMPL-0014). */
export const DEFAULT_IDLE_TIMEOUT_SECONDS = 300;
/** Below a minute a person who is only looking around would be dropped (the client reports input every 20 s). */
export const MIN_IDLE_TIMEOUT_SECONDS = 60;
/** Above a day the limit no longer limits anything. */
export const MAX_IDLE_TIMEOUT_SECONDS = 86_400;

/**
 * Idle limit in milliseconds from `IDLE_TIMEOUT_SECONDS`. Anything that is not a whole number of seconds
 * inside [MIN, MAX] (missing, empty, text, negative, fractional, out of range) falls back to the default.
 */
export function idleTimeoutMs(env: Pick<Env, "IDLE_TIMEOUT_SECONDS">): number {
  const raw = String(env.IDLE_TIMEOUT_SECONDS ?? "").trim();
  const n = /^\d{1,6}$/.test(raw) ? Number(raw) : NaN;
  const ok = n >= MIN_IDLE_TIMEOUT_SECONDS && n <= MAX_IDLE_TIMEOUT_SECONDS;
  return (ok ? n : DEFAULT_IDLE_TIMEOUT_SECONDS) * 1000;
}

/** Exact-match origin allow-list (no wildcards: a lookalike host must never pass). */
export function originAllowed(origin: string | null, env: Pick<Env, "ALLOWED_ORIGINS">): boolean {
  if (!origin) return false;
  return (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean)
    .includes(origin);
}
