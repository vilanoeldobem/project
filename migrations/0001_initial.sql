-- 0001_initial: lots, NGOs ("ongs") and audit trail.
-- Immutable once applied in production: evolve the schema with a new file.
-- Superseded naming: 0003 renames tables, columns and states to English.
-- Refs: DEC-015 (eligibility criteria), DEC-028 (lot states), DEC-037 (admin approval).

CREATE TABLE ongs (
  id           TEXT PRIMARY KEY,                -- UUID
  name         TEXT NOT NULL,
  cnpj         TEXT NOT NULL UNIQUE,            -- digits only; criterion 1 (DEC-015)
  cnpj_opened_on TEXT,                          -- YYYY-MM-DD; criterion 2 (>= 1 year)
  summary      TEXT,
  -- submitted → under review → (changes requested → under review) → published | rejected
  status       TEXT NOT NULL DEFAULT 'candidatura_enviada'
               CHECK (status IN ('candidatura_enviada','em_analise','ajustes_solicitados','publicada','rejeitada')),
  revision     INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at   TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE lots (
  id       TEXT PRIMARY KEY,                    -- e.g. 'praca-01'
  street   TEXT NOT NULL,
  slot     INTEGER NOT NULL,
  x        REAL NOT NULL,                       -- world position (voxel units)
  z        REAL NOT NULL,
  state    TEXT NOT NULL DEFAULT 'disponivel'
           CHECK (state IN ('disponivel','candidatura_enviada','em_analise','publicado')),
  ong_id   TEXT REFERENCES ongs(id),
  UNIQUE (street, slot)
);

CREATE TABLE audit_events (
  id         TEXT PRIMARY KEY,
  at         TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  actor      TEXT NOT NULL,                     -- admin id; never an e-mail
  action     TEXT NOT NULL,                     -- e.g. 'ngo.approve'
  subject    TEXT NOT NULL,                     -- e.g. 'ngo:<uuid>'
  detail     TEXT                               -- JSON without personal data
);

CREATE INDEX idx_lots_ong ON lots(ong_id);
CREATE INDEX idx_ongs_status ON ongs(status);
