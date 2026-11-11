-- IMPL-0013: private application ownership; lot requested, not reserved before approval (proposal).
CREATE TABLE ngo_applications (
  id TEXT PRIMARY KEY,
  ngo_id TEXT NOT NULL UNIQUE REFERENCES ngos(id),
  owner_id TEXT NOT NULL REFERENCES auth_users(id),
  requested_lot_id TEXT NOT NULL REFERENCES lots(id),
  feedback TEXT NOT NULL DEFAULT '',
  mutation_id TEXT
);
CREATE INDEX idx_ngo_applications_owner ON ngo_applications(owner_id);
