-- PROPOSTA: private application evidence; independent of progress migration 0007 (IMPL-0019).
ALTER TABLE ngos ADD COLUMN document_write_token TEXT;

CREATE TABLE ngo_documents (
  id TEXT PRIMARY KEY,
  ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL CHECK(length(label) BETWEEN 1 AND 120),
  content_type TEXT NOT NULL CHECK(content_type IN ('application/pdf','image/png','image/jpeg')),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 2097152),
  added_revision INTEGER NOT NULL CHECK(added_revision > 0),
  removed_revision INTEGER CHECK(removed_revision > added_revision),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_ngo_documents_active ON ngo_documents(ngo_id,removed_revision,created_at,id);
