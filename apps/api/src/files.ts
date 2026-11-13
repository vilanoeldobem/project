/**
 * Files of an NGO application in R2 (IMPL-0017): one logo and up to five supporting documents. PROPOSTA: on
 * only when NGO_FILES_ENABLED = "true" and the bucket is bound (binding `FILES`); the list of documents an NGO
 * must send is PENDENTE (PEN-019), so none is required or named.
 *
 *   POST   /ngo/application/files?kind=logo|document   raw bytes, `Content-Type` = the file's → 201 {file, revision}
 *   GET    /ngo/application/files/:id                  → the bytes (the applicant's own)
 *   DELETE /ngo/application/files/:id                  → {revision}
 *   GET    /admin/applications/:id/files/:fileId       → the bytes (admin; reading a document is audited)
 *   POST   /admin/ngos/:id/logo/remove {accountId, revision} → {application} (admin; IMPL-0021)
 *   GET    /ngos/:id/logo                              → the logo of a published NGO (public)
 *
 * The bucket is private: no public bucket URL, every byte goes through this Worker. D1 (`ngo_files`) says who
 * may read what; the R2 key is `ngo/<ngo id>/<file id>` and carries no name. Writes send `X-Vila-Account` (the
 * account the page believes is signed in), as JSON writes send `accountId`.
 *
 * A change of files bumps the application's `revision`: an admin decision made on the previous revision is
 * refused (409 stale_revision), so nothing unseen gets published. Files are locked while an admin reviews
 * (`under_review`) and frozen once the NGO is published. Once the NGO is withdrawn (IMPL-0020, PROPOSTA) nothing
 * can be added, but the applicant may remove their own files; the public logo route requires the published lot,
 * so a withdrawn NGO has no public logo. Admins read whatever files exist whenever the bucket is
 * bound, even with the feature switched off: what could be published must always be visible to who decides.
 * For the same reason an admin can remove a logo, in any status, whenever the bucket is bound (IMPL-0021).
 *
 * D1 records upload/cleanup intents before touching R2. Conditional writes prevent a cancelled upload from
 * recreating erased bytes; owner/admin recovery retries abandoned intents without exposing private objects.
 */
import { checkFile, type ApplicationFile, type FileKind, FILE_RULES, fileErrorText, filesEditable, filesRemovable, isFileKind, isFileType } from "@vila/shared/accounts/files";

import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readBytes, readJson } from "./http";
import { APPLICATION_QUERY, applicationView, myApplication, type NgoRow } from "./ngo";
import { putReserved } from "./media-storage";
import { assertAccount, assertStillAdmin, requireAdmin, requireUser, STILL_ADMIN, type User } from "./session";
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

/** The bucket, when the feature is on. Uploads, the applicant's own reads and the public logo depend on both. */
export const filesBucket = (env: Env): R2Bucket | null => (env.NGO_FILES_ENABLED === "true" && env.FILES ? env.FILES : null);

function requireBucket(env: Env): R2Bucket {
  const bucket = filesBucket(env);
  if (!bucket) throw new HttpError(404, "files_disabled");
  return bucket;
}

/**
 * True for the error D1 raises when `ngo_files` does not exist (migration 0006 not applied yet). Reads treat
 * that as "no files" instead of failing: a database behind the code must not break public routes or sign-out.
 */
export const noFilesTable = (e: unknown): boolean => /no such table: ngo_files/i.test(e instanceof Error ? e.message : String(e));

/** File changes one application may make per day (uploads and removals): bounds audit rows and R2 writes. */
export const MAX_FILE_CHANGES_PER_DAY = 60;

export const objectKey = (ngoId: string, fileId: string) => `ngo/${ngoId}/${fileId}`;

const fileView = (r: FileRow): ApplicationFile => ({ id: r.id, kind: r.kind, contentType: r.content_type, size: r.size, createdAt: r.created_at });

/**
 * Files of an application, logo first, documents in the order they were sent. Listed whenever the bucket is
 * bound (flag on or off), so an admin always sees what an approval would publish; empty without the bucket or
 * without the table.
 */
export async function listFiles(env: Env, ngoId: string): Promise<ApplicationFile[]> {
  if (!env.FILES) return [];
  try {
    const { results } = await env.DB!.prepare(`SELECT ${COLUMNS} FROM ngo_files WHERE ngo_id = ? ORDER BY kind = 'logo' DESC, created_at, id`).bind(ngoId).all<FileRow>();
    return results.map(fileView);
  } catch (e) {
    if (noFilesTable(e)) return [];
    throw e;
  }
}

/** Refuses a file change once the application made too many in the last 24 hours (the audit rows are the count). */
async function assertChangeBudget(env: Env, ngoId: string): Promise<void> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const used = await env.DB!.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE subject = ? AND action IN ('ngo.file_add', 'ngo.file_remove') AND at > ?")
    .bind(`ngo:${ngoId}`, since)
    .first<{ n: number }>();
  if ((used?.n ?? 0) >= MAX_FILE_CHANGES_PER_DAY)
    throw new HttpError(429, "too_many_file_changes", { file: "Muitas alterações de arquivos hoje nesta candidatura. Tente de novo amanhã." });
}

/** Uploads and removals share one limiter, keyed by account. */
async function assertRate(env: Env, user: User): Promise<void> {
  if (env.FILE_LIMITER && !(await env.FILE_LIMITER.limit({ key: user.id })).success) throw new HttpError(429, "too_many_requests");
}

/** Same guard as `assertAccount`, for writes whose body is the file itself. */
export function assertAccountHeader(request: Request, user: User): void {
  if (request.headers.get("X-Vila-Account") !== user.id) throw new HttpError(409, "account_changed");
}

interface UploadIntent { id: string; ngo_id: string }

async function cleanupIntent(env: Env, intent: UploadIntent): Promise<boolean> {
  // Claim before deleting: this also prevents an in-flight upload from publishing its metadata.
  const claimed = await env.DB!.prepare(`UPDATE media_upload_intents SET cleanup_pending=1
    WHERE id=? AND NOT EXISTS (SELECT 1 FROM ngo_files WHERE id=media_upload_intents.id)`)
    .bind(intent.id).run();
  if (!claimed.meta.changes) return false;
  await env.FILES!.delete(objectKey(intent.ngo_id, intent.id));
  await env.DB!.prepare("DELETE FROM media_upload_intents WHERE id=? AND cleanup_pending=1").bind(intent.id).run();
  return true;
}

/** Bounded, explicit recovery also works with uploads disabled. Fresh in-flight uploads are left alone. */
export async function recoverFileUploads(request: Request, env: Env, ngoId?: string): Promise<Response> {
  const user = await (ngoId ? requireAdmin(request, env) : requireUser(request, env));
  assertAccountHeader(request, user);
  await assertRate(env, user);
  if (!env.FILES) throw new HttpError(503, "files_unavailable");
  const app = ngoId ? await env.DB!.prepare("SELECT id FROM ngos WHERE id=?").bind(ngoId).first<{ id: string }>()
    : await myApplication(env, user.id);
  if (!app) throw new HttpError(404, "not_found");
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { results } = await env.DB!.prepare(`SELECT id,ngo_id FROM media_upload_intents
    WHERE ngo_id=? AND (cleanup_pending=1 OR created_at<?) ORDER BY created_at,id LIMIT 50`)
    .bind(app.id, cutoff).all<UploadIntent>();
  let cleaned = 0;
  // Record an administrative cleanup attempt before destructive I/O, including partial/failing attempts.
  if (ngoId && results.length) await env.DB!.prepare("INSERT INTO audit_events(id,actor,action,subject,detail) VALUES(?,?,'ngo.file_cleanup',?,?)")
    .bind(newId(), user.id, `ngo:${app.id}`, JSON.stringify({ requested: results.length })).run();
  for (const intent of results) {
    try { if (await cleanupIntent(env, intent)) cleaned++; }
    catch { throw new HttpError(503, "file_cleanup_pending"); }
  }
  const remaining = await env.DB!.prepare("SELECT COUNT(*) AS n FROM media_upload_intents WHERE ngo_id=?").bind(app.id).first<{ n: number }>();
  return json({ cleaned, remaining: remaining?.n ?? 0 }, { headers: NO_STORE });
}

const MINE = "EXISTS (SELECT 1 FROM ngos WHERE id = ? AND file_write_token = ?)";

export async function uploadFile(request: Request, env: Env, url: URL): Promise<Response> {
  const bucket = requireBucket(env);
  const user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  assertAccountHeader(request, user);
  if (user.files_deleting) throw new HttpError(409, "account_deleting");
  await assertRate(env, user);

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
  if (app.withdrawn_at) throw new HttpError(409, "application_withdrawn");
  if (!filesEditable(app.status)) throw new HttpError(409, "application_locked");
  await assertChangeBudget(env, app.id);
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
  const now = new Date().toISOString(), token = newId();
  const staged = await db.prepare(`INSERT INTO media_upload_intents(id,ngo_id,uploaded_by,created_at)
    SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM ngos n JOIN users u ON u.id=n.applicant_id
      WHERE n.id=? AND u.id=? AND n.revision=? AND n.status=? AND u.files_deleting=0)`)
    .bind(id, app.id, user.id, now, app.id, user.id, app.revision, app.status).run();
  if (!staged.meta.changes) throw new HttpError(409, "application_changed");
  const statements = [
    // Claim the exact application snapshot before replacing anything. Only this operation's token may write, and
    // not for an applicant who was blocked while the bytes were arriving (IMPL-0021).
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ?, file_write_token = ?
      WHERE id = ? AND applicant_id = ? AND revision = ? AND status = ?
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ngos.applicant_id AND (u.files_deleting = 1 OR u.blocked = 1))
        AND EXISTS (SELECT 1 FROM media_upload_intents WHERE id=? AND cleanup_pending=0)
        AND (? = 'logo' OR (SELECT COUNT(*) FROM ngo_files WHERE ngo_id = ? AND kind = ?) < ?)`)
      .bind(now, token, app.id, user.id, app.revision, app.status, id, kind, app.id, kind, rule.maxCount),
    ...(kind === "logo" ? [db.prepare(`INSERT INTO media_upload_intents(id,ngo_id,uploaded_by,cleanup_pending)
      SELECT id,ngo_id,uploaded_by,1 FROM ngo_files WHERE ngo_id=? AND kind='logo' AND ${MINE}`).bind(app.id, app.id, token)] : []),
    ...(kind === "logo" ? [db.prepare(`DELETE FROM ngo_files WHERE ngo_id = ? AND kind = 'logo' AND ${MINE}`).bind(app.id, app.id, token)] : []),
    db.prepare(`INSERT INTO ngo_files (id, ngo_id, kind, content_type, size, uploaded_by, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE ${MINE}`)
      .bind(id, app.id, kind, check.type, check.bytes.length, user.id, now, app.id, token),
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'ngo.file_add', ?, ? WHERE ${MINE}`)
      .bind(newId(), user.id, `ngo:${app.id}`, JSON.stringify({ kind, file: id, revision: app.revision + 1 }), app.id, token),
    db.prepare(`DELETE FROM media_upload_intents WHERE id=? AND ${MINE}`).bind(id, app.id, token),
  ];
  let written = 0;
  try {
    await putReserved(bucket, key, check.bytes, check.type, async () => Boolean(await db.prepare(`SELECT i.id
      FROM media_upload_intents i JOIN ngos n ON n.id=i.ngo_id JOIN users u ON u.id=n.applicant_id
      WHERE i.id=? AND i.cleanup_pending=0 AND u.id=? AND u.files_deleting=0 AND n.revision=? AND n.status=?`)
      .bind(id, user.id, app.revision, app.status).first()));
    written = (await db.batch(statements))[0].meta.changes;
  } catch (e) {
    // A committed batch can lose its acknowledgement; preserve bytes if its metadata exists or cannot be checked.
    const linked = await db.prepare("SELECT id FROM ngo_files WHERE id = ?").bind(id).first();
    if (!linked) await cleanupIntent(env, { id, ngo_id: app.id }).catch(() => {}); // The durable intent remains retryable.
    if (e instanceof HttpError && e.code === "upload_cancelled") throw new HttpError(409, "application_changed");
    throw e;
  }
  if (!written) {
    // The application changed while the bytes were arriving (resubmitted, decided, another upload won the race).
    await cleanupIntent(env, { id, ngo_id: app.id }).catch(() => {});
    throw new HttpError(409, "application_changed");
  }
  if (previousLogo) await cleanupIntent(env, { id: previousLogo.id, ngo_id: app.id }).catch(() => {});
  const file: ApplicationFile = { id, kind, contentType: check.type, size: check.bytes.length, createdAt: now };
  return json({ file, revision: app.revision + 1 }, { status: 201, headers: NO_STORE });
}

export async function deleteFile(request: Request, env: Env, fileId: string): Promise<Response> {
  requireBucket(env);
  const user = await requireUser(request, env);
  assertAccountHeader(request, user);
  if (user.files_deleting) throw new HttpError(409, "account_deleting");
  await assertRate(env, user);
  const db = env.DB!;
  const app = await myApplication(env, user.id);
  const row = app ? await db.prepare(`SELECT ${COLUMNS} FROM ngo_files WHERE id = ? AND ngo_id = ?`).bind(fileId, app.id).first<FileRow>() : null;
  if (!app || !row) throw new HttpError(404, "not_found");
  // After a withdrawal (IMPL-0020, PROPOSTA) the applicant may still remove their own files, never add one.
  if (!filesRemovable(app.withdrawn_at ? "withdrawn" : app.status)) throw new HttpError(409, "application_locked");
  await assertChangeBudget(env, app.id);

  const now = new Date().toISOString(), token = newId();
  const [removed] = await db.batch([
    // Not for an applicant who was blocked after the session check (IMPL-0021): a blocked account only erases itself.
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ?, file_write_token = ?
      WHERE id = ? AND applicant_id = ? AND revision = ? AND status = ?
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ngos.applicant_id AND (u.files_deleting = 1 OR u.blocked = 1))
        AND EXISTS (SELECT 1 FROM ngo_files WHERE id = ? AND ngo_id = ?)`)
      .bind(now, token, app.id, user.id, app.revision, app.status, fileId, app.id),
    db.prepare(`INSERT INTO media_upload_intents(id,ngo_id,uploaded_by,cleanup_pending)
      SELECT id,ngo_id,uploaded_by,1 FROM ngo_files WHERE id=? AND ngo_id=? AND ${MINE}`).bind(fileId, app.id, app.id, token),
    db.prepare(`DELETE FROM ngo_files WHERE id = ? AND ngo_id = ? AND ${MINE}`).bind(fileId, app.id, app.id, token),
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'ngo.file_remove', ?, ? WHERE ${MINE}`)
      .bind(newId(), user.id, `ngo:${app.id}`, JSON.stringify({ kind: row.kind, file: fileId, revision: app.revision + 1 }), app.id, token),
  ]);
  if (!removed.meta.changes) {
    if (await db.prepare("SELECT 1 AS x FROM users WHERE id = ? AND blocked = 1").bind(user.id).first()) throw new HttpError(403, "session_blocked");
    throw new HttpError(409, "application_changed");
  }
  try { await cleanupIntent(env, { id: fileId, ngo_id: app.id }); }
  catch { throw new HttpError(503, "file_cleanup_pending"); }
  return json({ revision: app.revision + 1 }, { headers: NO_STORE });
}

/**
 * An administrator removes the logo of an NGO, in any status (IMPL-0021): a published logo is public, so the
 * administration must be able to take it down. Same guards as the applicant's own removal: the revision on screen,
 * one batch claimed by this operation's token, the revision bumped (an open review goes stale), the row gone
 * before the object. Needs the bucket, not the upload flag; the audit row carries ids only. The claim also
 * requires that the actor is still an administrator when the batch commits, as the role and block routes do.
 *
 * The applicant may be gone: a published NGO keeps its logo when the account is erased, with `ngo_files.uploaded_by`
 * set to NULL. The cleanup intent, which needs an owner, is then recorded under the administrator who removes it.
 */
export async function removeLogoAdmin(request: Request, env: Env, ngoId: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  assertAccount(body, admin);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ngoId)) throw new HttpError(404, "not_found");
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1) throw new HttpError(400, "revision_required");
  if (!env.FILES) throw new HttpError(503, "files_unavailable");
  const db = env.DB!;
  const READ = `SELECT n.*, w.reason AS withdrawal_reason, w.withdrawn_at, COALESCE(u.files_deleting,0) AS files_deleting,
      (SELECT id FROM ngo_files WHERE ngo_id = n.id AND kind = 'logo') AS logo_id
    FROM ngos n LEFT JOIN ngo_withdrawals w ON w.ngo_id = n.id LEFT JOIN users u ON u.id = n.applicant_id WHERE n.id = ?`;
  type Row = NgoRow & { files_deleting: number; logo_id: string | null };
  const row = await db.prepare(READ).bind(ngoId).first<Row>();
  if (!row || !row.logo_id) throw new HttpError(404, "not_found");
  // Nobody acts as the administration on their own organisation (conflict of interest).
  if (row.applicant_id === admin.id) throw new HttpError(403, "self_review");
  // The erasure of the applicant's account is deciding which files stay: wait until it finishes.
  if (row.files_deleting) throw new HttpError(409, "account_deleting");
  if (row.revision !== body.revision) throw new HttpError(409, "stale_revision");

  const fileId = row.logo_id, now = new Date().toISOString(), token = newId();
  const [removed] = await db.batch([
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ?, file_write_token = ?
      WHERE id = ? AND revision = ?
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = ngos.applicant_id AND u.files_deleting = 1)
        AND EXISTS (SELECT 1 FROM ngo_files WHERE id = ? AND ngo_id = ? AND kind = 'logo')
        AND ${STILL_ADMIN}`)
      .bind(now, token, ngoId, row.revision, fileId, ngoId, admin.id),
    db.prepare(`INSERT INTO media_upload_intents(id,ngo_id,uploaded_by,cleanup_pending)
      SELECT id,ngo_id,COALESCE(uploaded_by, ?),1 FROM ngo_files WHERE id=? AND ngo_id=? AND ${MINE}`).bind(admin.id, fileId, ngoId, ngoId, token),
    db.prepare(`DELETE FROM ngo_files WHERE id = ? AND ngo_id = ? AND ${MINE}`).bind(fileId, ngoId, ngoId, token),
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'ngo.logo_remove', ?, ? WHERE ${MINE}`)
      .bind(newId(), admin.id, `ngo:${ngoId}`, JSON.stringify({ file: fileId, revision: row.revision + 1 }), ngoId, token),
  ]);
  if (!removed.meta.changes) {
    // The actor was demoted, blocked or erased between the session check and the batch: nothing else is said.
    await assertStillAdmin(db, admin.id);
    // Lost a race: say what won (an account erasure, another removal or replacement, or a change of revision).
    const latest = await db.prepare(READ).bind(ngoId).first<Row>();
    if (latest?.files_deleting) throw new HttpError(409, "account_deleting");
    throw new HttpError(409, "stale_revision");
  }
  // The row is gone and the intent is durable: a failed delete is retried by the admin recovery route.
  try { await cleanupIntent(env, { id: fileId, ngo_id: ngoId }); }
  catch { throw new HttpError(503, "file_cleanup_pending"); }
  const after = await db.prepare(`${APPLICATION_QUERY} WHERE n.id = ?`).bind(ngoId).first<NgoRow>();
  return json({ application: applicationView(after!) }, { headers: NO_STORE });
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
  // Bucket bound is enough (flag on or off): see `listFiles`.
  if (!env.FILES) throw new HttpError(404, "files_disabled");
  const bucket = env.FILES;
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
      WHERE n.id = ? AND n.status = 'published' AND f.kind = 'logo'
        AND EXISTS (SELECT 1 FROM lots l WHERE l.ngo_id = n.id AND l.state = 'published')`
  )
    .bind(ngoId)
    .first<FileRow>()
    .catch((e) => {
      if (noFilesTable(e)) return null;
      throw e;
    });
  if (!row) throw new HttpError(404, "not_found");
  const etag = `"${row.id}"`;
  // Other sites may show the logo (the game is another origin); it is public by definition.
  const shared = { "Cache-Control": "no-cache", ETag: etag, "Cross-Origin-Resource-Policy": "cross-origin" };
  if (request.headers.get("If-None-Match") === etag) return new Response(null, { status: 304, headers: shared });
  return serve(await load(bucket, row), row, shared);
}

/**
 * Account deletion (LGPD): the applicant's documents go with the account, and so does the logo of an
 * application that is not in the village. The logo of a published NGO on a published lot stays, like the NGO
 * itself; a withdrawn NGO (IMPL-0020) keeps `status = 'published'` but holds no lot, so its logo goes too.
 * All gallery photos belonging to the account are erased, including approved photos.
 * Runs even with feature flags off. Missing storage with owned metadata fails closed, preserving the account.
 * The objects are removed before the rows: if the request dies in between, bytes are gone and rows are not,
 * never the opposite. Returns the statements that drop the rows, for the caller's transaction.
 */
export async function removeFilesOfAccount(env: Env, userId: string): Promise<D1PreparedStatement[]> {
  const db = env.DB!;
  // DELETE /me has already frozen owner mutations and administrative decisions with files_deleting.
  // The lot rule reads no table newer than 0003. It cannot change under this erasure: decisions (but rejection,
  // which never applies to a published NGO) and withdrawals are refused while `files_deleting` is set.
  const DOOMED = `FROM ngo_files f JOIN ngos n ON n.id = f.ngo_id WHERE n.applicant_id = ? AND (f.kind = 'document' OR n.status != 'published'
    OR NOT EXISTS (SELECT 1 FROM lots l WHERE l.ngo_id = n.id AND l.state = 'published'))`;
  const PHOTOS = "FROM ngo_photos p JOIN ngos n ON n.id = p.ngo_id WHERE n.applicant_id = ?";
  let results: Array<{ id: string; ngo_id: string }> = [];
  let hasFilesTable = true;
  try {
    results = (await db.prepare(`SELECT f.id, f.ngo_id ${DOOMED}`).bind(userId).all<{ id: string; ngo_id: string }>()).results;
  } catch (error) {
    if (!noFilesTable(error)) throw error;
    hasFilesTable = false;
  }
  const { results: photos } = await db.prepare(`SELECT p.id, p.object_key ${PHOTOS}`).bind(userId).all<{ id: string; object_key: string }>();
  const { results: intents } = await db.prepare("SELECT id,ngo_id FROM media_upload_intents WHERE uploaded_by=?").bind(userId).all<UploadIntent>();
  if (!results.length && !photos.length && !intents.length) return [];
  if (!env.FILES) throw new HttpError(503, "files_unavailable");
  await env.FILES.delete([...results.map((r) => objectKey(r.ngo_id, r.id)), ...photos.map((p) => p.object_key), ...intents.map((i) => objectKey(i.ngo_id, i.id))]);
  return [
    ...(hasFilesTable ? [db.prepare(`DELETE FROM ngo_files WHERE id IN (SELECT f.id ${DOOMED})`).bind(userId)] : []),
    db.prepare(`DELETE FROM ngo_photos WHERE id IN (SELECT p.id ${PHOTOS})`).bind(userId),
    db.prepare("DELETE FROM media_upload_intents WHERE uploaded_by=?").bind(userId),
  ];
}
