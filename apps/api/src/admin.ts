/**
 * Admin review of NGO applications (DEC-037, DEC-028; IMPL-0011). Only accounts with role `admin` (set by
 * hand in D1, see docs/guides/deploy.md) reach these routes. Every decision writes `audit_events` with the
 * admin's id (never an e-mail) and no personal data; the message to the applicant lives on the application.
 *
 *   GET  /admin/applications?status=…        → {applications}
 *   GET  /admin/applications/:id             → {application, applicant: {nickname}, history}
 *   POST /admin/applications/:id/decision {action, revision, note?, checks?} → {application}
 *
 * Actions: start_review, approve, request_changes (note required), reject (note required). `revision` is the
 * version the admin was looking at: if the applicant resubmitted meanwhile, the decision is refused (409
 * stale_revision) instead of applying to content nobody reviewed. Approving also requires the three DEC-015
 * checks (`checks: {activeCnpj, oneYear, fundsConfirmable}`, all true), recorded in the audit detail.
 */
import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { APPLICATION_QUERY, applicationView, type NgoRow } from "./ngo";
import { requireAdmin } from "./session";
import type { Env } from "./api";

type Action = "start_review" | "approve" | "request_changes" | "reject";

/** Allowed transitions: from-states → [ngo state, lot state]. */
const RULES: Record<Action, { from: string[]; to: string; lot: string | null }> = {
  start_review: { from: ["submitted"], to: "under_review", lot: "under_review" },
  approve: { from: ["submitted", "under_review"], to: "published", lot: "published" },
  request_changes: { from: ["submitted", "under_review"], to: "changes_requested", lot: "application_sent" },
  reject: { from: ["submitted", "under_review", "changes_requested"], to: "rejected", lot: null },
};

const STATUSES = ["submitted", "under_review", "changes_requested", "published", "rejected", "withdrawn"];

export async function listApplications(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  const status = new URL(request.url).searchParams.get("status");
  const effectiveStatus = "CASE WHEN w.ngo_id IS NOT NULL THEN 'withdrawn' ELSE n.status END";
  const where = status && STATUSES.includes(status) ? `WHERE ${effectiveStatus} = ?` : "WHERE n.applicant_id IS NOT NULL OR n.status != 'published' OR w.ngo_id IS NOT NULL";
  const stmt = env.DB!.prepare(
    `SELECT n.id, n.name, n.city, ${effectiveStatus} AS status, n.revision, n.requested_lot_id AS lotId, n.created_at AS createdAt, n.updated_at AS updatedAt
       FROM ngos n LEFT JOIN ngo_withdrawals w ON w.ngo_id = n.id ${where} ORDER BY n.updated_at DESC LIMIT 200`
  );
  const { results } = await (status && STATUSES.includes(status) ? stmt.bind(status) : stmt).all();
  return json({ applications: results }, { headers: NO_STORE });
}

export async function getApplicationAdmin(request: Request, env: Env, id: string): Promise<Response> {
  await requireAdmin(request, env);
  const db = env.DB!;
  const row = await db.prepare(`${APPLICATION_QUERY} WHERE n.id = ?`).bind(id).first<NgoRow>();
  if (!row) throw new HttpError(404, "not_found");
  const applicant = row.applicant_id ? await db.prepare("SELECT nickname FROM users WHERE id = ?").bind(row.applicant_id).first<{ nickname: string }>() : null;
  const { results } = await db
    .prepare(
      `SELECT a.at, a.action, a.detail, u.nickname AS actor FROM audit_events a LEFT JOIN users u ON u.id = a.actor
        WHERE a.subject = ? ORDER BY a.at`
    )
    .bind(`ngo:${id}`)
    .all();
  return json({ application: applicationView(row), applicant, history: results }, { headers: NO_STORE });
}

export async function decide(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  const action = body.action as Action;
  if (typeof action !== "string" || !Object.hasOwn(RULES, action)) throw new HttpError(400, "bad_action");
  const rule = RULES[action];
  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if ((action === "request_changes" || action === "reject") && note.length < 10)
    throw new HttpError(400, "note_required", { note: "Explique o motivo para a organização (mínimo de 10 caracteres)." });
  const revision = body.revision;
  if (typeof revision !== "number" || !Number.isInteger(revision)) throw new HttpError(400, "revision_required");
  const raw = (body.checks ?? {}) as Record<string, unknown>;
  const checks = { activeCnpj: raw.activeCnpj === true, oneYear: raw.oneYear === true, fundsConfirmable: raw.fundsConfirmable === true };
  if (action === "approve" && !(checks.activeCnpj && checks.oneYear && checks.fundsConfirmable)) throw new HttpError(400, "checks_required");
  const db = env.DB!;
  const row = await db.prepare("SELECT * FROM ngos WHERE id = ?").bind(id).first<NgoRow>();
  if (!row) throw new HttpError(404, "not_found");
  if (row.revision !== revision) throw new HttpError(409, "stale_revision");
  if (!rule.from.includes(row.status)) throw new HttpError(409, "bad_transition");
  // Nobody reviews their own organisation (conflict of interest).
  if (row.applicant_id === admin.id) throw new HttpError(403, "self_review");

  const now = new Date().toISOString();
  const lot = row.requested_lot_id;
  // The lot and audit writes happen only if this request's status change went through (same transaction):
  // a concurrent decision that loses the race writes nothing.
  const MINE = "EXISTS (SELECT 1 FROM ngos WHERE id = ? AND status = ? AND updated_at = ?)";
  const statements = [
    db.prepare("UPDATE ngos SET status = ?, review_note = ?, updated_at = ? WHERE id = ? AND status = ? AND revision = ?").bind(
      rule.to, action === "request_changes" || action === "reject" ? note : row.review_note, now, id, row.status, revision
    ),
    rule.lot
      ? db.prepare(`UPDATE lots SET state = ?, ngo_id = ? WHERE id = ? AND ngo_id = ? AND ${MINE}`).bind(rule.lot, id, lot, id, id, rule.to, now)
      : db.prepare(`UPDATE lots SET state = 'available', ngo_id = NULL WHERE id = ? AND ngo_id = ? AND ${MINE}`).bind(lot, id, id, rule.to, now),
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, ?, ?, ? WHERE ${MINE}`).bind(
      newId(), admin.id, `ngo.${action}`, `ngo:${id}`, JSON.stringify({ from: row.status, to: rule.to, lot, revision, hasNote: Boolean(note), ...(action === "approve" ? { checks } : {}) }), id, rule.to, now
    ),
  ];
  const [updated] = await db.batch(statements);
  if (!updated.meta.changes) {
    const latest = await db.prepare("SELECT revision FROM ngos WHERE id = ?").bind(id).first<{ revision: number }>();
    throw new HttpError(409, latest && latest.revision !== revision ? "stale_revision" : "bad_transition");
  }
  const after = await db.prepare(`${APPLICATION_QUERY} WHERE n.id = ?`).bind(id).first<NgoRow>();
  return json({ application: applicationView(after!) }, { headers: NO_STORE });
}
