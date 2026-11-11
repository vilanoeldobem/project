-- IMPL-0011: accounts exist only after email verification. Times are Unix seconds.
CREATE TABLE auth_users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  name TEXT NOT NULL,
  nickname TEXT NOT NULL COLLATE NOCASE UNIQUE,
  city TEXT NOT NULL,
  verified_at INTEGER NOT NULL
);

CREATE TABLE auth_links (
  token_hash TEXT PRIMARY KEY,
  browser_hash TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  nickname TEXT,
  city TEXT,
  expires_at INTEGER NOT NULL,
  CHECK ((name IS NULL AND nickname IS NULL AND city IS NULL) OR
         (name IS NOT NULL AND nickname IS NOT NULL AND city IS NOT NULL))
);
CREATE INDEX idx_auth_links_expiry ON auth_links(expires_at);

CREATE TABLE auth_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_sessions_expiry ON auth_sessions(expires_at);

CREATE TABLE auth_rate_limits (
  key TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_auth_rate_expiry ON auth_rate_limits(expires_at);

-- Only the loopback development adapter writes here. Never expose over HTTP.
-- Raw links are deliberately local test fixtures, removed on consumption/expiry.
CREATE TABLE auth_local_outbox (
  token_hash TEXT PRIMARY KEY REFERENCES auth_links(token_hash) ON DELETE CASCADE,
  recipient TEXT NOT NULL,
  link TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
