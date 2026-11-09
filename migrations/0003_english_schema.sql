-- 0003_english_schema: English names for tables, columns, states and ids (code must be en-US;
-- user-facing copy stays pt-BR). Rebuilds `ongs` → `ngos` and `lots` because SQLite cannot
-- alter CHECK constraints. Existing rows are carried over with their values mapped.
-- Refs: IMPL-0004.

PRAGMA defer_foreign_keys = true;

CREATE TABLE ngos (
  id             TEXT PRIMARY KEY,                -- UUID
  name           TEXT NOT NULL,
  cnpj           TEXT NOT NULL UNIQUE,            -- digits only; criterion 1 (DEC-015)
  cnpj_opened_on TEXT,                            -- YYYY-MM-DD; criterion 2 (>= 1 year)
  summary        TEXT,
  -- submitted → under_review → (changes_requested → under_review) → published | rejected
  status         TEXT NOT NULL DEFAULT 'submitted'
                 CHECK (status IN ('submitted','under_review','changes_requested','published','rejected')),
  revision       INTEGER NOT NULL DEFAULT 1 CHECK (revision > 0),
  created_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at     TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

INSERT INTO ngos (id, name, cnpj, cnpj_opened_on, summary, status, revision, created_at, updated_at)
SELECT id, name, cnpj, cnpj_opened_on, summary,
       CASE status
         WHEN 'candidatura_enviada' THEN 'submitted'
         WHEN 'em_analise'          THEN 'under_review'
         WHEN 'ajustes_solicitados' THEN 'changes_requested'
         WHEN 'publicada'           THEN 'published'
         WHEN 'rejeitada'           THEN 'rejected'
       END,
       revision, created_at, updated_at
  FROM ongs;

CREATE TABLE lots_v3 (
  id      TEXT PRIMARY KEY,                       -- e.g. 'plaza-01'
  street  TEXT NOT NULL,
  slot    INTEGER NOT NULL,
  x       REAL NOT NULL,                          -- world position (voxel units)
  z       REAL NOT NULL,
  state   TEXT NOT NULL DEFAULT 'available'
          CHECK (state IN ('available','application_sent','under_review','published')),
  ngo_id  TEXT REFERENCES ngos(id),
  UNIQUE (street, slot)
);

INSERT INTO lots_v3 (id, street, slot, x, z, state, ngo_id)
SELECT replace(id, 'praca-', 'plaza-'),
       CASE street WHEN 'praca' THEN 'plaza' ELSE street END,
       slot, x, z,
       CASE state
         WHEN 'disponivel'          THEN 'available'
         WHEN 'candidatura_enviada' THEN 'application_sent'
         WHEN 'em_analise'          THEN 'under_review'
         WHEN 'publicado'           THEN 'published'
       END,
       ong_id
  FROM lots;

DROP TABLE lots;
DROP TABLE ongs;
ALTER TABLE lots_v3 RENAME TO lots;

CREATE INDEX idx_lots_ngo ON lots(ngo_id);
CREATE INDEX idx_ngos_status ON ngos(status);

UPDATE audit_events SET action = replace(action, 'ong.', 'ngo.'), subject = replace(subject, 'ong:', 'ngo:');
