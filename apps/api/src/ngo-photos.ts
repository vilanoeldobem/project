/** NGO photos (PROPOSTA): immutable private objects, owner upload, audited admin publication. */
import { newId } from "./crypto";
import { putReserved } from "./media-storage";
import { HttpError, json, NO_STORE, readBytes, readJson } from "./http";
import { checkPhoto } from "@vila/shared/accounts/photos";
import { assertAccountHeader } from "./files";
import { assertAccount, requireAdmin, requireUser } from "./session";
import type { Env } from "./api";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
interface Photo {
  id: string; ngo_id: string; object_key: string; content_type: string; byte_size: number;
  caption: string; position: number; status: string; revision: number; upload_pending: number; cleanup_pending: number;
}
const COLUMNS = "p.id, p.ngo_id, p.object_key, p.content_type, p.byte_size, p.caption, p.position, p.status, p.revision, p.upload_pending, p.cleanup_pending";
const PUBLISHED = "n.status = 'published' AND EXISTS (SELECT 1 FROM lots l WHERE l.ngo_id = n.id AND l.state = 'published') AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id=n.applicant_id AND u.files_deleting=1)";
function missing(): never { throw new HttpError(404, "not_found"); }
function resources(env: Env, requireFlag = true): R2Bucket {
  if (requireFlag && env.NGO_PHOTOS_ENABLED !== "true") missing();
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!env.FILES) throw new HttpError(503, "photos_unavailable");
  return env.FILES;
}
const publicView = (p: Pick<Photo, "id" | "ngo_id" | "caption" | "position">) => ({
  id: p.id, url: `/ngos/${p.ngo_id}/photos/${p.id}`, caption: p.caption, position: p.position,
});
const privateView = (p: Photo, admin: boolean) => ({
  id: p.id, ngoId: p.ngo_id, caption: p.caption, position: p.position, status: p.status, revision: p.revision,
  contentType: p.content_type, byteSize: p.byte_size,
  uploadPending: Boolean(p.upload_pending), cleanupPending: Boolean(p.cleanup_pending),
  previewUrl: p.upload_pending || p.status === "removed" || p.status === "rejected" ? null : `${admin ? "/admin/ngo-photos" : "/ngo/photos"}/${p.id}/content`,
});

export async function publicPhotos(env: Env, ngoId: string) {
  if (env.NGO_PHOTOS_ENABLED !== "true" || !env.FILES) return [];
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const { results } = await env.DB!.prepare(
    `SELECT p.id, p.ngo_id, p.caption, p.position FROM ngo_photos p JOIN ngos n ON n.id = p.ngo_id
      WHERE n.id = ? AND p.status = 'approved' AND p.upload_pending = 0 AND ${PUBLISHED} ORDER BY p.position, p.id LIMIT 10`
  ).bind(ngoId).all<Photo>().catch((error: unknown) => {
    if (error instanceof Error && /no such table: ngo_photos/i.test(error.message)) return { results: [] };
    throw error;
  });
  return results.map(publicView);
}

const UPLOAD_STATES = "('submitted', 'changes_requested', 'published')";
const ACTIVE_PHOTO = "status IN ('pending','approved')";
const TOKEN = "EXISTS (SELECT 1 FROM ngo_photos WHERE id = ? AND decision_token = ?)";

async function changeRate(env: Env, userId: string): Promise<void> {
  if (env.FILE_LIMITER && !(await env.FILE_LIMITER.limit({ key: userId })).success) throw new HttpError(429, "too_many_requests");
}

/** A tombstone stays discoverable until deletion succeeds; an in-flight put must finish its own cleanup. */
async function cleanupPhoto(env: Env, row: Photo): Promise<void> {
  await resources(env, false).delete(row.object_key);
  await env.DB!.prepare("UPDATE ngo_photos SET cleanup_pending=0,upload_pending=0 WHERE id=? AND status IN ('rejected','removed')").bind(row.id).run();
}

export async function uploadPhoto(request: Request, env: Env): Promise<Response> {
  const bucket = resources(env), user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  assertAccountHeader(request, user);
  if (user.files_deleting) throw new HttpError(409, "account_deleting");
  await changeRate(env, user.id);
  const query = new URL(request.url).searchParams;
  const ngoId = query.get("ngoId") ?? "", positionText = query.get("position");
  let caption: string;
  const encodedCaption = request.headers.get("X-Vila-Caption") ?? "";
  if (encodedCaption.length > 3000) throw new HttpError(400, "invalid_photo_metadata");
  try { caption = decodeURIComponent(encodedCaption); }
  catch { throw new HttpError(400, "invalid_photo_metadata"); }
  if (!ID.test(ngoId)) missing();
  const owner = await env.DB!.prepare("SELECT id,status FROM ngos WHERE id=? AND applicant_id=?").bind(ngoId, user.id).first<{id: string; status: string}>();
  if (!owner) missing();
  if (!["submitted", "changes_requested", "published"].includes(owner.status)) throw new HttpError(409, "application_locked");
  if (Array.from(caption.trim()).length > 240 || caption.includes("\0") || positionText === null || !/^[0-9]$/.test(positionText)) throw new HttpError(400, "invalid_photo_metadata");
  const position = Number(positionText);
  const count = await env.DB!.prepare(`SELECT COUNT(*) AS n FROM ngo_photos WHERE ngo_id=? AND ${ACTIVE_PHOTO}`).bind(ngoId).first<{n: number}>();
  if ((count?.n ?? 0) >= 10) throw new HttpError(409, "photo_limit_or_owner_changed");
  const since = new Date(Date.now() - 86400000).toISOString();
  const used = await env.DB!.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE subject=? AND action='ngo.photo.upload' AND at>?").bind(`ngo:${ngoId}`, since).first<{n: number}>();
  if ((used?.n ?? 0) >= 60) throw new HttpError(429, "too_many_file_changes");
  const contentType = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  const checked = checkPhoto(contentType, await readBytes(request, 2 * 1024 * 1024));
  if (!checked.ok) throw new HttpError(400, checked.error);
  const id = newId(), key = `ngo-photos/${ngoId}/${id}`;
  // Durable staging precedes R2: a killed request leaves a private row that can be explicitly removed.
  const staged = await env.DB!.prepare(`INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position,upload_pending)
    SELECT ?,?,?,?,?,?,?,1 WHERE EXISTS (SELECT 1 FROM ngos n JOIN users u ON u.id=n.applicant_id
      WHERE n.id=? AND u.id=? AND u.files_deleting=0 AND n.status IN ${UPLOAD_STATES})
      AND (SELECT COUNT(*) FROM ngo_photos WHERE ngo_id=? AND ${ACTIVE_PHOTO})<10`)
    .bind(id, ngoId, key, checked.type, checked.bytes.length, caption.trim(), position, ngoId, user.id, ngoId).run();
  if (!staged.meta.changes) throw new HttpError(409, "photo_limit_or_owner_changed");
  const token = newId();
  try {
    await putReserved(bucket, key, checked.bytes, checked.type, async () => Boolean(await env.DB!.prepare(
      `SELECT p.id FROM ngo_photos p JOIN ngos n ON n.id=p.ngo_id JOIN users u ON u.id=n.applicant_id
        WHERE p.id=? AND p.status='pending' AND p.upload_pending=1 AND u.id=? AND u.files_deleting=0 AND n.status IN ${UPLOAD_STATES}`
    ).bind(id,user.id).first()));
    const [changed] = await env.DB!.batch([
      env.DB!.prepare(`UPDATE ngo_photos SET upload_pending=0,decision_token=? WHERE id=? AND status='pending' AND upload_pending=1
        AND EXISTS (SELECT 1 FROM ngos n JOIN users u ON u.id=n.applicant_id WHERE n.id=ngo_photos.ngo_id AND u.id=? AND u.files_deleting=0 AND n.status IN ${UPLOAD_STATES})`)
        .bind(token, id, user.id),
      env.DB!.prepare(`INSERT INTO audit_events(id,actor,action,subject,detail) SELECT ?,?,'ngo.photo.upload',?,? WHERE ${TOKEN}`)
        .bind(newId(), user.id, `ngo:${ngoId}`, JSON.stringify({photoId:id,revision:1}), id, token),
    ]);
    if (!changed.meta.changes) throw new HttpError(409, "photo_limit_or_owner_changed");
  } catch (error) {
    // A lost commit acknowledgement must never delete an object whose metadata is already active.
    const committed = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p WHERE p.id=?`).bind(id).first<Photo>();
    if (committed && !committed.upload_pending && (committed.status === "pending" || committed.status === "approved"))
      return json({photo: privateView(committed, false)}, {status:201,headers:NO_STORE});
    await env.DB!.prepare("UPDATE ngo_photos SET status='removed',caption='',upload_pending=0,cleanup_pending=1 WHERE id=? AND upload_pending=1").bind(id).run();
    const pending = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p WHERE p.id=?`).bind(id).first<Photo>();
    if (pending) await cleanupPhoto(env, pending).catch(() => {});
    else await bucket.delete(key).catch(() => {}); // The durable cleanup marker is the retry record.
    if (error instanceof HttpError && error.code === "upload_cancelled") throw new HttpError(409,"photo_limit_or_owner_changed");
    throw error;
  }
  const row = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p WHERE p.id=?`).bind(id).first<Photo>();
  if (!row) throw new HttpError(409, "photo_limit_or_owner_changed");
  return json({photo: privateView(row, false)}, {status:201,headers:NO_STORE});
}

export async function listPhotos(request: Request, env: Env, ngoId: string, admin: boolean): Promise<Response> {
  resources(env, false);
  const user = await (admin ? requireAdmin(request, env) : requireUser(request, env));
  if (!ID.test(ngoId)) missing();
  const ngo = await env.DB!.prepare("SELECT applicant_id FROM ngos WHERE id = ?").bind(ngoId).first<{ applicant_id: string | null }>();
  if (!ngo || (!admin && ngo.applicant_id !== user.id)) missing();
  const { results } = await env.DB!.prepare(
    `SELECT ${COLUMNS} FROM ngo_photos p WHERE p.ngo_id = ? AND (p.status IN ('pending','approved') OR p.cleanup_pending=1) ORDER BY p.status IN ('pending','approved') DESC,p.position,p.id LIMIT 100`
  ).bind(ngoId).all<Photo>();
  return json({ photos: results.map((p) => privateView(p, admin)) }, { headers: NO_STORE });
}

export async function photoContent(request: Request, env: Env, id: string, access: "owner" | "admin" | "public", ngoId?: string): Promise<Response> {
  if (access === "public" && !env.FILES) missing();
  const bucket = resources(env, access === "public");
  const user = access === "public" ? null : await (access === "admin" ? requireAdmin(request, env) : requireUser(request, env));
  if (!ID.test(id) || (access === "public" && (!ngoId || !ID.test(ngoId)))) missing();
  const params: unknown[] = [id];
  let guard = "p.status IN ('pending','approved') AND p.upload_pending=0";
  if (access === "public") { guard = `p.status = 'approved' AND p.upload_pending=0 AND n.id = ? AND ${PUBLISHED}`; params.push(ngoId); }
  if (access === "owner") { guard += " AND n.applicant_id = ?"; params.push(user!.id); }
  const row = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p JOIN ngos n ON n.id = p.ngo_id WHERE p.id = ? AND ${guard}`)
    .bind(...params).first<Photo>().catch((error: unknown) => {
      if (access === "public" && error instanceof Error && /no such table: ngo_photos/i.test(error.message)) return null;
      throw error;
    });
  if (!row) missing();
  const head = request.method === "HEAD";
  const etag = `"${row.id}"`;
  const revalidate = access === "public" && request.headers.get("If-None-Match") === etag;
  const object = head || revalidate ? await bucket.head(row.object_key) : await bucket.get(row.object_key);
  if (!object) missing();
  const cache: Record<string, string> = access === "public" ? { "Cache-Control": "no-cache", ETag: etag } : NO_STORE;
  if (revalidate) return new Response(null, { status: 304, headers: cache });
  if (access === "admin" && !head) await env.DB!.prepare("INSERT INTO audit_events(id,actor,action,subject,detail) VALUES(?,?,'ngo.photo.read',?,?)")
    .bind(newId(), user!.id, `ngo:${row.ngo_id}`, JSON.stringify({photoId:id,revision:row.revision})).run();
  return new Response(head ? null : (object as R2ObjectBody).body, { headers: {
    ...cache, "Content-Disposition": "inline", "Content-Type": row.content_type, "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox", "Content-Length": String(object.size),
  } });
}

export async function pendingPhotos(request: Request, env: Env): Promise<Response> {
  resources(env, false); await requireAdmin(request, env);
  const { results } = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p WHERE p.status='pending' OR p.cleanup_pending=1 ORDER BY p.created_at,p.id LIMIT 100`).all<Photo>();
  return json({photos:results.map((p) => privateView(p, true))}, {headers:NO_STORE});
}

async function removePhoto(env: Env, row: Photo, actor: string, owner: boolean): Promise<Response> {
  if (row.status !== "removed") {
    const token = newId();
    const [changed] = await env.DB!.batch([
      env.DB!.prepare(`UPDATE ngo_photos SET status='removed',caption='',revision=revision+1,decision_token=?,cleanup_pending=1,updated_at=?
        WHERE id=? AND revision=? AND status=? AND EXISTS (SELECT 1 FROM ngos n WHERE n.id=ngo_photos.ngo_id
          AND (?=0 OR n.applicant_id=?) AND NOT EXISTS(SELECT 1 FROM users u WHERE u.id=n.applicant_id AND u.files_deleting=1))`)
        .bind(token,new Date().toISOString(),row.id,row.revision,row.status,owner?1:0,actor),
      env.DB!.prepare(`INSERT INTO audit_events(id,actor,action,subject,detail) SELECT ?,?,'ngo.photo.remove',?,? WHERE ${TOKEN}`)
        .bind(newId(),actor,`ngo:${row.ngo_id}`,JSON.stringify({photoId:row.id,from:row.status,to:"removed",revision:row.revision+1}),row.id,token),
    ]);
    if (!changed.meta.changes) throw new HttpError(409,"stale_revision");
    row = {...row,status:"removed",caption:"",revision:row.revision+1,cleanup_pending:1};
  }
  try { await cleanupPhoto(env,row); }
  catch { throw new HttpError(503,"photo_cleanup_pending"); }
  return json({photo:privateView({...row,upload_pending:0,cleanup_pending:0},!owner)}, {headers:NO_STORE});
}

export async function deleteOwnPhoto(request: Request, env: Env, id: string): Promise<Response> {
  resources(env, false); const user = await requireUser(request,env); assertAccountHeader(request,user);
  if (user.files_deleting) throw new HttpError(409,"account_deleting");
  await changeRate(env,user.id);
  if (!ID.test(id)) missing();
  const row = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_photos p JOIN ngos n ON n.id=p.ngo_id WHERE p.id=? AND n.applicant_id=?`).bind(id,user.id).first<Photo>();
  if (!row) missing();
  return removePhoto(env,row,user.id,true);
}

export async function decidePhoto(request: Request, env: Env, id: string): Promise<Response> {
  const bucket = resources(env, false), admin = await requireAdmin(request, env);
  const body = await readJson(request); assertAccount(body, admin);
  const action = body.action;
  if (action !== "approve" && action !== "reject" && action !== "remove") throw new HttpError(400, "bad_action");
  if (!Number.isInteger(body.revision) || (body.revision as number) < 1) throw new HttpError(400, "revision_required");
  if (!ID.test(id)) missing();
  const row = await env.DB!.prepare(`SELECT ${COLUMNS}, n.applicant_id FROM ngo_photos p JOIN ngos n ON n.id=p.ngo_id WHERE p.id=?`).bind(id).first<Photo & {applicant_id:string|null}>();
  if (!row) missing();
  if (row.applicant_id === admin.id) throw new HttpError(403, "self_review");
  if (action === "remove" && row.status === "removed") return removePhoto(env,row,admin.id,false);
  if (action === "reject" && row.status === "rejected") {
    try { await cleanupPhoto(env,row); } catch { throw new HttpError(503,"photo_cleanup_pending"); }
    return json({photo:privateView({...row,cleanup_pending:0},true)}, {headers:NO_STORE});
  }
  if (row.revision !== body.revision) throw new HttpError(409, "stale_revision");
  if (action === "remove") return removePhoto(env,row,admin.id,false);
  if (row.status !== "pending" || row.upload_pending) throw new HttpError(409, "bad_transition");
  if (action === "approve") {
    if (!(await bucket.head(row.object_key))) throw new HttpError(409,"photo_object_missing");
    const viewed = await env.DB!.prepare("SELECT id FROM audit_events WHERE actor=? AND action='ngo.photo.read' AND subject=? AND json_extract(detail,'$.photoId')=? AND json_extract(detail,'$.revision')=? LIMIT 1")
      .bind(admin.id,`ngo:${row.ngo_id}`,id,row.revision).first();
    if (!viewed) throw new HttpError(409,"photo_review_required");
  }
  const status = action === "approve" ? "approved" : "rejected", token = newId();
  const [changed] = await env.DB!.batch([
    env.DB!.prepare("UPDATE ngo_photos SET status=?,caption=CASE WHEN ?='rejected' THEN '' ELSE caption END,cleanup_pending=?,revision=revision+1,decision_token=?,updated_at=? WHERE id=? AND revision=? AND status='pending' AND upload_pending=0 AND NOT EXISTS (SELECT 1 FROM ngos n JOIN users u ON u.id=n.applicant_id WHERE n.id=ngo_photos.ngo_id AND u.files_deleting=1)")
      .bind(status,status,action === "reject"?1:0,token,new Date().toISOString(),id,row.revision),
    env.DB!.prepare(`INSERT INTO audit_events(id,actor,action,subject,detail) SELECT ?,?,?,?,? WHERE ${TOKEN}`)
      .bind(newId(),admin.id,`ngo.photo.${action}`,`ngo:${row.ngo_id}`,JSON.stringify({photoId:id,from:row.status,to:status,revision:row.revision+1}),id,token),
  ]);
  if (!changed.meta.changes) throw new HttpError(409,"stale_revision");
  const after = {...row,status,caption:action === "reject"?"":row.caption,revision:row.revision+1,cleanup_pending:action === "reject"?1:0};
  if (action === "reject") {
    try { await cleanupPhoto(env,after); after.cleanup_pending=0; }
    catch { throw new HttpError(503,"photo_cleanup_pending"); }
  }
  return json({photo:privateView(after,true)}, {headers:NO_STORE});
}
