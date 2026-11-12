-- IMPL-0020: retain the approval and evidence while removing an NGO from public circulation.
-- Additive migration: no table rebuild, cascading deletion or changes to existing statuses.
CREATE TABLE ngo_withdrawals (
  ngo_id          TEXT PRIMARY KEY REFERENCES ngos(id),
  operation_token TEXT NOT NULL UNIQUE,
  reason          TEXT NOT NULL CHECK (length(reason) BETWEEN 10 AND 1000),
  actor           TEXT NOT NULL,
  withdrawn_at    TEXT NOT NULL,
  revision        INTEGER NOT NULL CHECK (revision > 1),
  lot_ids         TEXT NOT NULL
);
