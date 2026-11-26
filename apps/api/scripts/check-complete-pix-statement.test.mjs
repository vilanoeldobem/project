import { describe, expect, it } from "vitest";
import { createD1 } from "../test/d1.mjs";
import { compareStatement, ledgerQuery, readStatement } from "./check-complete-pix-statement.mjs";

const scope = { complete: true, devMode: true, from: "2026-11-01T00:00:00Z", until: "2026-12-01T00:00:00Z" };
function report(db, chargeIds) {
  const statement = readStatement({ ...scope, chargeIds });
  return compareStatement(statement, db.sql(ledgerQuery(statement)));
}

async function insert(db, id, createdAt, { provider = "abacatepay", chargeId = id, devMode = 1, status = "paid" } = {}) {
  await db.prepare(`INSERT INTO donations
    (id, target_kind, recipient_name, provider, provider_charge_id, amount_cents, ngo_share_cents,
     vila_share_cents, ngo_percent_bps, fixed_fee_cents, status, dev_mode, created_at)
    VALUES (?, 'global', 'Test partner', ?, ?, 1000, 900, 100, 9000, 0, ?, ?, ?)`)
    .bind(id, provider, chargeId, status, devMode, createdAt).run();
}

describe("complete Pix statement coverage", () => {
  it("reports both directions across the exact UTC creation window and environment", async () => {
    const db = createD1();
    await insert(db, "start", "2026-11-01 00:00:00");
    await insert(db, "last", "2026-11-30T23:59:59.999Z", {status: "refunded"});
    await insert(db, "before", "2026-10-31T23:59:59.999Z");
    await insert(db, "end", "2026-12-01T00:00:00Z");
    await insert(db, "proof", scope.from, {provider: "external_proof"});
    await insert(db, "live", scope.from, {devMode: 0});
    const result = report(db, ["start", "start", "elsewhere"]);
    expect(result.checkedD1).toBe(2);
    expect(result.checkedStatement).toBe(3);
    expect(result.findings).toEqual([
      { result: "d1_only", donationId: "last", chargeId: "last" },
      { result: "duplicate_statement", chargeId: "start", count: 2 },
      { result: "statement_only_in_scope", chargeId: "elsewhere" },
    ]);
    expect(report(db, ["start", "last"]).findings).toEqual([]);
    expect(report(db, ["live", "end"]).findings).toContainEqual({ result: "statement_only_in_scope", chargeId: "live" });
  });

  it("checks a declared empty statement against empty and populated ledgers", async () => {
    const db = createD1();
    expect(report(db, [])).toMatchObject({ checkedD1: 0, checkedStatement: 0, findings: [] });
    await insert(db, "unreported", scope.from);
    expect(report(db, []).findings).toEqual([{ result: "d1_only", donationId: "unreported", chargeId: "unreported" }]);
  });

  it("retains unplaceable dates and missing charge IDs as unresolved findings", async () => {
    const db = createD1();
    await insert(db, "blank", scope.from, {chargeId: null});
    await insert(db, "bad-date", "2026-02-30T00:00:00Z");
    await insert(db, "unreadable", "invalid");
    const result = report(db, ["bad-date"]);
    expect(result.findings).toEqual([
      { result: "unknown_d1_creation_time", donationId: "bad-date", chargeId: "bad-date" },
      { result: "missing_d1_charge_id", donationId: "blank" },
      { result: "unknown_d1_creation_time", donationId: "unreadable", chargeId: "unreadable" },
    ]);
  });

  it("refuses incomplete or invalid input, unreadable result shapes and an unmigrated D1", () => {
    for (const fields of [{}, { complete: false, chargeIds: [] }, {devMode: null, chargeIds: []},
      {chargeIds: [""]}, {chargeIds: [null]}, {chargeIds: [], from: "2026-02-30T00:00:00Z"},
      {chargeIds: [], until: scope.from}, {chargeIds: [], until: "2026-12-01"}]) {
      expect(() => readStatement({...scope, ...fields})).toThrow();
    }
    const statement = readStatement({...scope, chargeIds: []});
    expect(() => createD1({upTo: 10}).sql(ledgerQuery(statement))).toThrow(/donations/i);
    expect(() => compareStatement(statement, [{}])).toThrow(/D1 row/);
  });
});
