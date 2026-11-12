/** Client for the HTTP API Worker (docs/reference/api.md). Failures resolve to `null`. */
import { SERVICES } from "./services";

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
  /** Id of the published NGO on this lot (the id of its application); null otherwise, absent from an older API. */
  ngo_id?: string | null;
  ngo_name: string | null;
  ngo_summary: string | null;
  /** Path on the API of the public logo of a published NGO (IMPL-0017); absent from an older API. */
  ngo_logo?: string | null;
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    const res = await fetch(`${SERVICES.api}${path}`, { headers: { Accept: "application/json" } });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export const fetchIndicators = () => getJson<{ updatedAt: string; indicators: Indicator[] }>("/indicators");
export const fetchLots = () => getJson<{ lots: LotInfo[] }>("/lots");

/** One photo of a published NGO's public gallery (IMPL-0018, PROPOSTA): `url` is a path on the API. */
export interface GalleryPhoto {
  id: string;
  url: string;
  caption: string;
  position: number;
}

/**
 * The public gallery of a published NGO (`GET /ngos/:id`): empty while the API has photos off, null when the
 * profile cannot be read. The game reads it only for an administrator in moderation mode (IMPL-0021).
 */
export const fetchGallery = async (ngoId: string): Promise<GalleryPhoto[] | null> => {
  const profile = await getJson<{ ngo?: { photos?: GalleryPhoto[] } }>(`/ngos/${ngoId}`);
  return profile?.ngo ? (profile.ngo.photos ?? []) : null;
};

/**
 * A public image of a published NGO: its logo (`LotInfo.ngo_logo`) or a gallery photo (`GalleryPhoto.url`).
 * Fetched instead of pointed at by an `<img>`: the game's CSP lets images come only from the game itself,
 * `data:` and `blob:`, while the API is in `connect-src`.
 */
export async function fetchLogo(path: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${SERVICES.api}${path}`);
    return res.ok && res.headers.get("content-type")?.startsWith("image/") ? await res.blob() : null;
  } catch {
    return null;
  }
}
