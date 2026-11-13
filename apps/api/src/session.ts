/**
 * Sessions (OQ-03): random cookie `__Host-vila_session` (HttpOnly, Secure, SameSite=Lax, 30 days) whose SHA-256 is
 * stored in D1. The cookie belongs to api.vilanoeldobem.com.br; the game (play.*) is the same site, so the
 * browser sends it on `credentials: "include"` requests.
 */
import { sha256Hex } from "./crypto";
import { HttpError } from "./http";
import type { Env } from "./api";

/** `__Host-`: the browser refuses it unless Secure, Path=/ and no Domain — sibling subdomains cannot plant one. */
export const SESSION_COOKIE = "__Host-vila_session";
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;

export interface User {
  id: string;
  name: string;
  nickname: string;
  city: string;
  email: string;
  role: "player" | "admin";
  verified_at: string | null;
  files_deleting?: number;
  /** 1 while a block is in force (migration 0010; IMPL-0021, PROPOSTA). */
  blocked?: number;
}

export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_TTL_MS / 1000}`;
}

export const clearCookie = () => `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export function readSessionToken(request: Request): string | null {
  const header = request.headers.get("Cookie") ?? "";
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === SESSION_COOKIE) return v.join("=") || null;
  }
  return null;
}

export async function currentUser(request: Request, env: Env): Promise<User | null> {
  const token = readSessionToken(request);
  if (!token || !env.DB) return null;
  return env.DB.prepare(
    // `blocked` is migration 0010: a database without it answers 503 schema_outdated on every signed-in route.
    `SELECT u.id, u.name, u.nickname, u.city, u.email, u.role, u.verified_at, u.files_deleting, u.blocked
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<User>();
}

/** Signed in, blocked or not: only for what a blocked person keeps (reading `/me`, signing out, erasing the account). */
export async function requireSession(request: Request, env: Env): Promise<User> {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "not_signed_in");
  return user;
}

/**
 * Signed in and not blocked. A blocked account's session is restricted (IMPL-0021, PROPOSTA): it is refused on
 * every route that asks for a user, on every request, so a block already recorded holds whatever the flag says.
 */
export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await requireSession(request, env);
  if (user.blocked) throw new HttpError(403, "session_blocked");
  return user;
}

export async function requireAdmin(request: Request, env: Env): Promise<User> {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new HttpError(403, "admin_only");
  return user;
}

/**
 * SQL guard of an administrative write: the actor is still an administrator (and not blocked) when the batch
 * commits, not only when the session was read (IMPL-0021). Binds: the actor's id.
 */
export const STILL_ADMIN = "EXISTS (SELECT 1 FROM users a WHERE a.id = ? AND a.role = 'admin' AND a.blocked = 0)";

/** Answers for the actor of a write that `STILL_ADMIN` refused: the account is gone, or it lost the role. */
export async function assertStillAdmin(db: D1Database, actorId: string): Promise<void> {
  const actor = await db.prepare("SELECT role, blocked FROM users WHERE id = ?").bind(actorId).first<{ role: string; blocked: number }>();
  if (!actor) throw new HttpError(401, "not_signed_in");
  if (actor.role !== "admin" || actor.blocked) throw new HttpError(403, "admin_only");
}

/**
 * Writes name the account the page believes is signed in (`accountId`). If another tab switched accounts in
 * the meantime, the cookie belongs to someone else: refuse instead of writing into the wrong account.
 */
export function assertAccount(body: Record<string, unknown>, user: User): void {
  if (body.accountId !== user.id) throw new HttpError(409, "account_changed");
}

/**
 * What the person's own client may see about themselves (e-mail included; never sent to anyone else). `block` is
 * the block in force, when there is one: the message the administration wrote to them, and when.
 */
export const meView = (u: User, block?: { message: string; at: string } | null) => ({
  id: u.id, name: u.name, nickname: u.nickname, city: u.city, email: u.email, role: u.role, deletionPending: Boolean(u.files_deleting),
  ...(block ? { blocked: block } : {}),
});
