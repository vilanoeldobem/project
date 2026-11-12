/**
 * Files of an NGO application in R2 (IMPL-0017): one logo and up to five supporting documents. PROPOSTA: on
 * only when NGO_FILES_ENABLED = "true" and the bucket is bound (binding `FILES`); the list of documents an NGO
 * must send is PENDENTE (PEN-019), so none is required or named.
 *
 *   POST   /ngo/application/files?kind=logo|document   raw bytes, `Content-Type` = the file's → 201 {file, revision}
 *   GET    /ngo/application/files/:id                  → the bytes (the applicant's own)
 *   DELETE /ngo/application/files/:id                  → {revision}
 *   GET    /admin/applications/:id/files/:fileId       → the bytes (admin; reading a document is audited)
 *   GET    /ngos/:id/logo                              → the logo of a published NGO (public)
 *
 * The bucket is private: no public bucket URL, every byte goes through this Worker. D1 (`ngo_files`) says who
 * may read what; the R2 key is `ngo/<ngo id>/<file id>` and carries no name. Writes send `X-Vila-Account` (the
 * account the page believes is signed in), as JSON writes send `accountId`.
 *
 * A change of files bumps the application's `revision`: an admin decision made on the previous revision is
 * refused (409 stale_revision), so nothing unseen gets published. Files are frozen once the NGO is published.
 *
 * D1 and R2 do not share a transaction. Adding: the object is written first and removed again if the row is
 * refused. Removing: the row goes first, then the object. A crash in between leaves an unreachable object (never
 * a row without bytes that could be published), which only costs storage.
 */
import { checkFile, type ApplicationFile, type FileKind, FILE_RULES, fileErrorText, filesEditable, isFileKind, isFileType } from "@vila/shared/accounts/files";

import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readBytes } from "./http";
import { myApplication } from "./ngo";
import { requireAdmin, requireUser, type User } from "./session";
import type { Env } from "./api";

interface FileRow {
  id: string;
  ngo_id: string;
  kind: FileKind;
  content_type: ApplicationFile["contentType"];
  size: number;
  created_at: string;
}

const COLUMNS = "id, ngo_id, kind, content_type, size, created_at";

/** The bucket, when the feature is on. Uploads, downloads and the public logo all depend on both. */
export const filesBucket = (env: Env): R2Bucket | null => (env.NGO_FILES_ENABLED === "true" && env.FILES ? env.FILES : null);

function requireBucket(env: Env): R2Bucket {
  const bucket = filesBucket(env);
  if (!bucket) throw new HttpError(404, "files_disabled");
  return bucket;
}

export const objectKey = (ngoId: string, fileId: string) => `ngo/${ngoId}/${fileId}`;

const fileView = (r: FileRow): ApplicationFile => ({ id: r.id, kind: r.kind, contentType: r.content_type, size: r.size, createdAt: r.created_at });

/** Files of an application, logo first, documents in the order they were sent. Empty while the feature is off. */
export async function listFiles(env: Env, ngoId: string): Promise<ApplicationFile[]> {
  if (!filesBucket(env)) return [];
  const { results } = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_files WHERE ngo_id = ? ORDER BY kind = 'logo' DESC, created_at, id`).bind(ngoId).all<FileRow>();
  return results.map(fileView);
}

/** Same guard as `assertAccount`, for writes whose body is the file itself. */
function assertAccountHeader(request: Request, user: User): void {
  if (request.headers.get("X-Vila-Account") !== user.id) throw new HttpError(409, "account_changed");
}

/** Deleting an object that could not be linked (or is no longer linked) must not fail the request. */
async function discard(bucket: R2Bucket, keys: string | string[]): Promise<void> {
  try {
    await bucket.delete(keys);
  } catch (e) {
    // The object stays unreachable (no row points at it). Log the error class only: never a key or a name.
    console.error("file_cleanup_failed", e instanceof Error ? e.name : "unknown");
  }
}

const OPEN = "EXISTS (SELECT 1 FROM ngos WHERE id = ? AND revision = ? AND status != 'published')";

export async function uploadFile(request: Request, env: Env, url: URL): Promise<Response> {
  const bucket = requireBucket(env);
  const user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  assertAccountHeader(request, user);
  if (env.FILE_LIMITER && !(await env.FILE_LIMITER.limit({ key: user.id })).success) throw new HttpError(429, "too_many_requests");

  const kind = url.searchParams.get("kind");
  if (!isFileKind(kind)) throw new HttpError(400, "bad_kind");
  const rule = FILE_RULES[kind];
  const refuse = (status: number, error: Parameters<typeof fileErrorText>[0]) => new HttpError(status, error, { file: fileErrorText(error, kind) });
  const declared = (request.headers.get("Content-Type") ?? "").split(";")[0].trim().toLowerCase();
  if (!isFileType(declared) || !rule.types.includes(declared)) throw refuse(415, "file_type");

  // Cheap checks before reading megabytes: is there an application that still takes files?
  const db = env.DB!;
  const app = await myApplication(env, user.id);
  if (!app) throw new HttpError(409, "no_application");
  if (!filesEditable(app.status)) throw new HttpError(409, "application_locked");
  if (kind !== "logo") {
    const held = await db.prepare("SELECT COUNT(*) AS n FROM ngo_files WHERE ngo_id = ? AND kind = ?").bind(app.id, kind).first<{ n: number }>();
    if ((held?.n ?? 0) >= rule.maxCount) throw new HttpError(409, "too_many_files", { file: `Uma candidatura pode ter até ${rule.maxCount} documentos. Remova um para enviar outro.` });
  }

  let bytes: Uint8Array;
  try {
    bytes = await readBytes(request, rule.maxBytes);
  } catch (e) {
    if (e instanceof HttpError && e.code === "too_large") throw refuse(413, "file_too_large");
    throw e;
  }
  const check = checkFile(kind, declared, bytes);
  if (!check.ok) throw refuse(check.error === "file_too_large" ? 413 : 400, check.error);

  const id = newId();
  const key = objectKey(app.id, id);
  const previousLogo = kind === "logo" ? await db.prepare("SELECT id FROM ngo_files WHERE ngo_id = ? AND kind = 'logo'").bind(app.id).first<{ id: string }>() : null;
  await bucket.put(key, check.bytes, { httpMetadata: { contentType: check.type } });

  const now = new Date().toISOString();
  const ADDED = "EXISTS (SELECT 1 FROM ngo_files WHERE id = ?)";
  const insertAt = kind === "logo" ? 1 : 0;
  const statements = [
    // Each write happens only if the application is still the revision we read and not published; the
    // revision bump and the audit row happen only if the file row was written.
    ...(kind === "logo" ? [db.prepare(`DELETE FROM ngo_files WHERE ngo_id = ? AND kind = 'logo' AND ${OPEN}`).bind(app.id, app.id, app.revision)] : []),
    db
      .prepare(
        `INSERT INTO ngo_files (id, ngo_id, kind, content_type, size, uploaded_by, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${OPEN} AND (SELECT COUNT(*) FROM ngo_files WHERE ngo_id = ? AND kind = ?) < ?`
      )
      .bind(id, app.id, kind, check.type, check.bytes.length, user.id, now, app.id, app.revision, app.id, kind, rule.maxCount),
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND ${ADDED}`).bind(now, app.id, app.revision, id),
    db
      .prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'ngo.file_add', ?, ? WHERE ${ADDED}`)
      .bind(newId(), user.id, `ngo:${app.id}`, JSON.stringify({ kind, file: id, revision: app.revision + 1 }), id),
  ];
  let written = 0;
  try {
    written = (await db.batch(statements))[insertAt].meta.changes;
  } catch (e) {
    await discard(bucket, key);
    throw e;
  }
  if (!written) {
    // The application changed while the bytes were arriving (resubmitted, decided, another upload won the race).
    await discard(bucket, key);
    throw new HttpError(409, "application_changed");
  }
  if (previousLogo) await discard(bucket, objectKey(app.id, previousLogo.id));
  const file: ApplicationFile = { id, kind, contentType: check.type, size: check.bytes.length, createdAt: now };
  return json({ file, revision: app.revision + 1 }, { status: 201, headers: NO_STORE });
}

export async function deleteFile(request: Request, env: Env, fileId: string): Promise<Response> {
  const bucket = requireBucket(env);
  const user = await requireUser(request, env);
  assertAccountHeader(request, user);
  const db = env.DB!;
  const app = await myApplication(env, user.id);
  const row = app ? await db.prepare(`SELECT ${COLUMNS} FROM ngo_files WHERE id = ? AND ngo_id = ?`).bind(fileId, app.id).first<FileRow>() : null;
  if (!app || !row) throw new HttpError(404, "not_found");
  if (!filesEditable(app.status)) throw new HttpError(409, "application_locked");

  const now = new Date().toISOString();
  const GONE = "NOT EXISTS (SELECT 1 FROM ngo_files WHERE id = ?)";
  const [removed] = await db.batch([
    db.prepare(`DELETE FROM ngo_files WHERE id = ? AND ngo_id = ? AND ${OPEN}`).bind(fileId, app.id, app.id, app.revision),
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND ${GONE}`).bind(now, app.id, app.revision, fileId),
    db
      .prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'ngo.file_remove', ?, ? WHERE EXISTS (SELECT 1 FROM ngos WHERE id = ? AND revision = ?)`)
      .bind(newId(), user.id, `ngo:${app.id}`, JSON.stringify({ kind: row.kind, file: fileId, revision: app.revision + 1 }), app.id, app.revision + 1),
  ]);
  if (!removed.meta.changes) throw new HttpError(409, "application_changed");
  await discard(bucket, objectKey(app.id, fileId));
  return json({ revision: app.revision + 1 }, { headers: NO_STORE });
}

/**
 * The stored bytes with headers that keep them inert: the declared type and nothing else (`nosniff`), no
 * script, no embedding of anything (`sandbox` CSP), documents always as a download.
 */
async function load(bucket: R2Bucket, row: FileRow): Promise<R2ObjectBody> {
  const object = await bucket.get(objectKey(row.ngo_id, row.id));
  if (!object) throw new HttpError(404, "not_found");
  return object;
}

function serve(object: R2ObjectBody, row: FileRow, extra: Record<string, string> = {}): Response {
  return new Response(object.body, {
    headers: {
      "Content-Type": row.content_type,
      "Content-Length": String(object.size),
      "Content-Disposition": row.kind === "logo" ? "inline" : "attachment",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      ...NO_STORE,
      ...extra,
    },
  });
}

/** The applicant reads their own file back. */
export async function downloadOwnFile(request: Request, env: Env, fileId: string): Promise<Response> {
  const bucket = requireBucket(env);
  const user = await requireUser(request, env);
  const row = await env.DB!.prepare(
    `SELECT f.id, f.ngo_id, f.kind, f.content_type, f.size, f.created_at FROM ngo_files f JOIN ngos n ON n.id = f.ngo_id WHERE f.id = ? AND n.applicant_id = ?`
  )
    .bind(fileId, user.id)
    .first<FileRow>();
  if (!row) throw new HttpError(404, "not_found");
  return serve(await load(bucket, row), row);
}

/** An admin reads a file of an application under review. Opening a document leaves an audit row (who, which file). */
export async function downloadFileAdmin(request: Request, env: Env, ngoId: string, fileId: string): Promise<Response> {
  const bucket = requireBucket(env);
  const admin = await requireAdmin(request, env);
  const db = env.DB!;
  const row = await db.prepare(`SELECT ${COLUMNS} FROM ngo_files WHERE id = ? AND ngo_id = ?`).bind(fileId, ngoId).first<FileRow>();
  if (!row) throw new HttpError(404, "not_found");
  // The audit row is written only when there are bytes to hand over, and before they leave.
  const object = await load(bucket, row);
  if (row.kind === "document")
    await db
      .prepare("INSERT INTO audit_events (id, actor, action, subject, detail) VALUES (?, ?, 'ngo.file_read', ?, ?)")
      .bind(newId(), admin.id, `ngo:${ngoId}`, JSON.stringify({ kind: row.kind, file: fileId }))
      .run();
  return serve(object, row);
}

/** Public: the logo of a published NGO, and only that. Anything else about the NGO's files answers 404. */
export async function publicLogo(request: Request, env: Env, ngoId: string): Promise<Response> {
  const bucket = requireBucket(env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const row = await env.DB.prepare(
    `SELECT f.id, f.ngo_id, f.kind, f.content_type, f.size, f.created_at FROM ngo_files f JOIN ngos n ON n.id = f.ngo_id
      WHERE n.id = ? AND n.status = 'published' AND f.kind = 'logo'`
  )
    .bind(ngoId)
    .first<FileRow>();
  if (!row) throw new HttpError(404, "not_found");
  const etag = `"${row.id}"`;
  // Other sites may show the logo (the game is another origin); it is public by definition.
  const shared = { "Cache-Control": "public, max-age=300", ETag: etag, "Cross-Origin-Resource-Policy": "cross-origin" };
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: shared });
  return serve(await load(bucket, row), row, shared);
}

/**
 * Account deletion (LGPD): the applicant's documents go with the account, and so does the logo of an
 * application that was never published. The logo of a published NGO stays, like the NGO itself.
 * Runs whenever the bucket is bound, even with the feature switched off later: deletion must still reach R2.
 * The objects are removed before the rows: if the request dies in between, bytes are gone and rows are not,
 * never the opposite. Returns the statements that drop the rows, for the caller's transaction.
 */
export async function removeFilesOfAccount(env: Env, userId: string): Promise<D1PreparedStatement[]> {
  if (!env.FILES) return [];
  const db = env.DB!;
  const DOOMED = "FROM ngo_files f JOIN ngos n ON n.id = f.ngo_id WHERE n.applicant_id = ? AND (f.kind = 'document' OR n.status != 'published')";
  const { results } = await db.prepare(`SELECT f.id, f.ngo_id ${DOOMED}`).bind(userId).all<{ id: string; ngo_id: string }>();
  if (!results.length) return [];
  await env.FILES.delete(results.map((r) => objectKey(r.ngo_id, r.id)));
  return [db.prepare(`DELETE FROM ngo_files WHERE id IN (SELECT f.id ${DOOMED})`).bind(userId)];
}
