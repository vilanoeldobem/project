/** Client for the HTTP API Worker (docs/reference/api.md). Public reads resolve to `null`; writes throw `ApiError`. */
import { ApiError } from "@vila/shared/accounts/errors";
import type { DonationStatus, DonationTargetKind, NgoPaymentMethod, TitleProgress } from "@vila/shared/donations/contract";

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
  /** The published NGO on this lot (absent from an older API). */
  ngo_id?: string | null;
  ngo_name: string | null;
  ngo_summary: string | null;
  /** Path on the API of the public logo of a published NGO (IMPL-0017); absent from an older API. */
  ngo_logo?: string | null;
}

async function getJson<T>(path: string, credentials: RequestCredentials = "omit"): Promise<T | null> {
  try {
    const res = await fetch(`${SERVICES.api}${path}`, { headers: { Accept: "application/json" }, credentials });
    if (!res.ok || !res.headers.get("content-type")?.includes("json")) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

/**
 * One write to the API (`credentials: "include"` attaches the session cookie, so a signed-in donor's Pix can
 * credit the Título). A failed or unanswered call becomes `ApiError`, whose `code` maps to pt-BR copy.
 */
async function postJson<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${SERVICES.api}${path}`, {
      method: "POST",
      credentials: "include",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string> };
    throw new ApiError(res.status, data.error ?? "unknown", data.fields);
  }
  return (await res.json().catch(() => ({}))) as T;
}

export const fetchIndicators = () => getJson<{ updatedAt: string; indicators: Indicator[] }>("/indicators");
export const fetchLots = () => getJson<{ lots: LotInfo[] }>("/lots");

/**
 * The public logo of a published NGO (`LotInfo.ngo_logo`). Fetched instead of pointed at by an `<img>`: the
 * game's CSP lets images come only from the game itself, `data:` and `blob:`, while the API is in `connect-src`.
 */
export async function fetchLogo(path: string): Promise<Blob | null> {
  try {
    const res = await fetch(`${SERVICES.api}${path}`);
    return res.ok && res.headers.get("content-type")?.startsWith("image/") ? await res.blob() : null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ donations (IMPL-0021, PROPOSTA) */

export interface DonationConfig {
  global: {
    enabled: boolean;
    recipientName: string | null;
    ngoPercentBps: number;
    fixedFeeCents: number;
    minAmountCents: number;
  };
}

export interface Donation {
  id: string;
  targetKind: DonationTargetKind;
  ngoId: string | null;
  recipientName: string;
  amountCents: number;
  ngoShareCents: number;
  vilaShareCents: number;
  ngoPercentBps: number;
  fixedFeeCents: number;
  status: DonationStatus;
  brCode: string | null;
  brCodeBase64: string | null;
  receiptUrl: string | null;
  expiresAt: string | null;
  devMode: boolean;
  titleCredited: boolean;
}

export interface NgoDonationInfo {
  ngoId: string;
  name: string;
  method: NgoPaymentMethod;
  enabled: boolean;
  ngoPercentBps: number;
  fixedFeeCents: number;
  minAmountCents: number;
  confirmedDonations: number;
  confirmedAmountCents: number;
}

export interface MyTitle {
  title: TitleProgress;
  donations: Array<Pick<Donation, "id" | "targetKind" | "recipientName" | "amountCents" | "status" | "titleCredited"> & { createdAt: string }>;
}

export const fetchGlobalDonationConfig = () => getJson<DonationConfig>("/donations/config");
export const fetchNgoDonationInfo = (ngoId: string) => getJson<NgoDonationInfo>(`/ngos/${encodeURIComponent(ngoId)}/donation-info`);
export const createPixDonation = (body: { targetKind: DonationTargetKind; ngoId?: string; amountCents: number }) =>
  postJson<{ donation: Donation }>("/donations/pix", body);
export const fetchDonationStatus = (id: string, refresh = false) => getJson<{ donation: Donation }>(`/donations/${encodeURIComponent(id)}${refresh ? "?refresh=1" : ""}`, "include");
export const simulatePixDonation = (id: string) => postJson<{ donation: Donation }>(`/donations/${encodeURIComponent(id)}/simulate`, {});
export const recordDonationRedirect = (ngoId: string) => postJson<{ url: string; tracked: boolean; titleCredit: "none" }>("/donations/redirect", { ngoId });
export const fetchMyTitle = () => getJson<MyTitle>("/donations/my-title", "include");
