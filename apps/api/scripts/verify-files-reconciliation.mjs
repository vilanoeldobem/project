/** Local-only canonical logo/document + reviewed-gallery lifecycle; all accounts/files are synthetic. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { png, pngChunk } from "../test/fixtures.mjs";

const ngo = "d1000000-0000-4000-8000-000000000001";
const users = ["d1000000-0000-4000-8000-000000000002", "d1000000-0000-4000-8000-000000000003", "d1000000-0000-4000-8000-000000000004"];
const tokens = ["reconciliation-local-owner", "reconciliation-local-admin", "reconciliation-local-other"];
const privateMarker = "SYNTHETIC_PRIVATE_IMAGE_METADATA";
const picture = png(128, 128, [pngChunk("tEXt", privateMarker)]);
const hash = (s) => createHash("sha256").update(s).digest("hex");

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 3600_000).toISOString();
  console.log(users.map((id, i) => `INSERT OR IGNORE INTO users(id,name,nickname,nickname_key,city,email,role,verified_at)
VALUES('${id}','Synthetic local user','reconcile_${i}','reconcile_${i}','Local','reconcile-${i}@example.invalid','${i === 1 ? "admin" : "player"}','2026-01-01');
UPDATE users SET files_deleting=0 WHERE id='${id}';
INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES('${hash(tokens[i])}','${id}','${expires}');`).join("\n"));
  console.log(`UPDATE lots SET ngo_id=NULL,state='available' WHERE ngo_id='${ngo}';
DELETE FROM ngo_files WHERE ngo_id='${ngo}';
DELETE FROM ngo_photos WHERE ngo_id='${ngo}';
DELETE FROM audit_events WHERE subject='ngo:${ngo}';
DELETE FROM ngos WHERE id='${ngo}';
INSERT INTO ngos(id,name,cnpj,cnpj_opened_on,status,applicant_id,requested_lot_id,description,tags,projects)
VALUES('${ngo}','Synthetic reconciled NGO','00000000000010','2020-01-01','submitted','${users[0]}','plaza-01','Synthetic public description','["education"]','[]');
UPDATE lots SET ngo_id='${ngo}',state='application_sent' WHERE id='plaza-01';`);
} else {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:8792");
  assert.equal(base.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Isolated local Worker only");
  const req = (path, who, body, method = body ? "POST" : "GET", extra = {}) => fetch(new URL(path, base), {
    method, headers: { Origin: "http://localhost:8799", ...(who === undefined ? {} : { Cookie: `__Host-vila_session=${tokens[who]}` }),
      ...(body ? { "Content-Type": body instanceof Uint8Array ? "image/png" : "application/json" } : {}), ...extra },
    ...(body ? { body: body instanceof Uint8Array ? body : JSON.stringify(body) } : {}),
  });
  const read = async (response, status = 200) => {
    assert.equal(response.status, status, await response.clone().text()); return response.json();
  };
  const app = async () => (await read(await req("/ngo/application", 0))).application;
  const file = (kind) => req(`/ngo/application/files?kind=${kind}`, 0, picture, "POST", { "X-Vila-Account": users[0] }).then((r) => read(r, 201));
  const initialRevision = (await app()).revision;
  const { file: logo } = await file("logo");
  const { file: doc } = await file("document");
  assert.equal((await app()).revision, initialRevision + 2);
  const decision = (action, revision) => req(`/admin/applications/${ngo}/decision`, 1, {
    action, revision, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  });
  assert.equal((await decision("approve", initialRevision)).status, 409);
  const logoPreview = await req(`/ngo/application/files/${logo.id}`, 0);
  assert.equal(logoPreview.status, 200);
  assert.ok(!Buffer.from(await logoPreview.arrayBuffer()).includes(Buffer.from(privateMarker)));
  assert.equal((await req(`/ngo/application/files/${doc.id}`, 2)).status, 404);
  assert.equal((await req(`/ngos/${ngo}/logo`)).status, 404);
  const galleryResponse = await req(`/ngo/photos?ngoId=${ngo}&position=0`, 0, picture, "POST", {
    "X-Vila-Account": users[0], "X-Vila-Caption": encodeURIComponent("Projeto comunitário sintético"),
  });
  const { photo } = await read(galleryResponse, 201);
  const photoPath = `/ngos/${ngo}/photos/${photo.id}`;
  assert.equal((await req(photoPath)).status, 404);
  const preview = await req(`/ngo/photos/${photo.id}/content`, 0);
  assert.equal(preview.status, 200);
  assert.ok(!Buffer.from(await preview.arrayBuffer()).includes(Buffer.from(privateMarker)));
  await read(await req(`/admin/ngo-photos/${photo.id}/decision`, 1, { accountId: users[1], action: "approve", revision: photo.revision }));
  const beforeExtraRevision = (await app()).revision;
  const { file: extraDocument } = await file("document");
  assert.equal((await decision("approve", beforeExtraRevision)).status, 409);
  const remove = () => req(`/ngo/application/files/${extraDocument.id}`, 0, undefined, "DELETE", { "X-Vila-Account": users[0] });
  const removed = await Promise.all([remove(), remove()]);
  assert.equal(removed.filter((r) => r.status === 200).length, 1);
  assert.ok(removed.every((r) => [200, 404, 409].includes(r.status)));
  // Latest PR32: starting review takes the current revision and locks further file changes.
  await read(await decision("start_review", initialRevision));
  assert.equal((await req("/ngo/application/files?kind=document", 0, picture, "POST", { "X-Vila-Account": users[0] })).status, 409);
  assert.equal((await req(`/ngo/application/files/${doc.id}`, 0, undefined, "DELETE", { "X-Vila-Account": users[0] })).status, 409);
  await read(await decision("approve", (await app()).revision));
  const published = await read(await req(`/ngos/${ngo}`));
  assert.equal(published.ngo.description, "Synthetic public description");
  assert.ok(published.ngo.photos.some((p) => p.id === photo.id));
  assert.ok(!JSON.stringify(published).includes(doc.id));
  for (const path of [`/ngos/${ngo}/logo`, photoPath]) {
    const response = await req(path);
    assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await req(path, undefined, undefined, "HEAD")).status, 200);
  }
  const adminDoc = await req(`/admin/applications/${ngo}/files/${doc.id}`, 1);
  assert.equal(adminDoc.status, 200); assert.match(adminDoc.headers.get("Content-Disposition"), /^attachment/);
  const detail = await read(await req(`/admin/applications/${ngo}`, 1));
  assert.equal(detail.history.filter((h) => h.action === "ngo.file_remove").length, 1);
  assert.equal(detail.history.filter((h) => h.action === "ngo.file_read").length, 1);
  assert.equal((await req("/ngo/application/files?kind=logo", 0, picture, "POST", { "X-Vila-Account": users[0] })).status, 409);
  assert.equal((await req("/me", 0, undefined, "DELETE")).status, 204);
  assert.equal((await req(`/admin/applications/${ngo}/files/${doc.id}`, 1)).status, 404);
  assert.equal((await req(`/ngos/${ngo}/logo`)).status, 200);
  assert.equal((await req(photoPath)).status, 200);
  console.log("PASS: canonical logo/documents + reviewed photos, sanitized images, revision/audit races and account cleanup");
}
