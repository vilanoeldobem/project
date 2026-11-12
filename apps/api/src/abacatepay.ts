/**
 * AbacatePay v2 client (IMPL-0021; PROPOSTA, dark behind DONATIONS_ENABLED). Web Crypto and `fetch` only: no
 * dependency, nothing to audit beyond this file.
 *
 *   POST /sub-accounts/create  → the NGO's (or the primary institution's) `sacc_…` sub-account
 *   POST /transparents/create  → a Pix charge, with the split that pays the sub-account
 *   GET  /transparents/check   → the charge as the provider has it (status, receipt, platform fee)
 *   POST /transparents/simulate-payment → sandbox only (`abc_dev_…` keys)
 *
 * Webhooks carry the provider's public key signature (`X-Webhook-Signature`, HMAC-SHA256 of the raw body) and
 * the secret configured in the AbacatePay dashboard (`X-Webhook-Secret` or `?webhookSecret=`). Both are checked
 * in constant time. Never log the API key, the secret, a CNPJ or payer data.
 *
 * `dev_sacc_…` is a local sandbox marker: when the sandbox account does not have sub-accounts enabled yet,
 * `createOrGetSubAccount` returns it (non-production only) and `createPixCharge` omits `splits`, so the QR Code,
 * payment simulation and webhook flow work end to end before AbacatePay enables the feature on that account.
 */
import { HttpError } from "./http";
import type { Env } from "./api";

/** AbacatePay's public webhook key (used to sign the HMAC; it is public, not a secret). */
export const ABACATEPAY_PUBLIC_KEY =
  "t9dXRhHHo3yDEj5pVDYz0frf7q6bMKyMRmxxCPIPp3RCplBfXRxqlC6ZpiWmOqj4L63qEaeUOtrCI8P0VMUgo6iIga2ri9ogaHFs0WIIywSMg0q7RmBfybe1E5XJcfC4IW3alNqym0tXoAKkzvfEjZxV6bE0oG2zJrNNYmUCKZyV0KZ3JS8Votf9EAWWYdiDkMkpbMdPggfh1EqHlVkMiTady6jOR3hyzGEHrIz2Ret0xHKMbiqkr9HS1JhNHDX9";

const encoder = new TextEncoder();

function base64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

/** Same string, same answer, without letting elapsed time reveal how much of a secret matched. */
export async function constantTimeEqual(a: string, b: string): Promise<boolean> {
  if (a.length !== b.length) return false;
  const [left, right] = await Promise.all([crypto.subtle.digest("SHA-256", encoder.encode(a)), crypto.subtle.digest("SHA-256", encoder.encode(b))]);
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/** `X-Webhook-Signature` = base64(HMAC-SHA256(raw body, public key)). */
export async function verifyAbacateSignature(rawBody: Uint8Array, signatureHeader: string): Promise<boolean> {
  if (!signatureHeader) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(ABACATEPAY_PUBLIC_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, rawBody));
  return constantTimeEqual(base64(mac), signatureHeader.trim());
}

/**
 * True only when the request carries the configured secret and a signature that matches its exact bytes.
 * The raw body must be read before parsing: a re-serialised JSON changes the bytes and never matches.
 */
export async function verifyAbacateWebhook(request: Request, rawBody: Uint8Array, expectedSecret: string): Promise<boolean> {
  if (!expectedSecret || expectedSecret.length < 32) throw new HttpError(503, "payment_provider_unavailable");
  const receivedSecret = request.headers.get("X-Webhook-Secret") ?? new URL(request.url).searchParams.get("webhookSecret") ?? "";
  const signature = request.headers.get("X-Webhook-Signature") ?? "";
  const [secretOk, signatureOk] = await Promise.all([constantTimeEqual(receivedSecret, expectedSecret), verifyAbacateSignature(rawBody, signature)]);
  if (!secretOk || !signatureOk) throw new HttpError(401, "invalid_webhook_signature");
  return true;
}

/** A provider refusal, kept internal: its text may carry account details and never reaches a response. */
class ProviderError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string
  ) {
    super("payment_provider_unavailable");
  }
}

const providerUnavailable = (error: unknown): never => {
  if (error instanceof ProviderError) throw new HttpError(503, "payment_provider_unavailable");
  throw error;
};

/**
 * The sandbox account used during IMPL-0021 answers `Insufficient permissions` to `/sub-accounts/create` until
 * AbacatePay enables subcontas on it; the same refusal reaches production as `subaccounts_unavailable`.
 */
const subAccountsUnavailable = (error: unknown): boolean =>
  error instanceof ProviderError && /fun[çc][ãa]o\s+n[ãa]o\s+habilitada|subconta|split|permission|insufficient|n[ãa]o\s+habilitad|not\s+enabled/i.test(error.detail);

/** One JSON call to the provider, with the API key. Throws `ProviderError` on a refusal or a missing answer. */
async function callProvider(env: Env, method: "GET" | "POST", path: string, body?: unknown): Promise<Record<string, unknown>> {
  const apiKey = env.ABACATEPAY_API_KEY;
  if (!apiKey) throw new ProviderError(0, "missing_api_key");
  const base = (env.ABACATEPAY_BASE_URL ?? "https://api.abacatepay.com/v2").replace(/\/+$/, "");
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ProviderError(0, "network");
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    // A non-JSON answer is a provider failure like any other.
  }
  const envelope = (payload && typeof payload === "object" ? payload : {}) as { data?: unknown; error?: unknown; message?: unknown };
  const failure = envelope.error ?? envelope.message;
  let detail = "";
  if (typeof failure === "string") detail = failure;
  else if (failure && typeof failure === "object" && "message" in failure && typeof failure.message === "string") detail = failure.message;
  if (!response.ok || (failure !== null && failure !== undefined && failure !== "" && failure !== false))
    throw new ProviderError(response.status, detail || `http_${response.status}`);
  return (envelope.data && typeof envelope.data === "object" ? envelope.data : {}) as Record<string, unknown>;
}

export interface PixCharge {
  id: string;
  status: string;
  amountCents: number | null;
  brCode: string | null;
  brCodeBase64: string | null;
  receiptUrl: string | null;
  platformFeeCents: number | null;
  devMode: boolean;
  expiresAt: string | null;
}

const text = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const cents = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);

function chargeView(data: Record<string, unknown>): PixCharge {
  const id = text(data.id);
  if (!id) throw new HttpError(502, "payment_provider_unavailable");
  return {
    id,
    status: (text(data.status) ?? "PENDING").toUpperCase(),
    amountCents: cents(data.amount),
    brCode: text(data.brCode) ?? text(data.brcode),
    brCodeBase64: text(data.brCodeBase64) ?? text(data.brcodeBase64),
    receiptUrl: text(data.receiptUrl),
    platformFeeCents: cents(data.platformFee),
    devMode: data.devMode === true,
    expiresAt: text(data.expiresAt),
  };
}

/**
 * The NGO's sub-account, created from its CNPJ. AbacatePay answers the existing sub-account for the same CNPJ,
 * so calling this again is safe. On a non-production sandbox without the feature enabled, returns the local
 * `dev_sacc_<cnpj>` marker instead of failing the whole configuration screen.
 */
export async function createOrGetSubAccount(env: Env, input: { name: string; taxId: string; externalId: string }): Promise<{ id: string; devMode: boolean }> {
  try {
    const data = await callProvider(env, "POST", "/sub-accounts/create", { name: input.name, taxId: input.taxId, externalId: input.externalId });
    const id = text(data.id);
    if (!id || !/^(?:dev_)?sacc_[A-Za-z0-9_]+$/.test(id)) throw new ProviderError(502, "invalid_sub_account_id");
    return { id, devMode: data.devMode === true };
  } catch (error) {
    if (subAccountsUnavailable(error) && env.ENVIRONMENT !== "production") return { id: `dev_sacc_${input.taxId}`, devMode: true };
    if (subAccountsUnavailable(error)) throw new HttpError(409, "subaccounts_unavailable");
    return providerUnavailable(error);
  }
}

/** A Pix charge with the split that pays `subAccountId`; the local sandbox marker sends no `splits`. */
export async function createPixCharge(
  env: Env,
  input: { amountCents: number; description: string; externalId: string; subAccountId: string; ngoShareCents: number; metadata: Record<string, string> }
): Promise<PixCharge> {
  const data: Record<string, unknown> = {
    amount: input.amountCents,
    expiresIn: 3600,
    description: input.description.slice(0, 160),
    externalId: input.externalId,
    metadata: input.metadata,
  };
  if (!input.subAccountId.startsWith("dev_sacc_")) data.splits = [{ subAccountId: input.subAccountId, amount: input.ngoShareCents }];
  try {
    return chargeView(await callProvider(env, "POST", "/transparents/create", { method: "PIX", data }));
  } catch (error) {
    return providerUnavailable(error);
  }
}

export async function checkPixCharge(env: Env, chargeId: string): Promise<PixCharge> {
  try {
    return chargeView(await callProvider(env, "GET", `/transparents/check?id=${encodeURIComponent(chargeId)}`));
  } catch (error) {
    return providerUnavailable(error);
  }
}

/** Sandbox only: marks the charge as paid so the webhook/refresh path can be exercised end to end. */
export async function simulatePixPayment(env: Env, chargeId: string): Promise<PixCharge> {
  try {
    return chargeView(await callProvider(env, "POST", `/transparents/simulate-payment?id=${encodeURIComponent(chargeId)}`));
  } catch (error) {
    return providerUnavailable(error);
  }
}
