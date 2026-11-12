/**
 * Administrative withdrawal of a published NGO (IMPL-0020; DEC-037). PROPOSTA: on only when
 * NGO_WITHDRAWAL_ENABLED = "true" ("false" in production and staging). What a withdrawal means for the account,
 * the CNPJ, re-entry and retention is an open product question (OQ-14); nothing here settles it.
 *
 *   POST /admin/ngos/:id/withdraw {accountId, revision, reason} → {application}
 *
 * `reason` is the message to the organisation: the applicant reads it word for word in `GET /ngo/application`
 * (`withdrawal.reason`). It is not an internal note; there is none.
 *
 * What the code does today, with no undo route:
 *   - the row in `ngos` keeps `status = 'published'`; the ledger `ngo_withdrawals` (migration 0009) marks it, and
 *     signed-in and admin reads show the effective status `withdrawn`;
 *   - every lot the NGO actually holds goes back to `available`, which removes it from every public projection
 *     (they all require the published lot; none reads the ledger);
 *   - because the stored status stays `published`, the owner's account cannot apply again (0005 unique index) and
 *     the CNPJ stays taken;
 *   - files and photos stay stored; the applicant may still remove their own, never add or change any.
 *
 * One batch, guarded by this operation's token: only the winning request releases lots and writes the audit row.
 * The audit detail carries ids and the revision, never the message.
 */
import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { APPLICATION_QUERY, applicationView, type NgoRow } from "./ngo";
import { assertAccount, requireAdmin } from "./session";
import type { Env } from "./api";

export async function withdrawNgo(request: Request, env: Env, id: string): Promise<Response> {
  if (env.NGO_WITHDRAWAL_ENABLED !== "true") throw new HttpError(404, "not_found");
  const admin = await requireAdmin(request, env);
  const body = await readJson(request); assertAccount(body, admin);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new HttpError(404, "not_found");
  if (!Number.isSafeInteger(body.revision) || (body.revision as number) < 1) throw new HttpError(400, "revision_required");
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  // Match SQLite length(): Unicode code points; embedded NUL would truncate its count.
  const reasonLength = Array.from(reason).length;
  if (reason.includes("\0") || reasonLength < 10 || reasonLength > 1000)
    throw new HttpError(400, "reason_required", { reason: "Escreva a mensagem para a organização (10 a 1000 caracteres). Ela lê este texto." });
  const db = env.DB!;
  const READ = `SELECT n.*, w.reason AS withdrawal_reason, w.withdrawn_at, COALESCE(u.files_deleting,0) AS files_deleting
    FROM ngos n LEFT JOIN ngo_withdrawals w ON w.ngo_id = n.id LEFT JOIN users u ON u.id = n.applicant_id WHERE n.id = ?`;
  const row = await db.prepare(READ).bind(id).first<NgoRow & { files_deleting: number }>();
  if (!row) throw new HttpError(404, "not_found");
  if (row.applicant_id === admin.id) throw new HttpError(403, "self_review");
  if (row.withdrawn_at) throw new HttpError(409, "application_withdrawn");
  // Account erasure decides which files stay by whether the NGO still holds its lot: wait until it finishes.
  if (row.files_deleting) throw new HttpError(409, "account_deleting");
  if (row.revision !== body.revision) throw new HttpError(409, "stale_revision");
  if (row.status !== "published") throw new HttpError(409, "bad_transition");

  const token = newId(), now = new Date().toISOString();
  const mine = "EXISTS (SELECT 1 FROM ngo_withdrawals WHERE ngo_id = ? AND operation_token = ?)";
  const [inserted] = await db.batch([
    db.prepare(`INSERT INTO ngo_withdrawals(ngo_id,operation_token,reason,actor,withdrawn_at,revision,lot_ids)
      SELECT n.id,?,?,?,?,n.revision + 1,(SELECT json_group_array(id) FROM (SELECT id FROM lots WHERE ngo_id = n.id ORDER BY id))
      FROM ngos n WHERE n.id = ? AND n.status = 'published' AND n.revision = ?
        AND NOT EXISTS (SELECT 1 FROM ngo_withdrawals w WHERE w.ngo_id = n.id)
        AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = n.applicant_id AND u.files_deleting = 1)`)
      .bind(token, reason, admin.id, now, id, body.revision),
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ? WHERE id = ? AND ${mine}`).bind(now, id, id, token),
    // requested_lot_id is historical application data; revoke only the actual current associations.
    db.prepare(`UPDATE lots SET state = 'available', ngo_id = NULL WHERE ngo_id = ? AND ${mine}`).bind(id, id, token),
    db.prepare(`INSERT INTO audit_events(id,actor,action,subject,detail)
      SELECT ?,?,'ngo.withdraw',?,json_object('from','published','to','withdrawn','revision',revision,'lots',json(lot_ids),'hasReason',json('true'))
      FROM ngo_withdrawals WHERE ngo_id = ? AND operation_token = ?`).bind(newId(), admin.id, `ngo:${id}`, id, token),
  ]);
  if (!inserted.meta.changes) {
    // Lost a race: say what won (another withdrawal, an account erasure, or a change of revision).
    const latest = await db.prepare(READ).bind(id).first<NgoRow & { files_deleting: number }>();
    if (latest?.withdrawn_at) throw new HttpError(409, "application_withdrawn");
    if (latest?.files_deleting) throw new HttpError(409, "account_deleting");
    throw new HttpError(409, "stale_revision");
  }
  const after = await db.prepare(`${APPLICATION_QUERY} WHERE n.id = ?`).bind(id).first<NgoRow>();
  return json({ application: applicationView(after!) }, { headers: NO_STORE });
}
