-- Serializes each account's progress writes across Worker isolates (IMPL-0018).
-- Independent of 0006_ngo_photos.sql: only requires users/progress_events from 0004.
CREATE TABLE progress_writes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  write_token TEXT
);
