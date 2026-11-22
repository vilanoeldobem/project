import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { createD1 } from "../test/d1.mjs";

const db = createD1({ upTo: 5 });
await db.exec(`
  INSERT INTO users (id, name, nickname, nickname_key, city, email, verified_at)
  VALUES ('citizen-test', 'Fixture', 'Fixture', 'fixture', 'Vila', 'fixture@example.invalid', '2026-11-11');
  INSERT INTO sessions (token_hash, user_id, expires_at)
  VALUES (lower(hex(zeroblob(32))), 'citizen-test', '2026-12-01');
  INSERT INTO ngos (id, name, cnpj, applicant_id, requested_lot_id, status)
  VALUES ('ngo-test', 'Fixture NGO', '00000000000001', 'citizen-test', 'plaza-01', 'submitted');
  UPDATE lots SET ngo_id = 'ngo-test', state = 'application_sent' WHERE id = 'plaza-01';
`);

const linkedRows = `
  SELECT u.id, u.name, u.nickname, u.nickname_key, u.city, u.email, u.role, u.verified_at,
         s.token_hash, s.expires_at, n.id AS ngo_id, n.cnpj, n.name AS ngo_name, n.status, n.revision,
         l.id AS lot_id, l.state
  FROM users u JOIN sessions s ON s.user_id = u.id
  JOIN ngos n ON n.applicant_id = u.id
  JOIN lots l ON l.id = n.requested_lot_id AND l.ngo_id = n.id
`;
const before = db.sql(linkedRows);
assert.equal(before.length, 1);
assert.equal(db.sql("SELECT COUNT(*) AS n FROM lots")[0].n, 8);

const directory = new URL("../../../migrations/", import.meta.url);
const steps = readdirSync(directory).filter(file => /^(000[6-9]|001[0-5])_.*\.sql$/.test(file)).sort();
assert.deepEqual(steps.map(file => Number(file.slice(0, 4))), [6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
for (const step of steps) db.migrate(step);

assert.deepEqual(db.sql(linkedRows), before);
assert.equal(db.sql("SELECT COUNT(*) AS n FROM lots")[0].n, 97);
assert.equal(db.sql("SELECT COUNT(*) AS n FROM residential_plots")[0].n, 23);
assert.deepEqual(db.sql("PRAGMA foreign_key_check"), []);
assert.equal(db.sql("PRAGMA integrity_check")[0].integrity_check, "ok");
console.log("0005 -> 0015: 10 migrations; citizen, session and application preserved; plaza-01 reserved.");
console.log("NGO lots: 8 -> 97; residential plots: 23; foreign key violations: 0; integrity_check: ok.");
