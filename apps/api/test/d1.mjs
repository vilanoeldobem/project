/**
 * Minimal D1 stand-in for unit tests, on Node's built-in SQLite (node:sqlite). Applies the real migrations
 * from /migrations, so the SQL that ships is the SQL under test. Supports prepare/bind/first/all/run/raw and
 * batch (in a transaction), which is all the API uses.
 */
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const MIGRATIONS = new URL("../../../migrations/", import.meta.url);

export function createD1() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON;");
  for (const f of readdirSync(MIGRATIONS).filter((f) => f.endsWith(".sql")).sort()) db.exec(readFileSync(new URL(f, MIGRATIONS), "utf8"));

  const statement = (sql, params = []) => ({
    sql,
    params,
    bind: (...p) => statement(sql, p),
    async first(col) {
      const row = db.prepare(sql).get(...params) ?? null;
      return row && col ? row[col] : row;
    },
    async all() {
      return { results: db.prepare(sql).all(...params), success: true, meta: {} };
    },
    async run() {
      const r = db.prepare(sql).run(...params);
      return { success: true, meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
    },
    async raw() {
      return db.prepare(sql).all(...params).map((r) => Object.values(r));
    },
  });

  return {
    prepare: (sql) => statement(sql),
    async batch(list) {
      db.exec("BEGIN");
      try {
        const out = [];
        for (const s of list) out.push(await s.run());
        db.exec("COMMIT");
        return out;
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
    },
    exec: async (sql) => db.exec(sql),
    /** Test helper: direct synchronous SQL. */
    sql: (q, ...p) => db.prepare(q).all(...p),
  };
}
