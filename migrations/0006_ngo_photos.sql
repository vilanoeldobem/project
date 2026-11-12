-- PROPOSTA: immutable photos, private R2 bytes, explicit admin approval (D09 / DEC-037).
CREATE TABLE ngo_photos (
  id TEXT PRIMARY KEY,
  ngo_id TEXT NOT NULL REFERENCES ngos(id) ON DELETE CASCADE,
  object_key TEXT NOT NULL UNIQUE,
  content_type TEXT NOT NULL CHECK(content_type IN ('image/jpeg','image/png','image/webp')),
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
