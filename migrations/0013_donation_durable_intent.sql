-- 0013_donation_durable_intent: durable creation intent for Pix donations and webhook events that arrive before
-- their donation (IMPL-0028). PROPOSTA, like everything about donations: dark behind DONATIONS_ENABLED ("false" in
-- production and staging). Additive only: two new tables, no existing table or column changes, so the public
-- routes that require migration 0003 keep working untouched and 0011 stays exactly as applied.

-- One row per logical donation request, written BEFORE the provider is called. `idempotency_key` is the UUID the
-- client sends with `POST /donations/pix`: a retry with the same key reaches the same row and never calls the
-- provider twice while the row is in flight or created. `id` is also the donation id and the provider's
-- `externalId`. A provider failure or timeout leaves the row in 'unknown' (never deleted) so a retry with the same
-- key, or an operator, can finish it.
CREATE TABLE donation_intents (
  id                 TEXT PRIMARY KEY,                       -- UUID; = donations.id once created
  idempotency_key    TEXT NOT NULL UNIQUE,                   -- client-supplied UUID
  request_hash       TEXT NOT NULL,                          -- SHA-256 of (targetKind, ngoId, amountCents, account)
  target_kind        TEXT NOT NULL CHECK (target_kind IN ('global','ngo')),
  ngo_id             TEXT REFERENCES ngos(id) ON DELETE SET NULL,
  recipient_name     TEXT NOT NULL,
  user_id            TEXT REFERENCES users(id) ON DELETE SET NULL,
  sub_account_id     TEXT NOT NULL,
  amount_cents       INTEGER NOT NULL CHECK (amount_cents >= 200),
  ngo_share_cents    INTEGER NOT NULL CHECK (ngo_share_cents >= 1),
  vila_share_cents   INTEGER NOT NULL CHECK (vila_share_cents >= 0),
  ngo_percent_bps    INTEGER NOT NULL,
  fixed_fee_cents    INTEGER NOT NULL,
  -- pending_provider: the provider call is in flight (or the worker died during it; stale after a short while)
  -- created: the provider answered and the donation row exists
  -- unknown: the outcome is not known (timeout, provider error, or the provider answered and D1 failed)
  -- failed: the provider refused before creating anything (nothing to pay)
  state              TEXT NOT NULL DEFAULT 'pending_provider' CHECK (state IN ('pending_provider','created','unknown','failed')),
  attempts           INTEGER NOT NULL DEFAULT 1 CHECK (attempts >= 1),
  last_error         TEXT,                                   -- stable error code only; never provider text
  -- What the provider answered, kept only while the donation row could not be written ('unknown' with a charge),
  -- so a retry finishes the donation without a second provider call. Cleared once the donation exists.
  provider_charge_id TEXT UNIQUE,
  provider_status    TEXT,
  br_code            TEXT,
  br_code_base64     TEXT,
  receipt_url        TEXT,
  expires_at         TEXT,
  platform_fee_cents INTEGER,
  dev_mode           INTEGER NOT NULL DEFAULT 0 CHECK (dev_mode IN (0,1)),
  created_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_donation_intents_state ON donation_intents(state, updated_at);

-- A signed webhook event about a charge that has no donation row yet. It is NOT in abacatepay_webhook_events
-- (that table means "processed"): it waits here and is applied, in arrival order, as soon as the donation for
-- that charge exists. A redelivery of the same event id changes nothing. `resolved_at` keeps the trail.
CREATE TABLE abacatepay_pending_events (
  id                 TEXT PRIMARY KEY,                       -- provider event id (log_…)
  event              TEXT NOT NULL,
  charge_id          TEXT NOT NULL,
  next_status        TEXT NOT NULL CHECK (next_status IN ('paid','refunded','under_dispute')),
  provider_status    TEXT NOT NULL,
  receipt_url        TEXT,
  platform_fee_cents INTEGER,
  dev_mode           INTEGER NOT NULL DEFAULT 0 CHECK (dev_mode IN (0,1)),
  received_at        TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  resolved_at        TEXT
);
CREATE INDEX idx_abacatepay_pending_events_charge ON abacatepay_pending_events(charge_id, resolved_at);
