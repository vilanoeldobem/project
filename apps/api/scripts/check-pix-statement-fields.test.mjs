import { describe, expect, it } from "vitest";
import { createD1 } from "../test/d1.mjs";
import seed from "../test/fixtures/pix-statement.sql?raw";
import { compareFields, readFieldStatement } from "./check-pix-statement-fields.mjs";

const ngo = {
  charge_id: "pix_fin01_match", target_kind: "ngo", ngo_id: "ngo-fin01", sub_account_id: "sacc_fin01",
  amount_cents: 1000, ngo_share_cents: 900, vila_share_cents: 100, status: "paid",
};

describe("listed Pix statement rows", () => {
  it("matches a global refund and NGO payment, independent of other charges or their order", async () => {
    const db = createD1();
    await db.exec(seed);
    await db.exec("UPDATE donations SET target_kind='global', ngo_id=NULL, status='refunded' WHERE id='fin01-b'");
    const global = { ...ngo, charge_id: "pix_fin01_cent", target_kind: "global", ngo_id: null, status: "refunded" };
    expect(await compareFields(db, { devMode: true, rows: [global, ngo] })).toEqual({
      coverage: "listed_rows", devMode: true, checkedRows: 2, matchedRows: 2, findings: [],
    });
    expect(await compareFields(db, { devMode: true, rows: [ngo] })).toMatchObject({ checkedRows: 1, matchedRows: 1, findings: [] });
  });

  it("reports each incorrect field by input row, with statement-minus-D1 cents and no raw identifiers", async () => {
    const db = createD1();
    await db.exec(seed);
    const result = await compareFields(db, { devMode: true, rows: [
      { ...ngo, charge_id: "pix_fin01_cent" },
      { ...ngo, ngo_id: "other", sub_account_id: "another", ngo_share_cents: 899, vila_share_cents: 101, status: "refunded" },
    ] });
    expect(result.matchedRows).toBe(1);
    expect(result.findings).toEqual([
      { row: 2, result: "difference", field: "ngo_id" },
      { row: 2, result: "difference", field: "sub_account_id" },
      { row: 2, result: "difference", field: "ngo_share_cents", delta_cents: -1 },
      { row: 2, result: "difference", field: "vila_share_cents", delta_cents: 1 },
      { row: 2, result: "difference", field: "status" },
    ]);
  });

  it("keeps environments and external proofs separate, and treats the charge ID as a bound value", async () => {
    const db = createD1();
    await db.exec(seed);
    await db.exec("UPDATE donations SET dev_mode=0 WHERE id='fin01-a'");
    await db.exec("UPDATE donations SET provider='external_proof' WHERE id='fin01-b'");
    const inputs = [ngo, {...ngo, charge_id: "pix_fin01_cent"}, {...ngo, charge_id: "pix_quoted'id"}];
    expect((await compareFields(db, { devMode: true, rows: inputs })).findings).toEqual(
      [1, 2, 3].map(row => ({ row, result: "missing_in_environment" })));
    expect((await compareFields(db, { devMode: false, rows: [ngo] })).matchedRows).toBe(1);
  });

  it("rejects empty, incomplete, ambiguous or malformed input", () => {
    for (const input of [null, {}, { devMode: "false", rows: [ngo] }, { devMode: true, rows: [] },
      { devMode: true, rows: [ngo, ngo] }]) {
      expect(() => readFieldStatement(input)).toThrow();
    }
    for (const field of Object.keys(ngo)) {
      const row = { ...ngo };
      delete row[field];
      expect(() => readFieldStatement({ devMode: true, rows: [row] })).toThrow();
    }
    for (const change of [{status: "PAID"}, {target_kind: "global"}, {ngo_id: " "}, {amount_cents: 0},
      {vila_share_cents: 0.1}, {ngo_share_cents: -1}, {amount_cents: Number.MAX_SAFE_INTEGER + 1}]) {
      expect(() => readFieldStatement({ devMode: true, rows: [{...ngo, ...change}] })).toThrow();
    }
  });
});
