-- 0006_ngo_files: metadata of the files of an NGO application (IMPL-0017). The bytes live in the private R2
-- bucket under the key `ngo/<ngo_id>/<id>`; D1 keeps what the API needs to authorise, list and serve them.
-- No file name is stored: the original name may carry personal data.
-- PROPOSTA: kinds and limits (PEN-019 still decides which documents an NGO must send).

CREATE TABLE ngo_files (
  id           TEXT PRIMARY KEY,                                   -- UUID
  ngo_id       TEXT NOT NULL REFERENCES ngos(id),                  -- an NGO cannot be deleted while it has files
  kind         TEXT NOT NULL CHECK (kind IN ('logo', 'document')),
  content_type TEXT NOT NULL CHECK (content_type IN ('image/png', 'image/jpeg', 'application/pdf')),
  size         INTEGER NOT NULL CHECK (size > 0),                  -- bytes stored (after metadata removal)
  uploaded_by  TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE INDEX idx_ngo_files_ngo ON ngo_files(ngo_id, kind, created_at);
-- One logo per NGO: replacing it deletes the old row in the same transaction.
CREATE UNIQUE INDEX idx_ngo_files_one_logo ON ngo_files(ngo_id) WHERE kind = 'logo';
