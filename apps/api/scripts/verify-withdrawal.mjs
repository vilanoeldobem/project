/**
 * Local-only smoke of the administrative withdrawal (IMPL-0020, PROPOSTA) on real workerd, D1 and R2 simulators.
 * Every account, organisation and file is synthetic. `--seed` prints the SQL that resets these fixtures.
 *
 * One command, on a fresh temporary database and bucket (repository root):
 *   node scripts/verify-media-local.mjs --withdrawal
 *
 * By hand, in apps/api, with the local-only config and the flag turned on for this Worker alone:
 *   pnpm exec wrangler d1 migrations apply ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to .wrangler/withdrawal-v9
 *   node scripts/verify-withdrawal.mjs --seed > .wrangler/withdrawal-seed.sql
 *   pnpm exec wrangler d1 execute ngo-media-review-local --local -c wrangler.reconciliation-local.jsonc --persist-to .wrangler/withdrawal-v9 --file .wrangler/withdrawal-seed.sql
 *   pnpm exec wrangler dev --local -c wrangler.reconciliation-local.jsonc --persist-to .wrangler/withdrawal-v9 --var NGO_WITHDRAWAL_ENABLED:true --port 8793 --inspector-port 9243
 *   node scripts/verify-withdrawal.mjs http://127.0.0.1:8793      # other terminal
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { png } from "../test/fixtures.mjs";

const ngo = "f1000000-0000-4000-8000-000000000001";
/** A second organisation, already published: left untouched here, for the dashboard check to withdraw. */
const published = "f1000000-0000-4000-8000-000000000005";
const owner = "f1000000-0000-4000-8000-000000000002";
const admin = "f1000000-0000-4000-8000-000000000003";
const other = "f1000000-0000-4000-8000-000000000004";
const users = [owner, admin, other];
const tokens = ["local-withdrawal-owner", "local-withdrawal-admin", "local-withdrawal-other"];
const hash = (value) => createHash("sha256").update(value).digest("hex");
const message = "Synthetic message to the organisation about the withdrawal";
const picture = png();

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 3600_000).toISOString();
  console.log(users.map((id, i) => `INSERT OR IGNORE INTO users(id,name,nickname,nickname_key,city,email,role,verified_at)
VALUES('${id}','Synthetic user','withdrawal_${i}','withdrawal_${i}','Local','withdrawal-${i}@example.invalid','${i === 1 ? "admin" : "player"}','2026-01-01');
UPDATE users SET files_deleting=0 WHERE id='${id}';
INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES('${hash(tokens[i])}','${id}','${expires}');`).join("\n"));
  console.log([ngo, published].map((id) => `UPDATE lots SET ngo_id=NULL,state='available' WHERE ngo_id='${id}';
DELETE FROM ngo_withdrawals WHERE ngo_id='${id}';
DELETE FROM ngo_files WHERE ngo_id='${id}';
DELETE FROM ngo_photos WHERE ngo_id='${id}';
DELETE FROM media_upload_intents WHERE ngo_id='${id}';
DELETE FROM audit_events WHERE subject='ngo:${id}';
DELETE FROM ngos WHERE id='${id}';`).join("\n"));
  console.log(`INSERT INTO ngos(id,name,cnpj,cnpj_opened_on,city,status,applicant_id,requested_lot_id,summary,description,tags,projects)
VALUES('${ngo}','Synthetic withdrawal NGO','00000000000009','2020-01-01','Local','submitted','${owner}','plaza-03','Synthetic summary','Synthetic public description','["education"]','[]');
UPDATE lots SET ngo_id='${ngo}',state='application_sent' WHERE id='plaza-03';
INSERT INTO ngos(id,name,cnpj,cnpj_opened_on,city,status,applicant_id,requested_lot_id,summary,description,tags,projects)
VALUES('${published}','Synthetic published NGO','00000000000019','2020-01-01','Local','published','${other}','plaza-04','Synthetic summary','Synthetic public description','["education"]','[]');
UPDATE lots SET ngo_id='${published}',state='published' WHERE id='plaza-04';
INSERT OR IGNORE INTO progress_events(user_id,mission_id,event_id) VALUES('${owner}','play-memory','win');`);
} else {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:8793");
  assert.equal(base.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Run only against an isolated local Worker");
  const req = (path, who, body, method = body ? "POST" : "GET", extra = {}) => fetch(new URL(path, base), {
    method, headers: { Origin: "http://localhost:8799", ...(who === undefined ? {} : { Cookie: `__Host-vila_session=${tokens[who]}` }),
      ...(body ? { "Content-Type": body instanceof Uint8Array ? "image/png" : "application/json" } : {}), ...extra },
    ...(body ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
  });
  const read = async (response, status = 200) => {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  };
  const refused = async (response, status, error) => assert.deepEqual([response.status, (await response.json()).error], [status, error]);
  const application = async () => (await read(await req("/ngo/application", 0))).application;
  const account = { "X-Vila-Account": owner };
  const file = (kind) => req(`/ngo/application/files?kind=${kind}`, 0, picture, "POST", account);
  const photoUpload = () => req(`/ngo/photos?ngoId=${ngo}&position=0`, 0, picture, "POST", { ...account, "X-Vila-Caption": encodeURIComponent("Synthetic photo") });

  assert.equal((await read(await req("/config"))).withdrawal, true, "Start the local Worker with NGO_WITHDRAWAL_ENABLED:true");
  const progress = await read(await req("/progress", 0));
  assert.ok(progress.progress.xp > 0, "Use nonempty progress to verify preservation");

  // The canonical pipeline: logo, document and one approved gallery photo, then the application is approved.
  const { file: logo } = await read(await file("logo"), 201);
  const { file: document } = await read(await file("document"), 201);
  const { photo } = await read(await photoUpload(), 201);
  await (await req(`/admin/ngo-photos/${photo.id}/content`, 1)).arrayBuffer(); // audited read, required to approve
  await read(await req(`/admin/ngo-photos/${photo.id}/decision`, 1, { accountId: admin, action: "approve", revision: photo.revision }));
  await read(await req(`/admin/applications/${ngo}/decision`, 1, {
    action: "approve", revision: (await application()).revision, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  }));

  const photoPath = `/ngos/${ngo}/photos/${photo.id}`, logoPath = `/ngos/${ngo}/logo`;
  const lot = async () => (await read(await req("/lots"))).lots.find((l) => l.id === "plaza-03");
  const count = async () => (await read(await req("/indicators"))).indicators.find((i) => i.key === "approved_ngos").value;
  for (const path of [`/ngos/${ngo}`, logoPath, photoPath]) assert.equal((await req(path)).status, 200, path);
  assert.equal((await lot()).ngo_id, ngo);
  const before = await count();

  // Two competing withdrawals: one wins, one audit row; then the refusals.
  const revision = (await application()).revision;
  const withdraw = (who = 1, rev = revision) => req(`/admin/ngos/${ngo}/withdraw`, who, { accountId: users[who], revision: rev, reason: message });
  const competing = await Promise.all([withdraw(), withdraw()]);
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  await refused(await withdraw(), 409, "application_withdrawn");
  await refused(await withdraw(0), 403, "admin_only");
  assert.equal((await req(`/admin/ngos/${ngo}/withdraw`, undefined, { revision, reason: message })).status, 401);
  await refused(await req(`/admin/ngos/${ngo}/withdraw`, 1, { accountId: admin, revision, reason: "short" }), 400, "reason_required");

  // The applicant sees the truth and the message; nothing public shows the organisation any more.
  const after = await application();
  assert.equal(after.status, "withdrawn"); assert.equal(after.revision, revision + 1);
  assert.equal(after.withdrawal.reason, message);
  for (const [path, method] of [[`/ngos/${ngo}`, "GET"], [logoPath, "GET"], [logoPath, "HEAD"], [photoPath, "GET"], [photoPath, "HEAD"]]) {
    const response = await req(path, undefined, undefined, method);
    assert.equal(response.status, 404, `${method} ${path}`); assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const released = await lot();
  assert.deepEqual([released.state, released.ngo_id, released.ngo_name, released.ngo_logo], ["available", null, null, null]);
  // The answer allows a 30 s cache in browsers; this client keeps none.
  assert.equal(await count(), before - 1);

  // Private copies stay; nothing can be added; the applicant can still remove their own data.
  assert.equal((await req(`/ngo/photos/${photo.id}/content`, 0)).status, 200);
  assert.equal((await req(`/ngo/application/files/${document.id}`, 0)).status, 200);
  assert.equal((await req(`/ngo/application/files/${document.id}`, 2)).status, 404);
  await refused(await file("document"), 409, "application_withdrawn");
  await refused(await photoUpload(), 409, "application_withdrawn");
  await refused(await req(`/admin/ngo-photos/${photo.id}/decision`, 1, { accountId: admin, action: "reject", revision: photo.revision + 1 }), 409, "application_withdrawn");
  await read(await req(`/ngo/application/files/${document.id}`, 0, undefined, "DELETE", account));
  await read(await req(`/ngo/photos/${photo.id}`, 0, undefined, "DELETE", account));
  assert.equal((await req(`/ngo/application/files/${document.id}`, 0)).status, 404);
  assert.equal((await req(`/ngo/application/files/${logo.id}`, 0)).status, 200);

  // One audit row for the withdrawal, without the message; progress untouched.
  const detail = await read(await req(`/admin/applications/${ngo}`, 1));
  const audit = detail.history.filter((entry) => entry.action === "ngo.withdraw");
  assert.equal(audit.length, 1); assert.ok(!JSON.stringify(detail.history).includes(message));
  assert.equal(detail.application.withdrawal.reason, message);
  assert.deepEqual(await read(await req("/progress", 0)), progress);
  console.log("PASS: local D1/R2 withdrawal, released lot, every public projection revoked, own removal, single audit and XP preserved");
}
