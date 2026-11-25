import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

function utcInstant(value) {
  if (typeof value !== "string" || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) {
    throw new Error("The period requires UTC timestamps with seconds, optionally with three fractional digits.");
  }
  const canonical = value.includes(".") ? value : value.replace("Z", ".000Z");
  const time = new Date(canonical);
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== canonical) throw new Error("Invalid calendar date.");
  return canonical;
}

export function readStatement(input) {
  if (input?.complete !== true || typeof input.devMode !== "boolean" || !Array.isArray(input.chargeIds)) {
    throw new Error("Provide a complete statement with devMode and an explicit chargeIds array.");
  }
  const from = utcInstant(input.from);
  const until = utcInstant(input.until);
  if (from >= until) throw new Error("The end of the period must follow its start.");
  if (input.chargeIds.some(id => typeof id !== "string" || !id.trim() || id !== id.trim())) {
    throw new Error("Every statement row must have a non-empty, normalized charge ID.");
  }
  return { complete: true, from, until, devMode: input.devMode, chargeIds: input.chargeIds };
}

export function ledgerQuery(statement) {
  // Only validated UTC instants and the numeric environment selector enter the command.
  // strftime handles both D1's ISO format and SQLite's UTC space-separated timestamps.
  const { from, until, devMode } = readStatement(statement);
  return `WITH ledger AS (
    SELECT id AS donationId, provider_charge_id AS chargeId,
           CASE WHEN substr(created_at, 11, 1) IN ('T', ' ')
                  AND date(substr(created_at, 1, 10), '+0 days') = substr(created_at, 1, 10)
                THEN strftime('%Y-%m-%dT%H:%M:%fZ', created_at) END AS createdUtc
    FROM donations WHERE provider = 'abacatepay' AND dev_mode = ${devMode ? 1 : 0}
  )
  SELECT donationId, chargeId, createdUtc IS NULL AS unknownTime
  FROM ledger
  WHERE createdUtc IS NULL OR (createdUtc >= '${from}' AND createdUtc < '${until}')
  ORDER BY donationId`;
}

export function compareStatement(statement, rows) {
  const findings = [];
  const counts = new Map();
  for (const id of statement.chargeIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const seen = new Set();
  for (const { donationId, chargeId, unknownTime } of rows) {
    if (typeof donationId !== "string" || !donationId || (chargeId !== null && typeof chargeId !== "string")
      || (unknownTime !== 0 && unknownTime !== 1)) throw new Error("Unexpected D1 row.");
    if (unknownTime) findings.push({ result: "unknown_d1_creation_time", donationId, chargeId });
    if (!chargeId?.trim()) {
      findings.push({ result: "missing_d1_charge_id", donationId });
      continue;
    }
    seen.add(chargeId);
    if (!unknownTime && !counts.has(chargeId)) findings.push({ result: "d1_only", donationId, chargeId });
  }
  for (const [chargeId, count] of counts) {
    if (count > 1) findings.push({ result: "duplicate_statement", chargeId, count });
    if (!seen.has(chargeId)) findings.push({ result: "statement_only_in_scope", chargeId });
  }
  return { from: statement.from, until: statement.until, devMode: statement.devMode,
    checkedD1: rows.length, checkedStatement: statement.chargeIds.length, findings };
}

function run() {
  const [statementPath, directory] = process.argv.slice(2);
  if (process.argv.length !== 4) throw new Error("Usage: node check-complete-pix-statement.mjs <statement.json> <wrangler-state-dir>");
  const statement = readStatement(JSON.parse(readFileSync(statementPath, "utf8").replace(/^\uFEFF/, "")));
  const stateDir = resolve(directory);
  if (!statSync(stateDir).isDirectory()) throw new Error("Expected an existing local Wrangler state directory.");
  const api = fileURLToPath(new URL("../", import.meta.url));
  const cli = join(api, "node_modules/wrangler/bin/wrangler.js");
  const raw = execFileSync(process.execPath, [cli, "d1", "execute", "ngo-media-review-local", "--local",
    "--config", "wrangler.reconciliation-local.jsonc", "--persist-to", stateDir, "--json", "--command", ledgerQuery(statement)],
    { cwd: api, encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  const replies = JSON.parse(raw);
  if (!Array.isArray(replies) || replies.length !== 1 || replies[0]?.success !== true || !Array.isArray(replies[0].results)) {
    throw new Error("Incomplete response from the local D1 query.");
  }
  const report = compareStatement(statement, replies[0].results);
  console.log(JSON.stringify(report, null, 2));
  return report.findings.length ? 1 : 0;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try { process.exitCode = run(); }
  catch (error) {
    // A process error can include Wrangler output. Keep statement and database contents out of the error log.
    console.error(error instanceof SyntaxError ? "Invalid JSON input or Wrangler output." :
      error?.status != null ? "Could not read the local D1. Check the Wrangler installation, state and migrated schema." : error.message);
    process.exitCode = 2;
  }
}
