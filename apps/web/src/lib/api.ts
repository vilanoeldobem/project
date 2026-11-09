/** Client for the Worker API (docs/reference/api.md). Failures resolve to `null`. */

export interface Indicator {
  key: string;
  /** User-facing label (pt-BR). */
  label: string;
  value: number | null;
  /** User-facing reason (pt-BR) when `value` is null. */
  note?: string;
}

export type LotState = "available" | "application_sent" | "under_review" | "published";

export interface LotInfo {
  id: string;
  state: LotState;
  ngo_name: string | null;
  ngo_summary: string | null;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(path, { headers: { Accept: "application/json" } });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const fetchIndicators = () => getJson<{ updatedAt: string; indicators: Indicator[] }>("/api/indicators");
export const fetchLots = () => getJson<{ lots: LotInfo[] }>("/api/lots");
