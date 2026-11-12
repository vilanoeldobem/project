/** Administrative withdrawal (DEC-037, IMPL-0020): retain history and release actual occupied lots. */
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
    throw new HttpError(400, "reason_required", { reason: "Explique o motivo da retirada (10 a 1000 caracteres)." });
  const db = env.DB!;
  const row = await db.prepare(`${APPLICATION_QUERY} WHERE n.id = ?`).bind(id).first<NgoRow>();
  if (!row) throw new HttpError(404, "not_found");
  if (row.applicant_id === admin.id) throw new HttpError(403, "self_review");
  if (row.withdrawn_at) throw new HttpError(409, "application_withdrawn");
  if (row.revision !== body.revision) throw new HttpError(409, "stale_revision");
  if (row.status !== "published") throw new HttpError(409, "bad_transition");

  const token = newId(), now = new Date().toISOString();
  const mine = "EXISTS (SELECT 1 FROM ngo_withdrawals WHERE ngo_id = ? AND operation_token = ?)";
  const [inserted] = await db.batch([
    db.prepare(`INSERT INTO ngo_withdrawals(ngo_id,operation_token,reason,actor,withdrawn_at,revision,lot_ids)
      SELECT n.id,?,?,?,?,n.revision + 1,(SELECT json_group_array(id) FROM (SELECT id FROM lots WHERE ngo_id = n.id ORDER BY id))
      FROM ngos n WHERE n.id = ? AND n.status = 'published' AND n.revision = ?
        AND NOT EXISTS (SELECT 1 FROM ngo_withdrawals w WHERE w.ngo_id = n.id)`)
      .bind(token, reason, admin.id, now, id, body.revision),
    db.prepare(`UPDATE ngos SET revision = revision + 1, updated_at = ? WHERE id = ? AND ${mine}`).bind(now, id, id, token),
    // requested_lot_id is historical application data; revoke only the actual current associations.
    db.prepare(`UPDATE lots SET state = 'available', ngo_id = NULL WHERE ngo_id = ? AND ${mine}`).bind(id, id, token),
    db.prepare(`INSERT INTO audit_events(id,actor,action,subject,detail)
      SELECT ?,?,'ngo.withdraw',?,json_object('from','published','to','withdrawn','revision',revision,'lots',json(lot_ids),'hasReason',json('true'))
      FROM ngo_withdrawals WHERE ngo_id = ? AND operation_token = ?`).bind(newId(), admin.id, `ngo:${id}`, id, token),
  ]);
  if (!inserted.meta.changes) throw new HttpError(409, "stale_revision");
  const after = await db.prepare(`${APPLICATION_QUERY} WHERE n.id = ?`).bind(id).first<NgoRow>();
  return json({ application: applicationView(after!) }, { headers: NO_STORE });
}
