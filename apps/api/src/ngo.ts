/**
 * NGO application (P12; DEC-015, DEC-037; IMPL-0011). A signed-in, verified account applies for one lot.
 *
 *   GET  /ngo/application  → {application | null, files}   (the caller's own; `files` is empty unless IMPL-0017 is on)
 *   POST /ngo/application {accountId, …} → 201/200 {application, files}   (submit, or resubmit after "changes requested" / rejection)
 *
 * States (PROPOSTA names from the plan): submitted → under_review → published | changes_requested | rejected.
 * The lot is reserved on submission (`application_sent`), follows the review (`under_review`), is published
 * only by an admin approval, and is released on rejection. Nothing is public before approval.
 */
import { validateApplication, type NgoApplication } from "@vila/shared/accounts/validate";

import { newId } from "./crypto";
import { listFiles } from "./files";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { assertAccount, requireUser } from "./session";
import type { Env } from "./api";

export interface NgoRow {
  id: string;
  name: string;
  cnpj: string;
  cnpj_opened_on: string;
  city: string;
  summary: string;
  description: string;
  funds_confirmation: string;
  declarations: string;
  tags: string;
  projects: string;
  requested_lot_id: string;
  status: string;
  revision: number;
  review_note: string | null;
  applicant_id: string | null;
  created_at: string;
  updated_at: string;
}

export const applicationView = (r: NgoRow) => ({
  id: r.id,
  name: r.name,
  cnpj: r.cnpj,
  openedOn: r.cnpj_opened_on,
  city: r.city,
  summary: r.summary,
  description: r.description,
  fundsConfirmation: r.funds_confirmation,
  declarations: JSON.parse(r.declarations ?? "{}") as NgoApplication["declarations"],
  tags: JSON.parse(r.tags ?? "[]") as string[],
  projects: JSON.parse(r.projects ?? "[]") as NgoApplication["projects"],
  lotId: r.requested_lot_id,
  status: r.status,
  revision: r.revision,
  reviewNote: r.review_note,
  createdAt: r.created_at,
  updatedAt: r.updated_at,
});

const ACTIVE = ["submitted", "under_review", "published"];

export async function myApplication(env: Env, userId: string): Promise<NgoRow | null> {
  return env.DB!.prepare("SELECT * FROM ngos WHERE applicant_id = ? ORDER BY created_at DESC LIMIT 1").bind(userId).first<NgoRow>();
}

export async function getApplication(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const row = await myApplication(env, user.id);
  return json({ application: row ? applicationView(row) : null, files: row ? await listFiles(env, row.id) : [] }, { headers: NO_STORE });
}

export async function submitApplication(request: Request, env: Env, today = new Date()): Promise<Response> {
  const user = await requireUser(request, env);
  if (!user.verified_at) throw new HttpError(403, "not_verified");
  const body = await readJson(request, 32_000);
  assertAccount(body, user);
  const { value, errors } = validateApplication(body, today);
  if (Object.keys(errors).length) throw new HttpError(400, "invalid", errors as Record<string, string>);
  const db = env.DB!;
  const current = await myApplication(env, user.id);
  if (current && ACTIVE.includes(current.status)) throw new HttpError(409, "application_active");

  const lot = await db.prepare("SELECT id, state, ngo_id FROM lots WHERE id = ?").bind(value.lotId).first<{ id: string; state: string; ngo_id: string | null }>();
  const ngoId = current?.id ?? newId();
  if (!lot || !(lot.state === "available" || lot.ngo_id === ngoId)) throw new HttpError(409, "lot_unavailable", { lotId: "Esse terreno não está mais disponível. Escolha outro." });
  const other = await db.prepare("SELECT id FROM ngos WHERE cnpj = ? AND id != ?").bind(value.cnpj, ngoId).first();
  if (other) throw new HttpError(409, "cnpj_in_use", { cnpj: "Já existe uma candidatura com esse CNPJ." });

  const fields = [
    value.name, value.cnpj, value.openedOn, value.city, value.summary, value.description, value.fundsConfirmation,
    JSON.stringify(value.declarations), JSON.stringify(value.tags), JSON.stringify(value.projects), value.lotId,
  ];
  const now = new Date().toISOString();
  const revision = current ? current.revision + 1 : 1;
  const LOT_HELD = "EXISTS (SELECT 1 FROM lots WHERE id = ? AND ngo_id = ?)";
  const EDITABLE = "status IN ('changes_requested', 'rejected')";
  /*
   * One transaction where every write is guarded by the previous one: reserve the lot (only if the lot is
   * free and the application is still in the state we read) → write the application (only if the lot is
   * now ours) → release an old lot and audit (only if the application now has the new revision). A lost
   * race makes the guards false and nothing is written; foreign keys are checked at commit, so a new row
   * may be referenced by the lot before it exists in the same transaction.
   */
  const statements = [db.prepare("PRAGMA defer_foreign_keys = true")];
  if (current) {
    statements.push(
      db.prepare(
        `UPDATE lots SET state = 'application_sent', ngo_id = ? WHERE id = ? AND (state = 'available' OR ngo_id = ?)
           AND EXISTS (SELECT 1 FROM ngos WHERE id = ? AND ${EDITABLE} AND revision = ?)`
      ).bind(ngoId, value.lotId, ngoId, ngoId, current.revision),
      db.prepare(
        `UPDATE ngos SET name = ?, cnpj = ?, cnpj_opened_on = ?, city = ?, summary = ?, description = ?, funds_confirmation = ?,
                declarations = ?, tags = ?, projects = ?, requested_lot_id = ?, status = 'submitted', revision = ?,
                review_note = NULL, updated_at = ? WHERE id = ? AND ${EDITABLE} AND revision = ? AND ${LOT_HELD}`
      ).bind(...fields, revision, now, ngoId, current.revision, value.lotId, ngoId)
    );
    if (current.requested_lot_id && current.requested_lot_id !== value.lotId)
      statements.push(
        db.prepare(
          `UPDATE lots SET state = 'available', ngo_id = NULL WHERE id = ? AND ngo_id = ? AND state != 'published'
             AND EXISTS (SELECT 1 FROM ngos WHERE id = ? AND revision = ? AND status = 'submitted')`
        ).bind(current.requested_lot_id, ngoId, ngoId, revision)
      );
  } else {
    statements.push(
      db.prepare(
        `UPDATE lots SET state = 'application_sent', ngo_id = ? WHERE id = ? AND state = 'available'
           AND NOT EXISTS (SELECT 1 FROM ngos WHERE applicant_id = ? AND status IN ('submitted', 'under_review', 'changes_requested', 'published'))`
      ).bind(ngoId, value.lotId, user.id),
      db.prepare(
        `INSERT INTO ngos (name, cnpj, cnpj_opened_on, city, summary, description, funds_confirmation, declarations, tags, projects,
                           requested_lot_id, id, applicant_id, status)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted' WHERE ${LOT_HELD}`
      ).bind(...fields, ngoId, user.id, value.lotId, ngoId)
    );
  }
  statements.push(
    db.prepare(
      "INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM ngos WHERE id = ? AND revision = ? AND status = 'submitted')"
    ).bind(newId(), user.id, current ? "ngo.resubmit" : "ngo.submit", `ngo:${ngoId}`, JSON.stringify({ lot: value.lotId, revision }), ngoId, revision)
  );
  let written = 0;
  try {
    written = (await db.batch(statements))[2].meta.changes;
  } catch (err) {
    // A constraint at commit (CNPJ taken, second active application) means nothing was written; any other
    // database failure is a real error, not "lot unavailable".
    if (!/constraint/i.test(err instanceof Error ? err.message : String(err))) throw err;
    written = 0;
  }
  if (!written) {
    const active = await myApplication(env, user.id);
    if (active && ACTIVE.includes(active.status) && active.revision !== revision) throw new HttpError(409, "application_active");
    const dup = await db.prepare("SELECT id FROM ngos WHERE cnpj = ? AND id != ?").bind(value.cnpj, ngoId).first();
    if (dup) throw new HttpError(409, "cnpj_in_use", { cnpj: "Já existe uma candidatura com esse CNPJ." });
    throw new HttpError(409, "lot_unavailable", { lotId: "Esse terreno acabou de ser escolhido. Escolha outro." });
  }
  const row = await myApplication(env, user.id);
  return json({ application: applicationView(row!), files: await listFiles(env, row!.id) }, { status: current ? 200 : 201, headers: NO_STORE });
}
