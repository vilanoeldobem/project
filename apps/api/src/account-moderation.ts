/**
 * Roles and account block, managed from the backoffice dashboard (IMPL-0021; DEC-037). Admin only; every change
 * writes `audit_events` with ids and no free text.
 *
 *   POST /admin/users/:id/role    {accountId, role: "player" | "admin"} → {user}
 *   POST /admin/users/:id/block   {accountId, message}                  → {user}
 *   POST /admin/users/:id/unblock {accountId}                           → {user}
 *
 * Roles: two stored values, `player` (people read "Padrão") and `admin` ("Administrador"). Nobody changes their
 * own role, so an administrator always remains; the first one is still created with the documented database
 * command. Setting the role an account already has answers 200 and writes nothing. A demotion revokes nothing
 * else: the demoted person's next admin request answers 403 admin_only.
 *
 * Account block is PROPOSTA: new blocks only when ACCOUNT_BLOCK_ENABLED = "true" ("false" in production and
 * staging). Which sanctions exist, who applies them, appeal, duration and notice are an open product question
 * (OQ-11); nothing here settles it. A block already recorded stays in force with the flag off, and lifting one is
 * never gated by the flag.
 *
 * `message` is the message to the blocked person: they read it word for word in `GET /me` (`blocked.message`). It
 * is not an internal note; there is none. What a block does (session.ts, auth.ts): every session of the account
 * ends; from then on its sign-in link opens a restricted session that only reads `GET /me`, signs out and deletes
 * the account (`DELETE /me`); every other signed-in route answers 403 session_blocked. The sign-in answers are the
 * same as for any other e-mail. An administrator is never blocked: demote first.
 *
 * One batch per change, guarded twice in SQL: the target is still in the state this request read, and the actor
 * is still an administrator when the batch commits. Only the winning request writes the ledger and the audit row
 * (`moderation_token`). Because the actor is an administrator other than the target, a demotion can never remove
 * the last administrator: of two administrators demoting each other at once, exactly one wins.
 */
import { BLOCK_MESSAGE_ERROR, cleanBlockMessage } from "@vila/shared/accounts/moderation";

import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { assertAccount, assertStillAdmin, requireAdmin, STILL_ADMIN as ACTOR } from "./session";
import type { Env } from "./api";

interface SummaryRow {
  id: string;
  nickname: string;
  role: "player" | "admin";
  city: string;
  createdAt: string;
  verified: number;
  blocked: number;
}

/** What the administration sees of an account: no `email`, no `name`, never the block message (data minimisation). */
export const SUMMARY_COLUMNS = "id, nickname, role, city, created_at AS createdAt, verified_at IS NOT NULL AS verified, blocked";
export const summaryView = (u: SummaryRow) => ({ ...u, verified: Boolean(u.verified), blocked: Boolean(u.blocked) });

const summary = (db: D1Database, id: string) => db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM users WHERE id = ?`).bind(id).first<SummaryRow>();
const answer = (u: SummaryRow) => json({ user: summaryView(u) }, { headers: NO_STORE });

/** This request's change is the one that went through. Binds: the target's id, the token. */
const MINE = "EXISTS (SELECT 1 FROM users WHERE id = ? AND moderation_token = ?)";

/** The block in force on an account: the message the person reads, and when it was recorded. */
export async function activeBlock(db: D1Database, userId: string): Promise<{ message: string; at: string } | null> {
  return db.prepare("SELECT message, blocked_at AS at FROM account_blocks WHERE user_id = ? AND lifted_at IS NULL").bind(userId).first<{ message: string; at: string }>();
}

export async function changeRole(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  assertAccount(body, admin);
  const role = body.role;
  if (role !== "player" && role !== "admin") throw new HttpError(400, "bad_role");
  if (id === admin.id) throw new HttpError(403, "self_role");
  const db = env.DB!;
  const target = await summary(db, id);
  if (!target) throw new HttpError(404, "not_found");
  if (target.role === role) return answer(target);
  if (role === "admin" && target.blocked) throw new HttpError(409, "account_blocked");

  const token = newId();
  const [changed] = await db.batch([
    db.prepare(`UPDATE users SET role = ?, moderation_token = ? WHERE id = ? AND role = ? AND (? = 'player' OR blocked = 0) AND ${ACTOR}`)
      .bind(role, token, id, target.role, role, admin.id),
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'user.role_change', ?, ? WHERE ${MINE}`)
      .bind(newId(), admin.id, `user:${id}`, JSON.stringify({ from: target.role, to: role }), id, token),
  ]);
  if (!changed.meta.changes) {
    // Lost a race: say what won.
    const latest = await summary(db, id);
    if (!latest) throw new HttpError(404, "not_found");
    if (latest.role === role) return answer(latest);
    if (role === "player") {
      // The actor was demoted meanwhile. If nobody else is an administrator, the target is the last one.
      const other = await db.prepare("SELECT 1 AS x FROM users WHERE role = 'admin' AND id != ? LIMIT 1").bind(id).first();
      if (!other) throw new HttpError(409, "last_admin");
    }
    await assertStillAdmin(db, admin.id);
    throw new HttpError(409, latest.blocked ? "account_blocked" : "bad_transition");
  }
  return answer((await summary(db, id))!);
}

export async function blockAccount(request: Request, env: Env, id: string): Promise<Response> {
  if (env.ACCOUNT_BLOCK_ENABLED !== "true") throw new HttpError(404, "not_found");
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  assertAccount(body, admin);
  const message = cleanBlockMessage(body.message);
  if (!message) throw new HttpError(400, "message_required", { message: BLOCK_MESSAGE_ERROR });
  if (id === admin.id) throw new HttpError(403, "self_block");
  const db = env.DB!;
  const target = await summary(db, id);
  if (!target) throw new HttpError(404, "not_found");
  if (target.role === "admin") throw new HttpError(409, "admin_account");
  if (target.blocked) throw new HttpError(409, "bad_transition");

  const token = newId(), blockId = newId(), now = new Date().toISOString();
  const [changed] = await db.batch([
    db.prepare(`UPDATE users SET blocked = 1, moderation_token = ? WHERE id = ? AND blocked = 0 AND role = 'player' AND ${ACTOR}`).bind(token, id, admin.id),
    db.prepare(`INSERT INTO account_blocks (id, user_id, message, blocked_by, blocked_at) SELECT ?, ?, ?, ?, ? WHERE ${MINE}`)
      .bind(blockId, id, message, admin.id, now, id, token),
    // Every session ends with the block. A session opened later is restricted by the check on each request.
    db.prepare(`DELETE FROM sessions WHERE user_id = ? AND ${MINE}`).bind(id, id, token),
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'user.block', ?, ? WHERE ${MINE}`)
      .bind(newId(), admin.id, `user:${id}`, JSON.stringify({ block: blockId }), id, token),
  ]);
  if (!changed.meta.changes) {
    const latest = await summary(db, id);
    if (!latest) throw new HttpError(404, "not_found");
    if (latest.role === "admin") throw new HttpError(409, "admin_account");
    if (!latest.blocked) await assertStillAdmin(db, admin.id);
    throw new HttpError(409, "bad_transition");
  }
  return answer((await summary(db, id))!);
}

export async function unblockAccount(request: Request, env: Env, id: string): Promise<Response> {
  const admin = await requireAdmin(request, env);
  const body = await readJson(request);
  assertAccount(body, admin);
  const db = env.DB!;
  const target = await summary(db, id);
  if (!target) throw new HttpError(404, "not_found");
  if (!target.blocked) throw new HttpError(409, "bad_transition");

  const token = newId(), now = new Date().toISOString();
  const [changed] = await db.batch([
    db.prepare(`UPDATE users SET blocked = 0, moderation_token = ? WHERE id = ? AND blocked = 1 AND ${ACTOR}`).bind(token, id, admin.id),
    // Before the ledger row is lifted: the audit detail names the block that ends here.
    db.prepare(`INSERT INTO audit_events (id, actor, action, subject, detail)
      SELECT ?, ?, 'user.unblock', ?, json_object('block', (SELECT id FROM account_blocks WHERE user_id = ? AND lifted_at IS NULL)) WHERE ${MINE}`)
      .bind(newId(), admin.id, `user:${id}`, id, id, token),
    db.prepare(`UPDATE account_blocks SET lifted_at = ?, lifted_by = ? WHERE user_id = ? AND lifted_at IS NULL AND ${MINE}`).bind(now, admin.id, id, id, token),
  ]);
  if (!changed.meta.changes) {
    const latest = await summary(db, id);
    if (!latest) throw new HttpError(404, "not_found");
    if (latest.blocked) await assertStillAdmin(db, admin.id);
    throw new HttpError(409, "bad_transition");
  }
  return answer((await summary(db, id))!);
}
