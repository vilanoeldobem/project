/** NGO photos (PROPOSTA): immutable private objects, owner upload, audited admin publication. */
import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { photoBytes } from "./ngo-photo-image";
import { assertAccount, requireAdmin, requireUser } from "./session";
import type { Env } from "./api";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Photo {
  id: string; ngo_id: string; object_key: string; content_type: string; byte_size: number;
  caption: string; position: number; status: string; revision: number;
}
const COLUMNS = "p.id, p.ngo_id, p.object_key, p.content_type, p.byte_size, p.caption, p.position, p.status, p.revision";
const PUBLISHED = "n.status = 'published' AND EXISTS (SELECT 1 FROM lots l WHERE l.ngo_id = n.id AND l.state = 'published')";
function missing(): never { throw new HttpError(404, "not_found"); }
function resources(env: Env): R2Bucket {
  if (env.NGO_PHOTOS_ENABLED !== "true") missing();
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!env.NGO_PHOTOS) throw new HttpError(503, "photos_unavailable");
  return env.NGO_PHOTOS;
}
const publicView = (p: Pick<Photo, "id" | "ngo_id" | "caption" | "position">) => ({
  id: p.id, url: `/ngos/${p.ngo_id}/photos/${p.id}`, caption: p.caption, position: p.position,
});
const privateView = (p: Photo, admin: boolean) => ({
  id: p.id, ngoId: p.ngo_id, caption: p.caption, position: p.position, status: p.status, revision: p.revision,
  contentType: p.content_type, byteSize: p.byte_size,
  previewUrl: p.status === "removed" ? null : `${admin ? "/admin/ngo-photos" : "/ngo/photos"}/${p.id}/content`,
});

export async function publicPhotos(env: Env, ngoId: string) {
  if (env.NGO_PHOTOS_ENABLED !== "true") return [];
  resources(env);
  const { results } = await env.DB!.prepare(
    `SELECT p.id, p.ngo_id, p.caption, p.position FROM ngo_photos p JOIN ngos n ON n.id = p.ngo_id
      WHERE n.id = ? AND p.status = 'approved' AND ${PUBLISHED} ORDER BY p.position, p.id LIMIT 10`
  ).bind(ngoId).all<Photo>();
  return results.map(publicView);
}

export async function uploadPhoto(request: Request, env: Env): Promise<Response> {
  const bucket = resources(env), user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  const body = await readJson(request, 3 * 1024 * 1024);
  assertAccount(body, user);
  if (typeof body.ngoId !== "string" || !ID.test(body.ngoId)) missing();
  const owner = await env.DB!.prepare("SELECT id FROM ngos WHERE id = ? AND applicant_id = ?").bind(body.ngoId, user.id).first();
  if (!owner) missing();
  if (typeof body.caption !== "string" || body.caption.trim().length > 240 ||
      typeof body.position !== "number" || !Number.isInteger(body.position) || body.position < 0 || body.position > 9)
    throw new HttpError(400, "invalid_photo_metadata");
  const count = await env.DB!.prepare("SELECT COUNT(*) AS n FROM ngo_photos WHERE ngo_id = ? AND status != 'removed'").bind(body.ngoId).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) throw new HttpError(409, "photo_limit_or_owner_changed");
  const bytes = photoBytes(body.dataBase64, body.contentType);
  const id = newId(), key = `ngo-photos/${body.ngoId}/${id}`;
  await bucket.put(key, bytes, { httpMetadata: { contentType: body.contentType as string } });
  try {
    const result = await env.DB!.prepare(
      `INSERT INTO ngo_photos (id, ngo_id, object_key, content_type, byte_size, caption, position)
       SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ngos WHERE id = ? AND applicant_id = ?)
       AND (SELECT COUNT(*) FROM ngo_photos WHERE ngo_id = ? AND status != 'removed') < 10`
    ).bind(id, body.ngoId, key, body.contentType, bytes.length, body.caption.trim(), body.position, body.ngoId, user.id, body.ngoId).run();
    if (!result.meta.changes) throw new HttpError(409, "photo_limit_or_owner_changed");
  } catch (error) {
    // A failed cleanup leaves an inaccessible orphan; never delete another upload's immutable key.
    await bucket.delete(key).catch(() => console.error("photo_orphan_cleanup_failed"));
    throw error;
  }
  const row = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p WHERE p.id = ?`).bind(id).first<Photo>();
  return json({ photo: privateView(row!, false) }, { status: 201, headers: NO_STORE });
}

export async function listPhotos(request: Request, env: Env, ngoId: string, admin: boolean): Promise<Response> {
  resources(env);
  const user = await (admin ? requireAdmin(request, env) : requireUser(request, env));
  if (!ID.test(ngoId)) missing();
  const ngo = await env.DB!.prepare("SELECT applicant_id FROM ngos WHERE id = ?").bind(ngoId).first<{ applicant_id: string | null }>();
  if (!ngo || (!admin && ngo.applicant_id !== user.id)) missing();
  const { results } = await env.DB!.prepare(
    `SELECT ${COLUMNS} FROM ngo_photos p WHERE p.ngo_id = ? AND p.status != 'removed' ORDER BY p.position, p.id LIMIT 10`
  ).bind(ngoId).all<Photo>();
  return json({ photos: results.map((p) => privateView(p, admin)) }, { headers: NO_STORE });
}

export async function photoContent(request: Request, env: Env, id: string, access: "owner" | "admin" | "public", ngoId?: string): Promise<Response> {
  const bucket = resources(env);
  const user = access === "public" ? null : await (access === "admin" ? requireAdmin(request, env) : requireUser(request, env));
  if (!ID.test(id) || (access === "public" && (!ngoId || !ID.test(ngoId)))) missing();
  const params: unknown[] = [id];
  let guard = "p.status != 'removed'";
  if (access === "public") { guard = `p.status = 'approved' AND n.id = ? AND ${PUBLISHED}`; params.push(ngoId); }
  if (access === "owner") { guard += " AND n.applicant_id = ?"; params.push(user!.id); }
  const row = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p JOIN ngos n ON n.id = p.ngo_id WHERE p.id = ? AND ${guard}`)
    .bind(...params).first<Photo>();
  if (!row) missing();
  const object = await bucket.get(row.object_key);
  if (!object) missing();
  return new Response(request.method === "HEAD" ? null : object.body, { headers: {
    ...NO_STORE, "Content-Type": row.content_type, "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Length": String(object.size),
  } });
}

export async function decidePhoto(request: Request, env: Env, id: string): Promise<Response> {
  const bucket = resources(env), admin = await requireAdmin(request, env);
  const body = await readJson(request); assertAccount(body, admin);
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "remove") throw new HttpError(400, "bad_action");
  if (!Number.isInteger(body.revision) || (body.revision as number) < 1) throw new HttpError(400, "revision_required");
  if (!ID.test(id)) missing();
  const row = await env.DB!.prepare(`SELECT ${COLUMNS}, n.applicant_id FROM ngo_photos p JOIN ngos n ON n.id = p.ngo_id WHERE p.id = ?`)
    .bind(id).first<Photo & { applicant_id: string | null }>();
  if (!row) missing();
  if (row.applicant_id === admin.id) throw new HttpError(403, "self_review");
  if (row.revision !== body.revision) throw new HttpError(409, "stale_revision");
  if (row.status === "removed" || (action !== "remove" && row.status !== "pending")) throw new HttpError(409, "bad_transition");
  const status = action === "approve" ? "approved" : action === "reject" ? "rejected" : "removed";
  if (action === "approve" && !(await bucket.head(row.object_key))) throw new HttpError(409, "photo_object_missing");
  const token = newId();
  const [changed] = await env.DB!.batch([
    env.DB!.prepare("UPDATE ngo_photos SET status = ?, revision = revision + 1, decision_token = ?, updated_at = ? WHERE id = ? AND revision = ? AND status = ?")
      .bind(status, token, new Date().toISOString(), id, row.revision, row.status),
    env.DB!.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail)
      SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ngo_photos WHERE id = ? AND decision_token = ?)`)
      .bind(newId(), admin.id, `ngo.photo.${action}`, `ngo:${row.ngo_id}`, JSON.stringify({ photoId: id, from: row.status, to: status, revision: row.revision + 1 }), id, token),
  ]);
  if (!changed.meta.changes) throw new HttpError(409, "stale_revision");
  // Tombstone commits before deletion: a storage outage must never republish removed bytes.
  if (action === "remove") await bucket.delete(row.object_key).catch(() => console.error("photo_delete_failed"));
  return json({ photo: privateView({ ...row, status, revision: row.revision + 1 }, true) }, { headers: NO_STORE });
}
