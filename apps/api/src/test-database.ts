import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL as NodeURL } from "node:url";

// Exercise real SQL and foreign keys, with D1's atomic batch semantics.
export function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  for (const file of ["0001_initial.sql", "0002_seed_lots.sql", "0003_english_schema.sql", "0004_accounts.sql", "0005_player_progress.sql", "0006_ngo_applications.sql"]) {
    sqlite.exec(readFileSync(new NodeURL(`../../../migrations/${file}`, import.meta.url), "utf8"));
  }
  class Statement {
    constructor(readonly sql: string, readonly values: SQLInputValue[] = []) {}
    bind(...values: SQLInputValue[]) { return new Statement(this.sql, values); }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async run() { return execute(this); }
    async all() { return { success: true, meta: { changes: 0 }, results: sqlite.prepare(this.sql).all(...this.values) }; }
  }
  function execute(s: Statement) {
    const result = sqlite.prepare(s.sql).run(...s.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(execute);
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}
