import { describe, expect, it } from "vitest";

import { ApiError } from "@vila/shared/accounts/errors";

import { afterFailure, keyFor } from "./donation-key";

let counter = 0;
const next = () => `key-${++counter}`;

describe("the idempotency key of a Pix donation request (IMPL-0028)", () => {
  it("keeps one key per request and starts a new one for another amount or target", () => {
    const first = keyFor(null, "global::500", next);
    expect(keyFor(first, "global::500", next)).toBe(first);
    expect(keyFor(first, "global::600", next).key).not.toBe(first.key);
  });

  it("keeps the key while the same request may still resume", () => {
    const current = keyFor(null, "global::500", next);
    for (const error of [new ApiError(0, "network"), new ApiError(409, "donation_in_progress"), new ApiError(503, "donation_not_confirmed"), new Error("x")])
      expect(afterFailure(current, error)).toBe(current);
  });

  it("drops the key after an answer that ends the request, so the next attempt is a new request", () => {
    const current = keyFor(null, "global::500", next);
    for (const code of ["idempotency_key_reused", "donation_intent_unknown", "donation_intent_failed", "payment_provider_unavailable"]) {
      expect(afterFailure(current, new ApiError(409, code))).toBeNull();
      expect(keyFor(afterFailure(current, new ApiError(409, code)), "global::500", next).key).not.toBe(current.key);
    }
  });
});
