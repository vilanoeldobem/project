import { accountJson, localAuthAvailable, readBody, sessionUser, type AuthEnv } from "./auth";

export interface NgoEnv extends AuthEnv { ADMIN_USER_IDS?: string; }
interface Application {
  id: string; ngoId: string; lotId: string; name: string; cnpj: string; openedOn: string; summary: string;
  status: string; revision: number; feedback: string; createdAt: string; updatedAt: string;
}
const select = `SELECT a.id, a.ngo_id AS ngoId, a.requested_lot_id AS lotId, n.name, n.cnpj,
  n.cnpj_opened_on AS openedOn, n.summary, n.status, n.revision, a.feedback,
  n.created_at AS createdAt, n.updated_at AS updatedAt FROM ngo_applications a JOIN ngos n ON n.id = a.ngo_id`;
const exact = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).every((key) => keys.includes(key));
const text = (value: unknown, min: number, max: number, multiline = false) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max &&
  !(multiline ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/ : /[\u0000-\u001f\u007f]/).test(value) ? value.trim() : null;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Numeric format/checksum only; active registration still requires a human attestation. */
export function validCnpj(value: string) {
  if (!/^\d{14}$/.test(value) || /^(\d)\1+$/.test(value)) return false;
  const digit = (count: number) => {
    let weight = count - 7;
    const sum = [...value.slice(0, count)].reduce((total, n) => { const result = total + Number(n) * weight; weight = weight === 2 ? 9 : weight - 1; return result; }, 0);
    return sum % 11 < 2 ? 0 : 11 - sum % 11;
  };
  return digit(12) === Number(value[12]) && digit(13) === Number(value[13]);
}

function form(body: Record<string, unknown>, resubmit = false) {
  if (!exact(body, ["name", "cnpj", "openedOn", "summary", "lotId", ...(resubmit ? ["expectedRevision"] : [])])) return null;
  const name = text(body.name, 2, 120), summary = text(body.summary, 10, 2000, true), lotId = text(body.lotId, 1, 80);
  if (!name || !summary || !lotId || typeof body.cnpj !== "string" || !validCnpj(body.cnpj) || typeof body.openedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.openedOn)) return null;
  const opened = new Date(`${body.openedOn}T00:00:00Z`);
  const anniversary = new Date(); anniversary.setUTCFullYear(anniversary.getUTCFullYear() - 1);
  if (!Number.isFinite(opened.getTime()) || opened.toISOString().slice(0, 10) !== body.openedOn || body.openedOn > anniversary.toISOString().slice(0, 10)) return null;
  return { name, summary, lotId, cnpj: body.cnpj, openedOn: body.openedOn };
}

const revision = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value) && value > 0;

export async function handleNgoApplications(request: Request, env: NgoEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  const admin = path.startsWith("/admin/");
  const match = path.match(/^\/(?:admin\/)?ngo-applications(?:\/([0-9a-f-]{36})(\/review)?)?$/);
  if (!match || (admin ? Boolean(match[1]) !== Boolean(match[2]) : Boolean(match[2]))) return accountJson({ error: "not_found" }, 404);
  const id = match[1];
  const methods = admin ? (id ? ["POST"] : ["GET"]) : id ? ["GET", "PUT"] : ["GET", "POST"];
  if (!methods.includes(request.method)) return accountJson({ error: "method_not_allowed" }, 405, { Allow: methods.join(", ") });
  if (!localAuthAvailable(request, env) || !env.DB) return accountJson({ error: "auth_unavailable" }, 503);
  const db = env.DB;
  const user = await sessionUser(request, db);
  if (!user) return accountJson({ error: "unauthorized" }, 401);
  if (request.headers.get("X-Account-ID") !== user.id) return accountJson({ error: "account_changed" }, 409);
  const canReview = (env.ADMIN_USER_IDS ?? "").split(",").map((value) => value.trim()).filter((value) => uuid.test(value)).includes(user.id);
  if (admin && !canReview) return accountJson({ error: "forbidden" }, 403);
  if (request.method === "GET") {
    if (id) {
      const application = await db.prepare(`${select} WHERE a.id = ? AND a.owner_id = ?`).bind(id, user.id).first<Application>();
      return application ? accountJson({ application, canReview }) : accountJson({ error: "not_found" }, 404);
    }
    const query = admin ? `${select} ORDER BY n.created_at, a.id LIMIT 100` : `${select} WHERE a.owner_id = ? ORDER BY n.created_at, a.id LIMIT 100`;
    const statement = db.prepare(query);
    const { results } = await (admin ? statement : statement.bind(user.id)).all<Application>();
    return accountJson({ applications: results, canReview });
  }
  if (request.headers.get("Origin") !== env.AUTH_PAGE_ORIGIN || request.headers.get("Sec-Fetch-Site") === "cross-site") return accountJson({ error: "origin_forbidden" }, 403);
  const body = await readBody(request, 8192);
  if (!body) return accountJson({ error: "invalid_body" }, 400);
  const now = new Date().toISOString();
  if (!id) {
    const values = form(body);
    if (!values) return accountJson({ error: "invalid_fields" }, 400);
    const lot = await db.prepare("SELECT id FROM lots WHERE id = ? AND state = 'available' AND ngo_id IS NULL").bind(values.lotId).first();
    if (!lot) return accountJson({ error: "lot_unavailable" }, 409);
    const applicationId = crypto.randomUUID(), ngoId = crypto.randomUUID();
    try {
      await db.batch([
        db.prepare("INSERT INTO ngos (id, name, cnpj, cnpj_opened_on, summary, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, 'submitted', ?, ?)").bind(ngoId, values.name, values.cnpj, values.openedOn, values.summary, now, now),
        db.prepare("INSERT INTO ngo_applications (id, ngo_id, owner_id, requested_lot_id) VALUES (?, ?, ?, ?)").bind(applicationId, ngoId, user.id, values.lotId),
      ]);
    } catch (error) {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: ngos.cnpj")) return accountJson({ error: "cnpj_exists" }, 409);
      throw error;
    }
    return accountJson({ application: await db.prepare(`${select} WHERE a.id = ?`).bind(applicationId).first<Application>(), canReview }, 201);
  }
  const application = await db.prepare(`${select} WHERE a.id = ?${admin ? "" : " AND a.owner_id = ?"}`).bind(...(admin ? [id] : [id, user.id])).first<Application>();
  if (!application) return accountJson({ error: "not_found" }, 404);
  if (!revision(body.expectedRevision) || application.revision !== body.expectedRevision) return accountJson({ error: "revision_conflict" }, 409);
  const mutation = crypto.randomUUID();
  if (!admin) {
    const values = form(body, true);
    if (!values) return accountJson({ error: "invalid_fields" }, 400);
    if (application.status !== "changes_requested") return accountJson({ error: "invalid_transition" }, 409);
    const result = await db.batch([
      db.prepare(`UPDATE ngo_applications SET mutation_id = ?, requested_lot_id = ? WHERE id = ? AND owner_id = ?
        AND EXISTS (SELECT 1 FROM ngos n WHERE n.id = ngo_id AND n.revision = ? AND n.status = 'changes_requested')
        AND EXISTS (SELECT 1 FROM lots WHERE id = ? AND state = 'available' AND ngo_id IS NULL)`)
        .bind(mutation, values.lotId, id, user.id, body.expectedRevision, values.lotId),
      db.prepare(`UPDATE ngos SET name = ?, cnpj = ?, cnpj_opened_on = ?, summary = ?, status = 'submitted', revision = revision + 1, updated_at = ?
        WHERE id = ? AND revision = ? AND EXISTS (SELECT 1 FROM ngo_applications WHERE id = ? AND mutation_id = ?)`)
        .bind(values.name, values.cnpj, values.openedOn, values.summary, now, application.ngoId, body.expectedRevision, id, mutation),
    ]).catch((error: unknown) => {
      if (error instanceof Error && error.message.includes("UNIQUE constraint failed: ngos.cnpj")) return null;
      throw error;
    });
    if (!result) return accountJson({ error: "cnpj_exists" }, 409);
    if (result[0].meta.changes !== 1) return accountJson({ error: "revision_conflict" }, 409);
  } else {
    if (!exact(body, ["expectedRevision", "action", "feedback", "eligibility"])) return accountJson({ error: "invalid_fields" }, 400);
    const transitions: Record<string, { from: string; to: string }> = {
      start_review: { from: "submitted", to: "under_review" }, request_changes: { from: "under_review", to: "changes_requested" },
      reject: { from: "under_review", to: "rejected" }, approve: { from: "under_review", to: "published" },
    };
    const transition = typeof body.action === "string" ? transitions[body.action] : undefined;
    if (!transition || application.status !== transition.from) return accountJson({ error: "invalid_transition" }, 409);
    const feedback = body.feedback === undefined ? "" : text(body.feedback, 0, 2000, true);
    if (feedback === null || (["request_changes", "reject"].includes(String(body.action)) && !feedback)) return accountJson({ error: "invalid_fields" }, 400);
    const approve = body.action === "approve";
    const eligibility = body.eligibility;
    if (approve && (!eligibility || typeof eligibility !== "object" || Array.isArray(eligibility) ||
      !exact(eligibility as Record<string, unknown>, ["activeCnpj", "minimumAge", "fundsVerification"]) ||
      (eligibility as Record<string, unknown>).activeCnpj !== true ||
      (eligibility as Record<string, unknown>).minimumAge !== true || (eligibility as Record<string, unknown>).fundsVerification !== true)) return accountJson({ error: "invalid_eligibility" }, 400);
    // The first conditional mutation wins; every dependent statement requires its fresh marker.
    // A zero-row D1 update does not roll back a batch, so revision checks alone are insufficient.
    const statements = [db.prepare(`UPDATE ngo_applications SET mutation_id = ? WHERE id = ?
      AND EXISTS (SELECT 1 FROM ngos n WHERE n.id = ngo_id AND n.revision = ? AND n.status = ?)
      ${approve ? "AND EXISTS (SELECT 1 FROM lots l WHERE l.id = requested_lot_id AND l.state = 'available' AND l.ngo_id IS NULL)" : ""}`)
      .bind(mutation, id, body.expectedRevision, transition.from)];
    if (approve) statements.push(db.prepare(`UPDATE lots SET ngo_id = ?, state = 'published' WHERE id = ? AND state = 'available' AND ngo_id IS NULL
      AND EXISTS (SELECT 1 FROM ngo_applications WHERE id = ? AND mutation_id = ?)`)
      .bind(application.ngoId, application.lotId, id, mutation));
    statements.push(
      db.prepare(`UPDATE ngos SET status = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM ngo_applications WHERE id = ? AND mutation_id = ?)
        ${approve ? "AND EXISTS (SELECT 1 FROM lots WHERE id = ? AND ngo_id = ?)" : ""}`)
        .bind(transition.to, now, application.ngoId, body.expectedRevision, id, mutation, ...(approve ? [application.lotId, application.ngoId] : [])),
      db.prepare("UPDATE ngo_applications SET feedback = ? WHERE id = ? AND mutation_id = ?").bind(feedback, id, mutation),
      db.prepare(`INSERT INTO audit_events (id, at, actor, action, subject, detail) SELECT ?, ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM ngo_applications a JOIN ngos n ON n.id = a.ngo_id WHERE a.id = ? AND a.mutation_id = ? AND n.revision = ? AND n.status = ?)`)
        .bind(mutation, now, user.id, `ngo.${body.action}`, `ngo:${application.ngoId}`, JSON.stringify({ revision: body.expectedRevision + 1, eligibility: approve ? eligibility : undefined }), id, mutation, body.expectedRevision + 1, transition.to),
    );
    const result = await db.batch(statements);
    if (result[0].meta.changes !== 1) return accountJson({ error: "revision_conflict" }, 409);
  }
  return accountJson({ application: await db.prepare(`${select} WHERE a.id = ?`).bind(id).first<Application>(), canReview });
}
