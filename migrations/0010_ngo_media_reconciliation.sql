-- IMPL-0021: reconcile photos with the canonical NGO_FILES pipeline from PR32.
-- 0006_ngo_files stays immutable. 0007–0009 belong to separate unmerged work.
ALTER TABLE ngos ADD COLUMN file_write_token TEXT;
ALTER TABLE users ADD COLUMN files_deleting INTEGER NOT NULL DEFAULT 0 CHECK(files_deleting IN (0,1));

-- PROPOSTA: immutable photos, private R2 bytes, explicit admin approval (D09 / DEC-037).
CREATE TABLE ngo_photos (
  id TEXT PRIMARY KEY,
  ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png')),
  byte_size INTEGER NOT NULL CHECK(byte_size > 0 AND byte_size <= 2097152),
  caption TEXT NOT NULL CHECK(length(caption) <= 240),
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 9),
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected','removed')),
  revision INTEGER NOT NULL DEFAULT 1 CHECK(revision > 0),
  decision_token TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_ngo_photos_public ON ngo_photos(ngo_id,status,position,id);
