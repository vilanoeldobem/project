/**
 * Read-only lists for the backoffice dashboard (apps/dash, dash.vilanoeldobem.com.br; IMPL-0015). Admin only
 * (`requireAdmin`), never cached (the router adds `no-store` to every account route).
 *
 *   GET /admin/audit?before=<ISO>&limit=<1..100> → {events: [{at, action, subject, detail, actor}], next}
 *   GET /admin/users?before=<ISO>&limit=<1..100> → {users: [{id, nickname, role, city, createdAt, verified, blocked}], next}
 *
 * Newest first. `next` is the `before` of the following page, or null on the last one.
 *
 * Data minimisation (LGPD; minors are a likely audience): the users list carries no e-mail and no name — only
 * the nickname is public, and the dashboard holds the minimum; `blocked` says a block is in force, never its
 * message (IMPL-0021). `actor` is a nickname, never an id or an e-mail.
 * Reading these lists writes no `audit_events` row: only mutations are audited (DEC-037, AGENTS.md).
 */
import { SUMMARY_COLUMNS, summaryView } from "./account-moderation";
import { HttpError, json, NO_STORE } from "./http";
import { requireAdmin } from "./session";
import type { Env } from "./api";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;
/** UTC instant as the API writes it (`…Z`, optional milliseconds). */
const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;
/** Sorts after every stored instant (the columns hold ISO text, compared as text). */
const NO_UPPER_BOUND = "9999-12-31T23:59:59.999Z";

interface Page {
  /** Only rows strictly before this instant (normalised to the stored `YYYY-MM-DDTHH:MM:SS.mmmZ` form). */
  before: string;
  limit: number;
}

function pageParams(request: Request): Page {
  const query = new URL(request.url).searchParams;
  const rawLimit = query.get("limit");
  const limit = rawLimit === null ? DEFAULT_LIMIT : /^\d{1,3}$/.test(rawLimit) ? Number(rawLimit) : NaN;
  if (!(limit >= 1 && limit <= MAX_LIMIT)) throw new HttpError(400, "bad_limit");
  const rawBefore = query.get("before");
  if (rawBefore === null) return { before: NO_UPPER_BOUND, limit };
  const at = ISO_INSTANT.test(rawBefore) ? Date.parse(rawBefore) : NaN;
  if (Number.isNaN(at)) throw new HttpError(400, "bad_before");
  return { before: new Date(at).toISOString(), limit };
}

/**
 * WHERE clause of one page of `table`, newest first by `column` (ISO text): the `limit` newest rows before the
 * cursor, plus every row that shares the instant of the last one. Without those, the next page (which starts
 * strictly before that instant) would skip them; so a page can be slightly longer than `limit`.
 * Binds: before, before, limit. `table`, `column` and `outer` are constants of this module, never request data.
 */
const pageWhere = (table: string, column: string, outer = column) =>
  `${outer} < ? AND ${outer} >= COALESCE((SELECT MIN(${column}) FROM (SELECT ${column} FROM ${table} WHERE ${column} < ? ORDER BY ${column} DESC LIMIT ?)), '')`;

/** The cursor of the following page: the instant of the last row, when older rows exist. */
async function nextCursor(db: D1Database, table: string, column: string, last: string | undefined): Promise<string | null> {
  if (!last) return null;
  const older = await db.prepare(`SELECT 1 AS x FROM ${table} WHERE ${column} < ? LIMIT 1`).bind(last).first();
  return older ? last : null;
}

interface AuditRow {
  at: string;
  action: string;
  subject: string;
  detail: string | null;
  actor: string | null;
}

export async function listAudit(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  const { before, limit } = pageParams(request);
  const db = env.DB!;
  const { results } = await db
    .prepare(
      `SELECT a.at, a.action, a.subject, a.detail, u.nickname AS actor
         FROM audit_events a LEFT JOIN users u ON u.id = a.actor
        WHERE ${pageWhere("audit_events", "at", "a.at")}
        ORDER BY a.at DESC, a.id DESC`
    )
    .bind(before, before, limit)
    .all<AuditRow>();
  return json({ events: results, next: await nextCursor(db, "audit_events", "at", results.at(-1)?.at) }, { headers: NO_STORE });
}

export async function listUsers(request: Request, env: Env): Promise<Response> {
  await requireAdmin(request, env);
  const { before, limit } = pageParams(request);
  const db = env.DB!;
  // The column list is the whole point: no `email`, no `name` (see the header).
  const { results } = await db
    .prepare(
      `SELECT ${SUMMARY_COLUMNS}
         FROM users
        WHERE ${pageWhere("users", "created_at")}
        ORDER BY created_at DESC, id DESC`
    )
    .bind(before, before, limit)
    .all<Parameters<typeof summaryView>[0]>();
  return json({ users: results.map(summaryView), next: await nextCursor(db, "users", "created_at", results.at(-1)?.createdAt) }, { headers: NO_STORE });
}
