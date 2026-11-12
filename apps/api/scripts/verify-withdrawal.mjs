/** Local workerd/D1/R2 smoke; --seed resets synthetic fixtures in the isolated withdrawal-local DB. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const ngo = "e0000000-0000-4000-8000-000000000001";
const owner = "e0000000-0000-4000-8000-000000000002";
const admin = "e0000000-0000-4000-8000-000000000003";
const other = "e0000000-0000-4000-8000-000000000004";
const users = [owner, admin, other];
const tokens = ["local-withdrawal-owner", "local-withdrawal-admin", "local-withdrawal-other"];
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
const hash = (value) => createHash("sha256").update(value).digest("hex");
const reason = "Synthetic private withdrawal reason";

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 3600_000).toISOString();
  console.log(users.map((id, i) => `INSERT OR IGNORE INTO users(id,name,nickname,nickname_key,city,email,role,verified_at)
VALUES('${id}','Synthetic user','withdrawal_${i}','withdrawal_${i}','Local','withdrawal-${i}@example.invalid','${i === 1 ? "admin" : "player"}','2026-01-01');
INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES('${hash(tokens[i])}','${id}','${expires}');`).join("\n"));
  console.log(`UPDATE lots SET ngo_id=NULL,state='available' WHERE ngo_id='${ngo}';
DELETE FROM ngo_withdrawals WHERE ngo_id='${ngo}';
DELETE FROM audit_events WHERE subject='ngo:${ngo}';
DELETE FROM ngos WHERE id='${ngo}';
INSERT INTO ngos(id,name,cnpj,cnpj_opened_on,status,applicant_id,requested_lot_id)
VALUES('${ngo}','Synthetic withdrawal NGO','00000000000009','2020-01-01','submitted','${owner}','plaza-01');
UPDATE lots SET ngo_id='${ngo}',state='application_sent' WHERE id='plaza-01';
INSERT OR IGNORE INTO progress_events(user_id,mission_id,event_id) VALUES('${owner}','play-memory','win');`);
} else {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:8793");
  assert.equal(base.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Run only against an isolated local Worker");
  const req = (path, who, body, method = body ? "POST" : "GET") => fetch(new URL(path, base), {
    method, headers: { Origin: "http://localhost:8799", ...(who === undefined ? {} : { Cookie: `__Host-vila_session=${tokens[who]}` }),
      ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const read = async (response, status = 200) => {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  };
  const application = async () => (await read(await req("/ngo/application", 0))).application;
  const progress = await read(await req("/progress", 0));
  assert.ok(progress.progress.xp > 0, "Use nonempty progress to verify preservation");
  const { document } = await read(await req("/ngo/documents", 0, {
    accountId: owner, ngoId: ngo, applicationRevision: (await application()).revision,
    label: "Synthetic private evidence", contentType: "image/png", dataBase64: png,
  }), 201);
  const { photo } = await read(await req("/ngo/photos", 0, {
    accountId: owner, ngoId: ngo, caption: "Synthetic photo", position: 0, contentType: "image/png", dataBase64: png,
  }), 201);
  await read(await req(`/admin/ngo-photos/${photo.id}/decision`, 1, { accountId: admin, action: "approve", revision: photo.revision }));
  await read(await req(`/admin/applications/${ngo}/decision`, 1, {
    action: "approve", revision: (await application()).revision, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  }));
  assert.equal((await req(`/ngos/${ngo}`)).status, 200);
  const photoPath = `/ngos/${ngo}/photos/${photo.id}`;
  assert.equal((await req(photoPath)).status, 200);
  const indicatorsBefore = await read(await req("/indicators"));
  const count = (data) => data.indicators.find((i) => i.key === "approved_ngos").value;
  const revision = (await application()).revision;
  const withdraw = (who = 1, rev = revision) => req(`/admin/ngos/${ngo}/withdraw`, who, { accountId: users[who], revision: rev, reason });
  const competing = await Promise.all([withdraw(), withdraw()]);
  assert.deepEqual(competing.map((response) => response.status).sort(), [200, 409]);
  assert.equal((await withdraw()).status, 409);
  assert.equal((await withdraw(0)).status, 403);
  assert.equal((await req(`/admin/ngos/${ngo}/withdraw`, undefined, { revision, reason })).status, 401);
  const after = await application();
  assert.equal(after.status, "withdrawn"); assert.equal(after.revision, revision + 1);
  assert.equal(after.withdrawal.reason, reason);
  for (const [path, method] of [[`/ngos/${ngo}`, "GET"], [photoPath, "GET"], [photoPath, "HEAD"]]) {
    const response = await req(path, undefined, undefined, method);
    assert.equal(response.status, 404); assert.equal(response.headers.get("Cache-Control"), "no-store");
  }
  const lots = await read(await req("/lots"));
  const lot = lots.lots.find((l) => l.id === "plaza-01");
  assert.equal(lot.state, "available"); assert.equal(lot.ngo_id, null);
  assert.equal(count(await read(await req("/indicators"))), count(indicatorsBefore) - 1);
  assert.equal((await req(`/ngo/photos/${photo.id}/content`, 0)).status, 200);
  assert.equal((await req(`/ngo/documents/${document.id}/content`, 0)).status, 200);
  assert.equal((await req(`/ngo/documents/${document.id}/content`, 2)).status, 404);
  const detail = await read(await req(`/admin/applications/${ngo}`, 1));
  const audit = detail.history.filter((entry) => entry.action === "ngo.withdraw");
  assert.equal(audit.length, 1); assert.ok(!JSON.stringify(audit).includes(reason));
  assert.deepEqual(await read(await req("/progress", 0)), progress);
  console.log("PASS: local D1/R2 withdrawal, released lot, public revocation, private history and XP preservation");
}
