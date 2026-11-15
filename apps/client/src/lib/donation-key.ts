/**
 * The idempotency key of a Pix donation request (IMPL-0028). One UUID per request: trying again after an error that
 * may still resume the same request (no answer, `donation_in_progress`, `donation_not_confirmed`) reuses it; an
 * answer that ends the request — a donation, or an error after which the API will never call the provider for this
 * key — drops it, so the next attempt is a new request with a new key.
 */
import { ApiError } from "@vila/shared/accounts/errors";

/** Errors that end the request for good: the same key would only get the same refusal back. */
const ENDS_REQUEST = new Set(["idempotency_key_reused", "donation_intent_unknown", "donation_intent_failed", "payment_provider_unavailable"]);

export interface DonationKey {
  request: string;
  key: string;
}

/** The key for this request: the current one when the request is the same, a new one otherwise. */
export function keyFor(current: DonationKey | null, request: string, newKey: () => string = () => crypto.randomUUID()): DonationKey {
  return current?.request === request ? current : { request, key: newKey() };
}

/** What to keep after a failed attempt: the same key while the request may still resume, nothing otherwise. */
export function afterFailure(current: DonationKey | null, error: unknown): DonationKey | null {
  return error instanceof ApiError && ENDS_REQUEST.has(error.code) ? null : current;
}
