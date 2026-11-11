/** Optional accounts. Delivery is intentionally disabled outside loopback development. */
export interface AuthEnv {
  DB?: D1Database;
  ENVIRONMENT?: string;
  AUTH_MODE?: string;
  AUTH_API_ORIGIN?: string;
  AUTH_PAGE_ORIGIN?: string;
  ALLOWED_ORIGINS?: string;
}

const LINK_SECONDS = 15 * 60;
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const TOKEN = /^[a-f0-9]{64}$/;
const SESSION_COOKIE = "vila_session";
const BROWSER_COOKIE = "vila_login";

export const accountJson = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });

export function localAuthAvailable(request: Request, env: AuthEnv): boolean {
  const url = new URL(request.url);
  let page: URL;
  try { page = new URL(env.AUTH_PAGE_ORIGIN ?? ""); } catch { return false; }
  const loopback = (value: URL) => ["localhost", "127.0.0.1", "[::1]"].includes(value.hostname) && ["http:", "https:"].includes(value.protocol);
  return Boolean(env.DB && env.ENVIRONMENT === "development" && env.AUTH_MODE === "local" &&
    env.AUTH_API_ORIGIN === url.origin && page.origin === env.AUTH_PAGE_ORIGIN && loopback(url) && loopback(page) &&
    (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).includes(page.origin));
}

function cookie(request: Request, name: string): string | null {
  const values = (request.headers.get("Cookie") ?? "").split(";")
    .map((part) => part.trim().split("="))
    .filter(([key]) => key === name);
  return values.length === 1 && TOKEN.test(values[0][1] ?? "") ? values[0][1] : null;
}

function setCookie(request: Request, name: string, value: string, seconds: number): string {
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${secure}`;
}

function randomToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (n) => n.toString(16).padStart(2, "0")).join("");
}

async function hash(value: string): Promise<string> {
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join("");
}

export async function readBody(request: Request, maxBytes = 4096): Promise<Record<string, unknown> | null> {
  if (request.headers.get("Content-Type")?.split(";")[0].trim().toLowerCase() !== "application/json") return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  let length = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try {
    const body: unknown = JSON.parse(new TextDecoder().decode(bytes));
    return body !== null && typeof body === "object" && !Array.isArray(body) ? body as Record<string, unknown> : null;
  } catch { return null; }
}

function textField(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text.length >= 2 && text.length <= max && !/[\u0000-\u001f\u007f]/.test(text) ? text : null;
}

async function allow(db: D1Database, subject: string, limit: number, period: number, now: number): Promise<boolean> {
  const bucket = Math.floor(now / period);
  const key = `${await hash(subject)}:${bucket}`;
  const result = await db.prepare(`INSERT INTO auth_rate_limits (key, hits, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET hits = hits + 1 WHERE hits < ? RETURNING hits`)
    .bind(key, (bucket + 1) * period, limit).first();
  return result !== null;
}

async function cleanup(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare("DELETE FROM auth_links WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").bind(now),
    db.prepare("DELETE FROM auth_rate_limits WHERE expires_at <= ?").bind(now),
  ]);
}

async function requestLink(request: Request, db: D1Database, body: Record<string, unknown>, now: number, pageOrigin: string): Promise<Response> {
  const email = textField(body.email, 254)?.toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (body.mode !== "login" && body.mode !== "signup")) {
    return accountJson({ error: "invalid_fields" }, 400);
  }
  const signup = body.mode === "signup";
  const name = signup ? textField(body.name, 80) : null;
  const city = signup ? textField(body.city, 80) : null;
  const nickname = signup ? textField(body.nickname, 24) : null;
  if (signup && (!name || !city || !nickname || !/^[a-zA-Z0-9_]{3,24}$/.test(nickname))) {
    return accountJson({ error: "invalid_fields" }, 400);
  }
  if (!await allow(db, `email:${email}`, 3, LINK_SECONDS, now)) {
    return accountJson({ error: "rate_limited" }, 429, { "Retry-After": String(LINK_SECONDS) });
  }
  const browser = cookie(request, BROWSER_COOKIE) ?? randomToken();
  const token = randomToken();
  const tokenHash = await hash(token);
  // This is the mail adapter boundary. No provider is selected; only local D1 is used.
  await db.batch([
    db.prepare(`INSERT INTO auth_links (token_hash, browser_hash, email, name, nickname, city, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(tokenHash, await hash(browser), email, name, nickname, city, now + LINK_SECONDS),
    db.prepare("INSERT INTO auth_local_outbox (token_hash, recipient, link, created_at) VALUES (?, ?, ?, ?)")
      .bind(tokenHash, email, `${pageOrigin}/#login=${token}`, now),
  ]);
  return accountJson({ accepted: true }, 202, { "Set-Cookie": setCookie(request, BROWSER_COOKIE, browser, LINK_SECONDS) });
}

async function confirm(request: Request, db: D1Database, body: Record<string, unknown>, now: number): Promise<Response> {
  const browser = cookie(request, BROWSER_COOKIE);
  if (typeof body.token !== "string" || !TOKEN.test(body.token) || !browser) return accountJson({ error: "invalid_link" }, 400);
  const tokenHash = await hash(body.token);
  const browserHash = await hash(browser);
  const session = randomToken();
  const sessionHash = await hash(session);
  const previous = cookie(request, SESSION_COOKIE);
  try {
    // D1 batch is transactional: account, session and one-use consumption succeed together.
    const result = await db.batch([
      db.prepare(`INSERT INTO auth_users (id, email, name, nickname, city, verified_at)
        SELECT ?, email, name, nickname, city, ? FROM auth_links
        WHERE token_hash = ? AND browser_hash = ? AND expires_at > ? AND name IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM auth_users WHERE email = auth_links.email)`)
        .bind(crypto.randomUUID(), now, tokenHash, browserHash, now),
      db.prepare(`INSERT INTO auth_sessions (token_hash, user_id, expires_at)
        SELECT ?, u.id, ? FROM auth_links l JOIN auth_users u ON u.email = l.email
        WHERE l.token_hash = ? AND l.browser_hash = ? AND l.expires_at > ?`)
        .bind(sessionHash, now + SESSION_SECONDS, tokenHash, browserHash, now),
      db.prepare(`DELETE FROM auth_sessions WHERE token_hash = ?
        AND EXISTS (SELECT 1 FROM auth_sessions WHERE token_hash = ?)`)
        .bind(previous ? await hash(previous) : "", sessionHash),
      db.prepare("DELETE FROM auth_links WHERE token_hash = ? AND browser_hash = ? AND expires_at > ?")
        .bind(tokenHash, browserHash, now),
    ]);
    if (result[1].meta.changes !== 1) return accountJson({ error: "invalid_link" }, 400);
  } catch (error) {
    // Only verified link holders can discover nickname conflicts; never return database errors.
    if (error instanceof Error && error.message.includes("UNIQUE constraint failed: auth_users.nickname")) {
      return accountJson({ error: "nickname_unavailable" }, 409);
    }
    throw error;
  }
  return accountJson({ ok: true }, 200, { "Set-Cookie": setCookie(request, SESSION_COOKIE, session, SESSION_SECONDS) });
}

export async function sessionUser(request: Request, db: D1Database, now = Math.floor(Date.now() / 1000)) {
  const session = cookie(request, SESSION_COOKIE);
  return session ? db.prepare(`SELECT u.id, u.name, u.nickname, u.city, u.email
    FROM auth_sessions s JOIN auth_users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(await hash(session), now).first<{ id: string; name: string; nickname: string; city: string; email: string }>() : null;
}

export async function handleAuth(request: Request, env: AuthEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  const methods: Record<string, string> = {
    "/auth/session": "GET", "/auth/request": "POST", "/auth/confirm": "POST", "/auth/logout": "POST",
  };
  if (!methods[path]) return accountJson({ error: "not_found" }, 404);
  if (request.method !== methods[path]) return accountJson({ error: "method_not_allowed" }, 405, { Allow: methods[path] });
  const available = localAuthAvailable(request, env);
  if (path === "/auth/session" && !available) return accountJson({ available: false, user: null });
  if (!available || !env.DB) return accountJson({ error: "auth_unavailable" }, 503);
  const db = env.DB;
  const now = Math.floor(Date.now() / 1000);
  if (request.method === "GET") {
    return accountJson({ available: true, local: true, user: await sessionUser(request, db, now) });
  }

  if (request.headers.get("Origin") !== env.AUTH_PAGE_ORIGIN || request.headers.get("Sec-Fetch-Site") === "cross-site") {
    return accountJson({ error: "origin_forbidden" }, 403);
  }
  if (path === "/auth/logout") {
    const session = cookie(request, SESSION_COOKIE);
    if (session) await db.prepare("DELETE FROM auth_sessions WHERE token_hash = ?").bind(await hash(session)).run();
    return accountJson({ ok: true }, 200, { "Set-Cookie": setCookie(request, SESSION_COOKIE, "", 0) });
  }
  const body = await readBody(request);
  if (!body) return accountJson({ error: "invalid_body" }, 400);
  await cleanup(db, now);
  // Cloudflare supplies this header; all local callers without it share one development bucket.
  const ip = request.headers.get("CF-Connecting-IP") ?? "loopback";
  if (!await allow(db, `${path}:${ip}`, path.endsWith("request") ? 10 : 30, 60, now)) {
    return accountJson({ error: "rate_limited" }, 429, { "Retry-After": "60" });
  }
  return path === "/auth/request" ? requestLink(request, db, body, now, env.AUTH_PAGE_ORIGIN!) : confirm(request, db, body, now);
}
