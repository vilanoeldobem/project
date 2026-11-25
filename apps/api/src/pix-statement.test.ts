import { expect, it } from "vitest";
import reconcile from "../scripts/reconcile-pix-statement.sql?raw";
import { createD1 } from "../test/d1.mjs";
import seed from "../test/fixtures/pix-statement.sql?raw";

it("locates the charge and reports each differing statement field in integer cents", async () => {
  const db = createD1();
  await db.exec(seed);
  expect(db.sql(reconcile)).toMatchObject([
    { charge_id: "pix_fin01_cent", result: "difference", field: "ngo_share_cents", d1_value: 900, statement_value: 899, delta_cents: -1 },
    { charge_id: "pix_fin01_duplicate", result: "ambiguous_statement", delta_cents: null },
    { charge_id: "pix_fin01_match", result: "match", delta_cents: null },
    { charge_id: "pix_fin01_missing", result: "missing_in_d1", delta_cents: null },
  ]);

  await db.prepare("UPDATE donations SET sub_account_id = ?, status = ?, vila_share_cents = ? WHERE provider_charge_id = ?")
    .bind("sacc_other", "refunded", 99, "pix_fin01_match").run();
  expect(db.sql(reconcile).filter(row => row.charge_id === "pix_fin01_match")).toMatchObject([
    { field: "status", d1_value: "refunded", statement_value: "paid", delta_cents: null },
    { field: "sub_account_id", d1_value: "sacc_other", statement_value: "sacc_fin01", delta_cents: null },
    { field: "vila_share_cents", d1_value: 99, statement_value: 100, delta_cents: 1 },
  ]);
});
