/**
 * Accounts and magic-link sign-in (P13, OQ-02, OQ-03; IMPL-0011).
 *
 *   POST /auth/register {name, nickname, city, email} → 202 (sends the link)
 *   POST /auth/link     {email}                       → 202 (always the same answer: no account enumeration)
 *   POST /auth/verify   {token}                       → 200 {user} + session cookie
 *   POST /auth/logout                                 → 204
 *   GET  /me                                          → {user} | {user: null} when signed out (`user.blocked` while blocked)
 *   POST /me            {name, nickname, city}        → {user}  (correction; the e-mail is not editable)
 *   DELETE /me                                        → 204 (account, sessions and mission events deleted)
 *
 * Links: 256-bit random token, stored hashed, valid 15 minutes, single use (OQ-03; durations PROPOSTA). The token
 * travels in the URL fragment (`/#login=…`), which browsers never send to a server, so it reaches no access log.
 * At most 3 links per account per 15 minutes and 10 per day; unverified registrations expire after 24 hours.
 *
 * Link target: the game (GAME_ORIGIN), except for `POST /auth/link` asked by the backoffice dashboard — the
 * request `Origin` equal to DASH_ORIGIN, exact match — whose link opens the dashboard (IMPL-0015). Nothing else in
 * the request chooses where a link points. Registration is game-only: the dashboard creates no accounts.
 *
 * Blocked accounts (IMPL-0021, PROPOSTA; account-moderation.ts): the link routes answer a blocked e-mail exactly
 * as any other (same code path), so nothing tells a third party that an e-mail is blocked. The link opens a
 * restricted session: `GET /me` (with `blocked: {message, at}`), `POST /auth/logout` and `DELETE /me` work, every
 * other signed-in route answers 403 session_blocked. Erasure is never taken away by a block; it removes the block
 * ledger with the account, and nothing keeps the e-mail afterwards.
 */
import { normaliseEmail, validateRegistration } from "@vila/shared/accounts/validate";

import { activeBlock } from "./account-moderation";
import { isoIn, newId, randomToken, sha256Hex } from "./crypto";
import { removeFilesOfAccount } from "./files";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { sendLoginLink } from "./mail";
import { clearCookie, currentUser, meView, readSessionToken, requireSession, requireUser, SESSION_TTL_MS, sessionCookie, type User } from "./session";
import type { Env } from "./api";

export const LINK_TTL_MS = 15 * 60 * 1000;
const LINKS_PER_WINDOW = 3;
const LINKS_PER_DAY = 10;
const UNVERIFIED_TTL_MS = 24 * 3600 * 1000;

const accepted = (devLink?: string) => json({ ok: true, ...(devLink ? { devLink } : {}) }, { status: 202, headers: NO_STORE });

/**
 * Creates a link token for `user` unless a limit is reached (3 per 15 minutes, 10 per day per account),
 * atomically (the count and the insert are one statement, so parallel requests cannot overshoot). Returns
 * the link in development/test, undefined otherwise or when limited (the answer to the caller never changes).
 * The link points at the game (GAME_ORIGIN), never at whichever allowed site made the request; `dash` (decided by
 * `fromDash`, never by request data) is the single exception and points it at DASH_ORIGIN.
 */
async function issueLink(env: Env, user: Pick<User, "id" | "email" | "nickname">, origin: string, dash = false): Promise<string | undefined> {
  const db = env.DB!;
  const token = randomToken();
  const now = Date.now();
  const inserted = await db
    .prepare(
      `INSERT INTO login_tokens (token_hash, user_id, expires_at)
       SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM login_tokens WHERE user_id = ? AND created_at > ?) < ?
                        AND (SELECT COUNT(*) FROM login_tokens WHERE user_id = ? AND created_at > ?) < ?`
    )
    .bind(
      await sha256Hex(token), user.id, isoIn(LINK_TTL_MS, now),
      user.id, new Date(now - LINK_TTL_MS).toISOString(), LINKS_PER_WINDOW,
      user.id, new Date(now - 24 * 3600 * 1000).toISOString(), LINKS_PER_DAY
    )
    .run();
  if (!inserted.meta.changes) return undefined;
  const base = dash ? env.DASH_ORIGIN! : (env.GAME_ORIGIN ?? origin);
  return sendLoginLink(env, user.email, user.nickname, `${base}/#login=${encodeURIComponent(token)}`, dash ? "dash" : "game");
}

/** True only when the request comes from the configured dashboard origin (exact string match, no patterns). */
const fromDash = (env: Env, origin: string) => Boolean(env.DASH_ORIGIN) && origin === env.DASH_ORIGIN;

export async function register(request: Request, env: Env, origin: string): Promise<Response> {
  // Accounts are created in the game only; the dashboard signs existing admins in (IMPL-0015).
  if (fromDash(env, origin)) throw new HttpError(403, "forbidden_origin");
  const { value, errors } = validateRegistration(await readJson(request));
  if (Object.keys(errors).length) throw new HttpError(400, "invalid", errors as Record<string, string>);
  const db = env.DB!;
  // A blocked registration is kept: expiring it would free the e-mail and the nickname for a new account.
  await db.prepare("DELETE FROM users WHERE verified_at IS NULL AND blocked = 0 AND created_at < ?").bind(new Date(Date.now() - UNVERIFIED_TTL_MS).toISOString()).run();

  // Nickname first, for every e-mail: the answer must not depend on whether the e-mail has an account.
  const taken = await db.prepare("SELECT 1 AS x FROM users WHERE nickname_key = ?").bind(value.nickname.toLowerCase()).first();
  if (taken) throw new HttpError(409, "nickname_taken", { nickname: "Esse nickname já está em uso. Escolha outro." });
  const existing = await db.prepare("SELECT id, email, nickname FROM users WHERE email = ?").bind(value.email).first<User>();
  if (existing) return accepted(await issueLink(env, existing, origin)); // same answer as a new account
  const user = { id: newId(), ...value };
  try {
    await db
      .prepare("INSERT INTO users (id, name, nickname, nickname_key, city, email) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(user.id, user.name, user.nickname, user.nickname.toLowerCase(), user.city, user.email)
      .run();
  } catch {
    // Lost a race. Nickname taken → say so (nicknames are public). E-mail taken → the same 202 as always.
    const nick = await db.prepare("SELECT 1 AS x FROM users WHERE nickname_key = ?").bind(user.nickname.toLowerCase()).first();
    if (nick) throw new HttpError(409, "nickname_taken", { nickname: "Esse nickname já está em uso. Escolha outro." });
    return accepted();
  }
  return accepted(await issueLink(env, user, origin));
}

export async function requestLink(request: Request, env: Env, origin: string): Promise<Response> {
  const email = normaliseEmail((await readJson(request)).email);
  const user = email ? await env.DB!.prepare("SELECT id, email, nickname FROM users WHERE email = ?").bind(email).first<User>() : null;
  if (!user) return accepted();
  try {
    return accepted(await issueLink(env, user, origin, fromDash(env, origin)));
  } catch {
    // A send failure only happens for existing accounts: answering 503 here would reveal them.
    return accepted();
  }
}

export async function verify(request: Request, env: Env): Promise<Response> {
  const token = (await readJson(request)).token;
  if (typeof token !== "string" || token.length < 20 || token.length > 100) throw new HttpError(400, "invalid_token");
  const db = env.DB!;
  const hash = await sha256Hex(token);
  const now = new Date().toISOString();
  // Single use: only the request that flips used_at wins.
  const claimed = await db.prepare("UPDATE login_tokens SET used_at = ? WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?").bind(now, hash, now).run();
  if (!claimed.meta.changes) throw new HttpError(400, "invalid_token");
  const row = await db.prepare("SELECT user_id FROM login_tokens WHERE token_hash = ?").bind(hash).first<{ user_id: string }>();
  if (!row) throw new HttpError(400, "invalid_token"); // account deleted meanwhile
  const session = randomToken();
  // A session this browser already had (maybe another account's) ends here: one browser, one account.
  const previous = readSessionToken(request);
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(previous ? await sha256Hex(previous) : ""),
    db.prepare("UPDATE users SET verified_at = COALESCE(verified_at, ?) WHERE id = ?").bind(now, row.user_id),
    db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(
      await sha256Hex(session), row.user_id, isoIn(SESSION_TTL_MS), row.user_id
    ),
    db.prepare("DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?").bind(row.user_id, now),
    // Housekeeping: links of this account that are used or expired are of no further use.
    db.prepare("DELETE FROM login_tokens WHERE user_id = ? AND (used_at IS NOT NULL OR expires_at <= ?) AND created_at < ?").bind(
      row.user_id, now, new Date(Date.now() - 24 * 3600 * 1000).toISOString()
    ),
  ]);
  const user = await db.prepare("SELECT id, name, nickname, city, email, role, verified_at, files_deleting, blocked FROM users WHERE id = ?").bind(row.user_id).first<User>();
  if (!user) throw new HttpError(400, "invalid_token");
  return json({ user: await ownView(db, user) }, { headers: { ...NO_STORE, "Set-Cookie": sessionCookie(session) } });
}

/** `meView` with the block in force, for the person who proved they own the e-mail (the link or the session). */
async function ownView(db: D1Database, user: User) {
  return meView(user, user.blocked ? ((await activeBlock(db, user.id)) ?? { message: "", at: "" }) : null);
}

/**
 * Corrects name, nickname or city (LGPD right of correction; also undoes a registration someone else made
 * with this e-mail before the owner signed in). The e-mail itself is the sign-in key and is not editable.
 */
export async function updateMe(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const { value, errors } = validateRegistration({ ...user, ...body, email: user.email });
  delete errors.email;
  if (Object.keys(errors).length) throw new HttpError(400, "invalid", errors as Record<string, string>);
  const db = env.DB!;
  const taken = await db.prepare("SELECT 1 AS x FROM users WHERE nickname_key = ? AND id != ?").bind(value.nickname.toLowerCase(), user.id).first();
  if (taken) throw new HttpError(409, "nickname_taken", { nickname: "Esse nickname já está em uso. Escolha outro." });
  await db
    .prepare("UPDATE users SET name = ?, nickname = ?, nickname_key = ?, city = ? WHERE id = ?")
    .bind(value.name, value.nickname, value.nickname.toLowerCase(), value.city, user.id)
    .run();
  return json({ user: meView({ ...user, name: value.name, nickname: value.nickname, city: value.city }) }, { headers: NO_STORE });
}

export async function logout(request: Request, env: Env): Promise<Response> {
  const token = readSessionToken(request);
  if (token) await env.DB!.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256Hex(token)).run();
  return new Response(null, { status: 204, headers: { ...NO_STORE, "Set-Cookie": clearCookie() } });
}

/** Signed out is a normal state for visitors (OQ-02): `{user: null}`, not an error in every browser console. */
export async function me(request: Request, env: Env): Promise<Response> {
  const user = await currentUser(request, env);
  return json({ user: user ? await ownView(env.DB!, user) : null }, { headers: NO_STORE });
}

/**
 * Deletes the account (sessions, links, mission events and the block ledger cascade; an NGO application keeps no
 * link to it). A blocked account keeps this right (IMPL-0021): the only signed-in write its session may make.
 */
export async function deleteMe(request: Request, env: Env): Promise<Response> {
  const user = await requireSession(request, env);
  const db = env.DB!;
  // Durable intent freezes NGO/file decisions while R2 cleanup runs. A failed cleanup is retried by DELETE /me.
  const frozen = await db.prepare("UPDATE users SET files_deleting = 1 WHERE id = ? AND files_deleting = 0").bind(user.id).run();
  let removals: D1PreparedStatement[];
  try {
    removals = await removeFilesOfAccount(env, user.id);
  } catch (error) {
    // Refused before any object was touched (no bucket): nothing was erased, so the freeze this request set is
    // undone and the account stays as it was. A freeze left by an earlier attempt, or an R2 failure, is kept.
    if (frozen.meta.changes && error instanceof HttpError && error.code === "files_unavailable")
      await db.prepare("UPDATE users SET files_deleting = 0 WHERE id = ?").bind(user.id).run();
    throw error;
  }
  await db.batch([
    // The applicant's documents (and an unpublished logo) leave R2 first, then their rows in this transaction.
    ...removals,
    // Removal of evidence/ownership invalidates reviews that were read before deletion began.
    db.prepare("UPDATE ngos SET revision = revision + 1, updated_at = ? WHERE applicant_id = ? AND EXISTS (SELECT 1 FROM users WHERE id = ? AND files_deleting = 1)").bind(new Date().toISOString(), user.id, user.id),
    db.prepare("INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, 'user.delete', ?, NULL WHERE EXISTS (SELECT 1 FROM users WHERE id = ?)").bind(newId(), user.id, `user:${user.id}`, user.id),
    db.prepare("DELETE FROM users WHERE id = ?").bind(user.id),
  ]);
  return new Response(null, { status: 204, headers: { ...NO_STORE, "Set-Cookie": clearCookie() } });
}
