-- 0010_account_blocks: administrator role management, account block and presence moderation (IMPL-0021).
-- Additive: two columns on `users`, two new tables; no table rebuild, no change to existing rows or statuses.
--
-- Account block is PROPOSTA: dark behind ACCOUNT_BLOCK_ENABLED ("false" in production and staging). Which
-- sanctions exist, who applies them, appeal, duration and notice are an open product question (OQ-11); this
-- schema settles none of it. Removing a visitor from a room is PROPOSTA too (PRESENCE_MODERATION_ENABLED).
-- Public routes never read anything created here.

-- The session check reads `blocked` on every signed-in request. It mirrors "this account has a block that was
-- not lifted" in `account_blocks`; both change in the same batch.
ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0 CHECK (blocked IN (0,1));
-- Guards the batch of a role change, a block or an unblock: only the winning request writes its audit row.
ALTER TABLE users ADD COLUMN moderation_token TEXT;

-- Ledger of account blocks. The rows of an account are erased with it (the message is text about the person);
-- `audit_events` keeps who blocked which account id and when, without the message.
CREATE TABLE account_blocks (
  id          TEXT PRIMARY KEY,                                         -- UUID
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  message     TEXT NOT NULL CHECK (length(message) BETWEEN 10 AND 1000), -- message to the blocked person, shown to them as written
  blocked_by  TEXT NOT NULL,                                            -- admin id (never an e-mail); no FK, like audit_events
  blocked_at  TEXT NOT NULL,
  lifted_at   TEXT,                                                     -- NULL while the block is in force
  lifted_by   TEXT                                                      -- admin id
);
-- At most one block in force per account.
CREATE UNIQUE INDEX idx_account_blocks_active ON account_blocks(user_id) WHERE lifted_at IS NULL;
CREATE INDEX idx_account_blocks_user ON account_blocks(user_id, blocked_at);

-- Single-use tickets that let an administrator remove one visitor from one room of the realtime server. The
-- ticket is stored as its SHA-256 (hex), like session and link tokens. `target` is the anonymous connection id
-- of the visitor (IMPL-0008): not an account, not personal data. Rows are short-lived (30 seconds) and are
-- swept when tickets are issued.
CREATE TABLE moderation_tickets (
  ticket_hash   TEXT PRIMARY KEY,
  admin_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  room          INTEGER NOT NULL CHECK (room >= 0),
  target        INTEGER NOT NULL CHECK (target > 0),
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  used_at       TEXT,
  consume_token TEXT                                                    -- guards the consume batch
);
CREATE INDEX idx_moderation_tickets_admin ON moderation_tickets(admin_id, created_at);
