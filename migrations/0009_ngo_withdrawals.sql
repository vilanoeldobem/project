-- 0009_ngo_withdrawals: ledger of administrative withdrawals of published NGOs (IMPL-0020).
-- PROPOSTA: dark behind NGO_WITHDRAWAL_ENABLED ("false" in production and staging). What a withdrawal means for
-- the account, the CNPJ, re-entry and retention is an open product question (OQ-14); this table settles none of it.
-- Additive: no table rebuild, no cascading deletion, no change to existing statuses. The NGO row keeps
-- status = 'published'; this row marks it as withdrawn for the signed-in and admin routes. Public routes never
-- read this table: a withdrawal releases the lot, and every public projection requires the published lot.
CREATE TABLE ngo_withdrawals (
  ngo_id          TEXT PRIMARY KEY REFERENCES ngos(id),   -- one withdrawal per NGO; there is no undo route
  operation_token TEXT NOT NULL UNIQUE,                   -- guards the batch: only the winning request writes
  reason          TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 1000), -- message to the organisation, shown to the applicant as written
  actor           TEXT NOT NULL,                          -- admin id (never an e-mail); no FK, like audit_events
  withdrawn_at    TEXT NOT NULL,
  revision        INTEGER NOT NULL CHECK (revision > 1),  -- the NGO's revision right after the withdrawal
  lot_ids         TEXT NOT NULL                           -- JSON array of the lots released
);
