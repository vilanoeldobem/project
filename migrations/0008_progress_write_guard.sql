-- Serializes each account's progress writes across Worker isolates (IMPL-0019).
-- Follows the canonical file and gallery migrations (0006, 0007).
CREATE TABLE progress_writes (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  revision INTEGER NOT NULL DEFAULT 0 CHECK(revision >= 0),
  write_token TEXT
);
