-- 0010_donations_abacatepay: donations and payment reconciliation with AbacatePay v2 (IMPL-0021).
-- PROPOSTA: dark behind DONATIONS_ENABLED ("false" in production and staging) until the partner contract and the
-- payment rules exist (PEN-004, PEN-006; Título: PEN-026). Additive only: no table is rebuilt and no existing
-- column changes, so the public routes that require migration 0003 keep working untouched.
--
-- Money is stored in integer cents. The split is the one sent to the provider (NGO sub-account share + what the
-- Vila retains); a donation counts in the public indicators and in the donor's Título only while status = 'paid'.

-- The single global donation: the Vila's partner institution and the default split. One row, id 'global'.
CREATE TABLE donation_settings (
  id                   TEXT PRIMARY KEY CHECK (id = 'global'),
  primary_ngo_name     TEXT,                                  -- public name shown before any payment
  primary_ngo_cnpj     TEXT,                                  -- digits only; never public, never in an audit row
  primary_sub_account_id TEXT,                                -- sacc_… (or dev_sacc_… on a sandbox)
  ngo_percent_bps      INTEGER NOT NULL DEFAULT 9500 CHECK (ngo_percent_bps BETWEEN 100 AND 10000),
  fixed_fee_cents      INTEGER NOT NULL DEFAULT 80 CHECK (fixed_fee_cents BETWEEN 80 AND 190),
  updated_by           TEXT,                                  -- admin id, like audit_events: no FK
  updated_at           TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- One row per NGO (created when the application is sent while donations are on): the requested mode/URL and,
-- once the administration confirms it, the sub-account or the validated external link.
CREATE TABLE ngo_payment_configs (
  ngo_id          TEXT PRIMARY KEY REFERENCES ngos(id) ON DELETE CASCADE,
  payment_method  TEXT NOT NULL DEFAULT 'abacatepay' CHECK (payment_method IN ('abacatepay','external_link')),
  donation_url    TEXT,                                       -- only for external_link; HTTPS, public host
  sub_account_id  TEXT,                                       -- sacc_… / dev_sacc_… for abacatepay
  ngo_percent_bps INTEGER NOT NULL DEFAULT 9500 CHECK (ngo_percent_bps BETWEEN 100 AND 10000),
  fixed_fee_cents INTEGER NOT NULL DEFAULT 80 CHECK (fixed_fee_cents BETWEEN 80 AND 190),
  link_validated  INTEGER NOT NULL DEFAULT 0 CHECK (link_validated IN (0,1)),
  updated_by      TEXT,
  updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

-- Pix charges (provider = 'abacatepay') and externally verified donations (provider = 'external_proof').
-- `user_id` is the signed-in donor, or NULL for a visitor; only a signed-in donor can credit a Título.
CREATE TABLE donations (
  id                  TEXT PRIMARY KEY,                       -- UUID
  target_kind         TEXT NOT NULL CHECK (target_kind IN ('global','ngo')),
  ngo_id              TEXT REFERENCES ngos(id) ON DELETE SET NULL, -- NULL for global; the NGO for ngo
  recipient_name      TEXT NOT NULL,                          -- public name shown on the donation
  user_id             TEXT REFERENCES users(id) ON DELETE SET NULL,
  provider            TEXT NOT NULL CHECK (provider IN ('abacatepay','external_proof')),
  provider_charge_id  TEXT UNIQUE,                            -- pix_char_… or ext_… (verified proof reference)
  sub_account_id      TEXT,                                   -- sacc_… used in the split
  amount_cents        INTEGER NOT NULL CHECK (amount_cents >= 200),
  ngo_share_cents     INTEGER NOT NULL CHECK (ngo_share_cents >= 1),
  vila_share_cents    INTEGER NOT NULL CHECK (vila_share_cents >= 0),
  platform_fee_cents  INTEGER,                                -- as reported by the provider, when it does
  ngo_percent_bps     INTEGER NOT NULL,
  fixed_fee_cents     INTEGER NOT NULL,                       -- 0 for an external proof (no split happened)
  status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','refunded','under_dispute','expired','cancelled')),
  br_code             TEXT,                                   -- Pix copy-and-paste payload
  br_code_base64      TEXT,                                   -- QR Code image (data: URI)
  receipt_url         TEXT,
  expires_at          TEXT,
  dev_mode            INTEGER NOT NULL DEFAULT 0,             -- 1: sandbox charge (simulation allowed)
  -- 1 while this donation counts for the donor's Título; back to 0 on refund or lost dispute. External proofs
  -- stay 0: the Título rule for an NGO's own payment page is still pending (PEN-026).
  title_credited      INTEGER NOT NULL DEFAULT 0 CHECK (title_credited IN (0,1)),
  proof_note          TEXT,                                   -- admin's reference for an external proof
  paid_at             TEXT,
  refunded_at         TEXT,
  created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_donations_ngo_status ON donations(ngo_id, status);
CREATE INDEX idx_donations_user_title ON donations(user_id, title_credited);
CREATE INDEX idx_donations_status ON donations(status, created_at DESC);

-- Click on an NGO's own payment page. It is a redirect record, never a donation and never a Título credit.
CREATE TABLE donation_redirects (
  id         TEXT PRIMARY KEY,
  ngo_id     TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  target_url TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_donation_redirects_ngo ON donation_redirects(ngo_id, created_at DESC);

-- Webhook deduplication: the provider's event id (`log_…`) is inserted first; a replay changes nothing.
CREATE TABLE abacatepay_webhook_events (
  id           TEXT PRIMARY KEY,
  event        TEXT NOT NULL,
  charge_id    TEXT,
  processed_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
