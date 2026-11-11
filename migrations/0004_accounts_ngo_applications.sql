-- 0004: accounts (P13), magic-link login (OQ-03), sessions, server-side mission events (P14, DEC-042)
-- and the NGO application fields (P12, DEC-015, DEC-037). IMPL-0011. Field rules beyond the four CONFIRMADO
-- registration fields (DEC-038) are PROPOSTA.
--
-- Personal data kept to the minimum: Nome, Nickname, Cidade, E-mail. Only the nickname is ever public.
-- Login tokens and sessions are stored as SHA-256 hashes, never in clear.

CREATE TABLE users (
  id            TEXT PRIMARY KEY,                       -- UUID
  name          TEXT NOT NULL,
  nickname      TEXT NOT NULL,                          -- as typed (public)
  nickname_key  TEXT NOT NULL UNIQUE,                   -- lower-case, for uniqueness
  city          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,                   -- lower-case; never public, never logged
  role          TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  verified_at   TEXT,                                   -- set by the first successful login link
  created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE login_tokens (
  token_hash  TEXT PRIMARY KEY,                         -- SHA-256 (hex) of the link token
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_login_tokens_user ON login_tokens(user_id, created_at);

CREATE TABLE sessions (
  token_hash  TEXT PRIMARY KEY,                         -- SHA-256 (hex) of the cookie value
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

-- Idempotent mission events: the primary key makes a repeated event a no-op (DEC-042).
CREATE TABLE progress_events (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mission_id  TEXT NOT NULL,
  event_id    TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  PRIMARY KEY (user_id, mission_id, event_id)
);

-- NGO application (P12, four steps). Organisation data, not personal data; the applicant link is cleared
-- if the account is deleted, the application and its audit trail stay.
ALTER TABLE ngos ADD COLUMN applicant_id TEXT REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE ngos ADD COLUMN city TEXT;
ALTER TABLE ngos ADD COLUMN description TEXT;
ALTER TABLE ngos ADD COLUMN funds_confirmation TEXT;     -- how the funds can be confirmed (DEC-015, criterion 3)
ALTER TABLE ngos ADD COLUMN declarations TEXT;           -- JSON: the three DEC-015 criteria declared by the applicant
ALTER TABLE ngos ADD COLUMN tags TEXT;                   -- JSON array of action tag ids (DEC-028)
ALTER TABLE ngos ADD COLUMN projects TEXT;               -- JSON array of {title, description} (DEC-028)
ALTER TABLE ngos ADD COLUMN requested_lot_id TEXT REFERENCES lots(id);
ALTER TABLE ngos ADD COLUMN review_note TEXT;            -- admin message to the applicant (changes / rejection)
CREATE INDEX idx_ngos_applicant ON ngos(applicant_id);
