export interface Env {
  ROOMS?: DurableObjectNamespace;
  /** Comma-separated page origins allowed to open a room (e.g. https://play.vilanoeldobem.com.br). */
  ALLOWED_ORIGINS?: string;
  ENVIRONMENT?: string;
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
