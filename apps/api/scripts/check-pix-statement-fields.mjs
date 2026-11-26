import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const amounts = ["amount_cents", "ngo_share_cents", "vila_share_cents"];
const fields = ["target_kind", "ngo_id", "sub_account_id", ...amounts, "status"];
const statuses = ["pending", "paid", "refunded", "under_dispute", "expired", "cancelled"];
const id = value => typeof value === "string" && value.length > 0 && value === value.trim();

export function readFieldStatement(input) {
  if (typeof input?.devMode !== "boolean" || !Array.isArray(input.rows) || input.rows.length === 0) {
    throw new Error("Provide devMode and at least one normalized statement row.");
  }
  const seen = new Set();
  for (const [index, row] of input.rows.entries()) {
    if (!id(row?.charge_id) || !id(row.sub_account_id)
      || !(row.target_kind === "global" ? row.ngo_id === null : row.target_kind === "ngo" && id(row.ngo_id))
      || !statuses.includes(row.status) || row.amount_cents <= 0
      || amounts.some(field => !Number.isSafeInteger(row[field]) || row[field] < 0)) {
      throw new Error(`Invalid normalized statement fields in row ${index + 1}.`);
    }
    if (seen.has(row.charge_id)) throw new Error(`Duplicate charge ID in row ${index + 1}.`);
    seen.add(row.charge_id);
  }
  return input;
}

/** Index lookups for just the listed charges. IDs are bound as data; amounts and beneficiary details stay off the command line. */
export async function compareFields(db, statement) {
  const { rows, devMode } = readFieldStatement(statement);
  const { results, success } = await db.prepare(`SELECT provider_charge_id, ${fields.join(", ")}
      FROM donations WHERE provider = 'abacatepay' AND dev_mode = ?
      AND provider_charge_id IN (SELECT value FROM json_each(?))`)
    .bind(Number(devMode), JSON.stringify(rows.map(row => row.charge_id))).all();
  if (!success || !Array.isArray(results)) throw new Error("Incomplete response from local D1.");
  const recorded = new Map(results.map(row => [row.provider_charge_id, row]));
  const findings = [];
  let matchedRows = 0;
  for (const [index, expected] of rows.entries()) {
    const row = index + 1;
    const actual = recorded.get(expected.charge_id);
    if (!actual) {
      findings.push({ row, result: "missing_in_environment" });
      continue;
    }
    const differences = fields.filter(field => expected[field] !== actual[field]);
    if (!differences.length) matchedRows++;
    for (const field of differences) {
      const finding = { row, result: "difference", field };
      if (amounts.includes(field) && Number.isSafeInteger(actual[field])) finding.delta_cents = expected[field] - actual[field];
      findings.push(finding);
    }
  }
  return { coverage: "listed_rows", devMode, checkedRows: rows.length, matchedRows, findings };
}

async function run() {
  const [statementPath, stateDir] = process.argv.slice(2);
  if (process.argv.length !== 4) throw new Error("Usage: node check-pix-statement-fields.mjs <statement.json> <wrangler-state-dir>");
  let input;
  try {
    input = JSON.parse(readFileSync(statementPath, "utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("Could not read the statement as UTF-8 JSON.");
  }
  const statement = readFieldStatement(input);
  // Wrangler's --persist-to takes the parent of the versioned resource directory.
  const persistRoot = join(resolve(stateDir), "v3");
  if (!statSync(join(persistRoot, "d1"), { throwIfNoEntry: false })?.isDirectory()) {
    throw new Error("Expected an existing migrated Wrangler D1 state.");
  }
  process.env.CLOUDFLARE_CF_FETCH_ENABLED = "false";
  process.env.WRANGLER_SEND_METRICS = "false";
  const { getPlatformProxy } = await import("wrangler");
  const configPath = fileURLToPath(new URL("../wrangler.reconciliation-local.jsonc", import.meta.url));
  const local = await getPlatformProxy({ configPath, persist: { path: persistRoot }, remoteBindings: false, envFiles: [] });
  try {
    const report = await compareFields(local.env.DB, statement);
    console.log(JSON.stringify(report, null, 2));
    return report.findings.length ? 1 : 0;
  } catch {
    throw new Error("Could not compare rows with local D1. Check the migrated database and statement size.");
  } finally {
    await local.dispose();
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = await run(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
