/** Local workerd smoke with synthetic data only. --seed prints SQL for the photos-local D1. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const ngoId = "f0000000-0000-4000-8000-000000000001";
const ownerId = "f0000000-0000-4000-8000-000000000002";
const adminId = "f0000000-0000-4000-8000-000000000003";
const ownerToken = "local-photo-smoke-owner";
const adminToken = "local-photo-smoke-admin";
const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
const hash = (s) => createHash("sha256").update(s).digest("hex");

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 3600_000).toISOString();
  console.log(`
INSERT OR IGNORE INTO users(id,name,nickname,nickname_key,city,email,role,verified_at)
VALUES('${ownerId}','Local owner','local_photo_owner','local_photo_owner','Local','photo-owner@example.invalid','player','2026-01-01'),
('${adminId}','Local reviewer','local_photo_admin','local_photo_admin','Local','photo-admin@example.invalid','admin','2026-01-01');
INSERT OR REPLACE INTO sessions(token_hash,user_id,expires_at)
VALUES('${hash(ownerToken)}','${ownerId}','${expires}'),('${hash(adminToken)}','${adminId}','${expires}');
INSERT OR IGNORE INTO ngos(id,name,cnpj,status,applicant_id,description)
VALUES('${ngoId}','Synthetic local NGO','00000000000000','published','${ownerId}','Local smoke fixture');
UPDATE lots SET ngo_id='${ngoId}',state='published' WHERE id='plaza-01';
`);
} else {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:8796");
  assert.equal(base.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Run only against a local Worker");
  const request = (path, token, body, method = body ? "POST" : "GET") => fetch(new URL(path, base), {
    method,
    headers: {
      Origin: "http://localhost:8799",
      ...(token ? { Cookie: `__Host-vila_session=${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const uploaded = await request("/ngo/photos", ownerToken, {
    accountId: ownerId, ngoId, caption: "Synthetic smoke photo", position: 0, contentType: "image/png", dataBase64: png,
  });
  assert.equal(uploaded.status, 201, await uploaded.clone().text());
  const { photo } = await uploaded.json();
  const publicPath = `/ngos/${ngoId}/photos/${photo.id}`;
  assert.equal((await request(publicPath)).status, 404, "Pending bytes stay private");
  assert.equal((await request(photo.previewUrl)).status, 401, "Preview requires a session");
  const preview = await request(photo.previewUrl, ownerToken);
  assert.equal(preview.status, 200);
  assert.deepEqual(Buffer.from(await preview.arrayBuffer()), Buffer.from(png, "base64"));
  const decide = (action, revision) => request(`/admin/ngo-photos/${photo.id}/decision`, adminToken,
    { accountId: adminId, action, revision });
  const approved = await decide("approve", photo.revision);
  assert.equal(approved.status, 200, await approved.clone().text());
  const approvedPhoto = (await approved.json()).photo;
  const profile = await request(`/ngos/${ngoId}`);
  assert.equal(profile.status, 200);
  assert.ok((await profile.json()).ngo.photos.some((p) => p.id === photo.id && p.url === publicPath));
  const publicImage = await request(publicPath);
  assert.equal(publicImage.status, 200);
  assert.equal(publicImage.headers.get("Content-Type"), "image/png");
  assert.equal(publicImage.headers.get("Cache-Control"), "no-store");
  assert.equal(publicImage.headers.get("X-Content-Type-Options"), "nosniff");
  assert.deepEqual(Buffer.from(await publicImage.arrayBuffer()), Buffer.from(png, "base64"));
  const head = await request(publicPath, undefined, undefined, "HEAD");
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await decide("approve", photo.revision)).status, 409, "Stale review cannot run twice");
  assert.equal((await decide("remove", approvedPhoto.revision)).status, 200);
  assert.equal((await request(publicPath)).status, 404, "Removal revokes public access");
  assert.equal((await request(photo.previewUrl, ownerToken)).status, 404);
  assert.ok(!(await (await request(`/ngos/${ngoId}`)).json()).ngo.photos.some((p) => p.id === photo.id));
  console.log("PASS: local D1/R2 upload, private preview, admin approval, public bytes/HEAD and removal");
}
