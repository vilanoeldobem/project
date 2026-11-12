/** Local D1/R2 document smoke. --seed prints SQL for synthetic accounts and a synthetic NGO only. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const ngo = "d0000000-0000-4000-8000-000000000001";
const owner = "d0000000-0000-4000-8000-000000000002";
const admin = "d0000000-0000-4000-8000-000000000003";
const other = "d0000000-0000-4000-8000-000000000004";
const accounts = [owner, admin, other];
const tokens = ["local-document-owner", "local-document-admin", "local-document-other"];
const hash = (s) => createHash("sha256").update(s).digest("hex");
// A minimal one-page PDF with a real cross-reference table; no embedded scripts or real personal data.
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (const object of ["<< /Type /Catalog /Pages 2 0 R >>", "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] /Resources << >> >>"]) {
  offsets.push(Buffer.byteLength(pdf));
  pdf += `${offsets.length - 1} 0 obj\n${object}\nendobj\n`;
}
const xref = Buffer.byteLength(pdf);
pdf += `xref\n0 4\n0000000000 65535 f \n${offsets.slice(1).map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 3600_000).toISOString();
  console.log(accounts.map((id, i) => `INSERT OR IGNORE INTO users(id,name,nickname,nickname_key,city,email,role,verified_at)
VALUES('${id}','Local document user ${i}','document_fixture_${i}','document_fixture_${i}','Local','document-${i}@example.invalid','${i === 1 ? "admin" : "player"}','2026-01-01');
INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at) VALUES('${hash(tokens[i])}','${id}','${expires}');`).join("\n"));
  console.log(`UPDATE lots SET state='available',ngo_id=NULL WHERE ngo_id='${ngo}';
DELETE FROM ngos WHERE id='${ngo}';
INSERT INTO ngos(id,name,cnpj,cnpj_opened_on,status,applicant_id,requested_lot_id)
VALUES('${ngo}','Synthetic document NGO','00000000000001','2020-01-01','submitted','${owner}','plaza-01');
UPDATE lots SET state='application_sent',ngo_id='${ngo}' WHERE id='plaza-01';`);
} else {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:8794");
  assert.equal(base.protocol, "http:");
  assert.ok(["localhost", "127.0.0.1"].includes(base.hostname), "Use only an isolated local Worker");
  const req = (path, who, body, method = body ? "POST" : "GET") => fetch(new URL(path, base), {
    method, headers: { Origin: "http://localhost:8799", ...(who === undefined ? {} : { Cookie: `__Host-vila_session=${tokens[who]}` }),
      ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const success = async (response, status = 200) => {
    assert.equal(response.status, status, await response.clone().text());
    return response.json();
  };
  const list = () => req(`/ngo/documents?ngoId=${ngo}`, 0).then((r) => success(r));
  const upload = (applicationRevision) => req("/ngo/documents", 0, {
    accountId: owner, ngoId: ngo, applicationRevision, label: "PRIVATE_DOCUMENT_LABEL", contentType: "application/pdf",
    dataBase64: Buffer.from(pdf).toString("base64"),
  }).then((r) => success(r, 201));
  const approve = (revision) => req(`/admin/applications/${ngo}/decision`, 1, {
    action: "approve", revision, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  });
  const initial = await list();
  const first = await upload(initial.applicationRevision);
  const id = first.document.id;
  const path = `/ngo/documents/${id}/content`;
  assert.equal((await req(path)).status, 401);
  assert.equal((await req(path, 2)).status, 404);
  const download = await req(path, 0);
  assert.equal(download.status, 200);
  assert.equal(download.headers.get("Cache-Control"), "no-store");
  assert.equal(download.headers.get("X-Content-Type-Options"), "nosniff");
  assert.match(download.headers.get("Content-Disposition"), /^attachment;/);
  assert.equal(await download.text(), pdf);
  assert.equal((await req(`/admin/ngo-documents/${id}/content`, 1)).status, 200);
  assert.equal((await req(path, 0, undefined, "HEAD")).status, 200);
  assert.equal((await approve(initial.applicationRevision)).status, 409, "Old review must be invalidated");
  await success(await req(`/ngo/documents/${id}/withdraw`, 0, { accountId: owner, applicationRevision: (await list()).applicationRevision }));
  assert.equal((await req(path, 0)).status, 404);
  const second = await upload((await list()).applicationRevision);
  await success(await approve((await list()).applicationRevision));
  const secondPath = `/ngo/documents/${second.document.id}/content`;
  assert.equal((await req(secondPath, 0)).status, 200, "Publication does not remove owner access");
  assert.equal((await req(secondPath, 2)).status, 404);
  assert.equal((await req(secondPath)).status, 401);
  const profile = await success(await req(`/ngos/${ngo}`));
  assert.ok(!("documents" in profile.ngo));
  assert.ok(!JSON.stringify(profile).includes("PRIVATE_DOCUMENT_LABEL"));
  assert.equal((await req(`/ngos/${ngo}/documents/${second.document.id}`)).status, 404);
  assert.equal((await req(`/ngo/documents/${second.document.id}/withdraw`, 0,
    { accountId: owner, applicationRevision: (await list()).applicationRevision })).status, 409);
  console.log("PASS: private local D1/R2 document upload, download, stale-review rejection, withdrawal and publication privacy");
}
