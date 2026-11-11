-- IMPL-0012: canonical per-account progress with optimistic concurrency.
CREATE TABLE player_progress (
  user_id TEXT PRIMARY KEY REFERENCES auth_users(id) ON DELETE CASCADE,
  state_json TEXT NOT NULL CHECK (json_valid(state_json)),
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
  guest_imported_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
