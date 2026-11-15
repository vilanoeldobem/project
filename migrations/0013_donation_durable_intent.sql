-- 0013_donation_durable_intent: durable creation intent for Pix donations and webhook events that arrive before
-- their donation (IMPL-0028). PROPOSTA, like everything about donations: dark behind DONATIONS_ENABLED ("false" in
-- production and staging). Additive only: two new tables, no existing table or column changes, so the public
-- routes that require migration 0003 keep working untouched and 0011 stays exactly as applied.

-- One row per logical donation request, written BEFORE the provider is called. `idempotency_key` is the UUID the
-- client sends with `POST /donations/pix`: a retry with the same key reaches the same row, and the provider is
-- called at most once per key. `id` is also the donation id and the provider's `externalId`. A provider failure,
-- a timeout or a stale in-flight row ends 'unknown' or 'failed' (never deleted, never sent to the provider again:
-- an operator looks at it and the client starts over with a new key).
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
  -- pending_provider: the provider call is in flight (after 60 s with no answer, the next read turns it 'unknown')
  -- created: the provider answered and the donation row exists
  -- unknown: the outcome is not known (timeout, provider error, stale in flight, or the provider answered and D1
  --          failed: then the answer is copied below and a same-key retry finishes the donation from that copy)
  -- failed: the provider refused before creating anything
  state              TEXT NOT NULL DEFAULT 'pending_provider' CHECK (state IN ('pending_provider','created','unknown','failed')),
  last_error         TEXT,                                   -- stable error code only; never provider text
  -- The charge id ties the intent to its charge and stays once the donation exists.
  provider_charge_id TEXT UNIQUE,
  -- Copy of the provider's answer, written only when the donation row could not be (state 'unknown',
  -- last_error 'store_failed'). When the donation is created, provider_status, br_code, br_code_base64,
  -- receipt_url, expires_at and platform_fee_cents are set back to NULL; dev_mode keeps its value.
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
