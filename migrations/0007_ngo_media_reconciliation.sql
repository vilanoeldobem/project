-- IMPL-0018: reconcile photos with the canonical NGO_FILES pipeline from PR32.
-- 0006_ngo_files stays immutable; this migration follows the canonical file pipeline.
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
  upload_pending INTEGER NOT NULL DEFAULT 0 CHECK(upload_pending IN (0,1)),
  cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_pending IN (0,1)),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_ngo_photos_public ON ngo_photos(ngo_id,status,position,id);

-- No duplicate file metadata: the key is derived from ngo_id/id, never a filename.
-- The ledger outlives a failed R2 write/delete and is erased only after confirmed cleanup or publication.
CREATE TABLE media_upload_intents (
  id TEXT PRIMARY KEY,
  ngo_id TEXT NOT NULL REFERENCES ngos(id),
  uploaded_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  cleanup_pending INTEGER NOT NULL DEFAULT 0 CHECK(cleanup_pending IN (0,1))
);
CREATE INDEX idx_media_upload_intents_ngo ON media_upload_intents(ngo_id,cleanup_pending,created_at);
