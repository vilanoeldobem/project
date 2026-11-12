/** Private NGO evidence (PROPOSTA, IMPL-0019). Application approval never makes these files public. */
import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { documentBytes } from "./ngo-document-file";
import { assertAccount, requireAdmin, requireUser, type User } from "./session";
import type { Env } from "./api";

const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDITABLE = ["submitted", "changes_requested", "rejected"];
interface Application { id: string; applicant_id: string | null; revision: number; status: string }
interface Document {
  id: string; ngo_id: string; object_key: string; label: string; content_type: string; byte_size: number;
  added_revision: number; removed_revision: number | null; created_at: string;
}
function missing(): never { throw new HttpError(404, "not_found"); }
function resources(env: Env): R2Bucket {
  if (env.NGO_DOCUMENTS_ENABLED !== "true") missing();
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!env.NGO_DOCUMENTS) throw new HttpError(503, "documents_unavailable");
  return env.NGO_DOCUMENTS;
}
const view = (d: Document, admin: boolean) => ({
  id: d.id, ngoId: d.ngo_id, label: d.label, contentType: d.content_type, byteSize: d.byte_size,
  addedRevision: d.added_revision, createdAt: d.created_at,
  contentUrl: `${admin ? "/admin/ngo-documents" : "/ngo/documents"}/${d.id}/content`,
});
function revisionOf(body: Record<string, unknown>): number {
  if (!Number.isSafeInteger(body.applicationRevision) || (body.applicationRevision as number) < 1)
    throw new HttpError(400, "revision_required");
  return body.applicationRevision as number;
}
async function editable(env: Env, id: unknown, user: User, revision: number): Promise<Application> {
  if (typeof id !== "string" || !ID.test(id)) missing();
  const ngo = await env.DB!.prepare("SELECT id, applicant_id, revision, status FROM ngos WHERE id = ? AND applicant_id = ?")
    .bind(id, user.id).first<Application>();
  if (!ngo) missing();
  if (ngo.revision !== revision) throw new HttpError(409, "stale_revision");
  if (!EDITABLE.includes(ngo.status)) throw new HttpError(409, "documents_locked");
  return ngo;
}
const MINE = "EXISTS (SELECT 1 FROM ngos WHERE id = ? AND document_write_token = ?)";
const audit = (env: Env, user: User, action: string, ngoId: string, documentId: string, revision: number, token: string) =>
  env.DB!.prepare(`INSERT INTO audit_events(id,actor,action,subject,detail) SELECT ?,?,?,?,? WHERE ${MINE}`)
    .bind(newId(), user.id, `ngo.document.${action}`, `ngo:${ngoId}`, JSON.stringify({ documentId, revision }), ngoId, token);

export async function uploadDocument(request: Request, env: Env): Promise<Response> {
  const bucket = resources(env), user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  const body = await readJson(request, 3 * 1024 * 1024); assertAccount(body, user);
  const ngo = await editable(env, body.ngoId, user, revisionOf(body));
  if (typeof body.label !== "string" || !body.label.trim() || body.label.trim().length > 120)
    throw new HttpError(400, "invalid_document_label");
  const count = await env.DB!.prepare("SELECT COUNT(*) AS n FROM ngo_documents WHERE ngo_id = ? AND removed_revision IS NULL")
    .bind(ngo.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= 10) throw new HttpError(409, "document_limit");
  const bytes = documentBytes(body.dataBase64, body.contentType);
  const id = newId(), token = newId(), key = `ngo-documents/${ngo.id}/${id}`;
  const nextRevision = ngo.revision + 1, now = new Date().toISOString();
  await bucket.put(key, bytes, { httpMetadata: { contentType: body.contentType as string } });
  try {
    const [claim] = await env.DB!.batch([
      env.DB!.prepare(`UPDATE ngos SET revision = revision + 1, document_write_token = ?, updated_at = ?
        WHERE id = ? AND applicant_id = ? AND revision = ? AND status = ?
        AND (SELECT COUNT(*) FROM ngo_documents WHERE ngo_id = ? AND removed_revision IS NULL) < 10`)
        .bind(token, now, ngo.id, user.id, ngo.revision, ngo.status, ngo.id),
      env.DB!.prepare(`INSERT INTO ngo_documents(id,ngo_id,object_key,label,content_type,byte_size,added_revision,created_at)
        SELECT ?,?,?,?,?,?,?,? WHERE ${MINE}`)
        .bind(id, ngo.id, key, body.label.trim(), body.contentType, bytes.length, nextRevision, now, ngo.id, token),
      audit(env, user, "upload", ngo.id, id, nextRevision, token),
    ]);
    if (!claim.meta.changes) throw new HttpError(409, "stale_revision");
  } catch (error) {
    await bucket.delete(key).catch(() => console.error("document_orphan_cleanup_failed"));
    throw error;
  }
  const document: Document = { id, ngo_id: ngo.id, object_key: key, label: body.label.trim(), content_type: body.contentType as string,
    byte_size: bytes.length, added_revision: nextRevision, removed_revision: null, created_at: now };
  return json({ applicationRevision: nextRevision, document: view(document, false) }, { status: 201, headers: NO_STORE });
}

export async function listDocuments(request: Request, env: Env, ngoId: string, admin: boolean): Promise<Response> {
  resources(env);
  const user = await (admin ? requireAdmin(request, env) : requireUser(request, env));
  if (!ID.test(ngoId)) missing();
  // One snapshot binds the list to the same revision that an admin must use when deciding the application.
  const { results } = await env.DB!.prepare(`SELECT n.revision AS application_revision, d.* FROM ngos n
    LEFT JOIN ngo_documents d ON d.ngo_id = n.id AND d.removed_revision IS NULL
    WHERE n.id = ? ${admin ? "" : "AND n.applicant_id = ?"} ORDER BY d.created_at,d.id LIMIT 10`)
    .bind(...(admin ? [ngoId] : [ngoId, user.id])).all<Document & { application_revision: number }>();
  if (!results.length) missing();
  return json({ applicationRevision: results[0].application_revision,
    documents: results.filter((d) => d.id !== null).map((d) => view(d, admin)) }, { headers: NO_STORE });
}

export async function documentContent(request: Request, env: Env, id: string, admin: boolean): Promise<Response> {
  const bucket = resources(env), user = await (admin ? requireAdmin(request, env) : requireUser(request, env));
  if (!ID.test(id)) missing();
  const row = await env.DB!.prepare(`SELECT d.* FROM ngo_documents d JOIN ngos n ON n.id = d.ngo_id
    WHERE d.id = ? AND d.removed_revision IS NULL ${admin ? "" : "AND n.applicant_id = ?"}`)
    .bind(...(admin ? [id] : [id, user.id])).first<Document>();
  if (!row) missing();
  const object = await bucket.get(row.object_key);
  if (!object) missing();
  const extension = row.content_type === "application/pdf" ? "pdf" : row.content_type === "image/png" ? "png" : "jpg";
  return new Response(request.method === "HEAD" ? null : object.body, { headers: {
    ...NO_STORE, "Content-Type": row.content_type, "Content-Length": String(object.size),
    "Content-Disposition": `attachment; filename="document-${row.id}.${extension}"`,
    "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox",
  } });
}

export async function withdrawDocument(request: Request, env: Env, id: string): Promise<Response> {
  const bucket = resources(env), user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  const body = await readJson(request); assertAccount(body, user);
  const revision = revisionOf(body);
  if (!ID.test(id)) missing();
  const doc = await env.DB!.prepare(`SELECT d.* FROM ngo_documents d JOIN ngos n ON n.id = d.ngo_id
    WHERE d.id = ? AND d.removed_revision IS NULL AND n.applicant_id = ?`).bind(id, user.id).first<Document>();
  if (!doc) missing();
  const ngo = await editable(env, doc.ngo_id, user, revision);
  const token = newId(), nextRevision = revision + 1;
  const [claim] = await env.DB!.batch([
    env.DB!.prepare(`UPDATE ngos SET revision = revision + 1, document_write_token = ?, updated_at = ?
      WHERE id = ? AND applicant_id = ? AND revision = ? AND status = ?
      AND EXISTS (SELECT 1 FROM ngo_documents WHERE id = ? AND removed_revision IS NULL)`)
      .bind(token, new Date().toISOString(), ngo.id, user.id, revision, ngo.status, id),
    env.DB!.prepare(`UPDATE ngo_documents SET removed_revision = ? WHERE id = ? AND removed_revision IS NULL AND ${MINE}`)
      .bind(nextRevision, id, ngo.id, token),
    audit(env, user, "withdraw", ngo.id, id, nextRevision, token),
  ]);
  if (!claim.meta.changes) throw new HttpError(409, "stale_revision");
  // Revoke in D1 first; failed physical cleanup never restores authenticated access.
  await bucket.delete(doc.object_key).catch(() => console.error("document_delete_failed"));
  return json({ applicationRevision: nextRevision, withdrawn: id }, { headers: NO_STORE });
}
