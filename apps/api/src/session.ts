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
    `SELECT u.id, u.name, u.nickname, u.city, u.email, u.role, u.verified_at
       FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<User>();
}

export async function requireUser(request: Request, env: Env): Promise<User> {
  const user = await currentUser(request, env);
  if (!user) throw new HttpError(401, "not_signed_in");
  return user;
}

export async function requireAdmin(request: Request, env: Env): Promise<User> {
  const user = await requireUser(request, env);
  if (user.role !== "admin") throw new HttpError(403, "admin_only");
  return user;
}

/**
 * Writes name the account the page believes is signed in (`accountId`). If another tab switched accounts in
 * the meantime, the cookie belongs to someone else: refuse instead of writing into the wrong account.
 */
export function assertAccount(body: Record<string, unknown>, user: User): void {
  if (body.accountId !== user.id) throw new HttpError(409, "account_changed");
}

/** What the person's own client may see about themselves (e-mail included; never sent to anyone else). */
export const meView = (u: User) => ({ id: u.id, name: u.name, nickname: u.nickname, city: u.city, email: u.email, role: u.role });
