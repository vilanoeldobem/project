/**
 * HTTP API of Vila Noel do Bem (api.vilanoeldobem.com.br, IMPL-0009; pure logic, testable without workerd).
 *
 * Public, read-only:
 *   GET /health      → { ok, version, environment, db }
 *   GET /config      → { accounts }  (feature flags the client needs)
 *   GET /indicators  → public indicators (P02, DEC-027); no verifiable source → null
 *   GET /lots        → village lots and, once approved and published, the occupying NGO (P03, DEC-028)
 *   GET /environment → world clock authority + procedural weather contract (IMPL-0006); no-store
 *
 * Accounts, server XP, NGO applications and admin review (IMPL-0011; only when ACCOUNTS_ENABLED = "true"):
 * see auth.ts, progress.ts, ngo.ts, admin.ts. Mutations require an allowed `Origin` and a JSON body (which
 * forces a CORS preflight); the session cookie is HttpOnly, Secure, SameSite=Lax.
 *
 * CORS: `Access-Control-Allow-Origin` (+ credentials) only for exact origins on ALLOWED_ORIGINS.
 * Nothing here takes payments (IMPL-0002). Personal data: the four P13 fields only; never logged.
 * `label` and `note` are user-facing copy and stay in pt-BR.
 */

import { localSnapshot } from "@vila/shared/environment/config";

import { decide, getApplicationAdmin, listApplications } from "./admin";
import { deleteMe, logout, me, register, requestLink, updateMe, verify } from "./auth";
import { allowedOrigins, errorResponse, HttpError, json, NO_STORE } from "./http";
import { getApplication, submitApplication } from "./ngo";
import { getProgress, postEvents } from "./progress";

export interface Env {
  DB?: D1Database;
  ENVIRONMENT?: string;
  /** Comma-separated page origins allowed to read the API from a browser (exact match). */
  ALLOWED_ORIGINS?: string;
  /**
   * Exact origins allowed on account routes and to receive credentialed CORS (the game only; the public
   * website does not need the session). Defaults to ALLOWED_ORIGINS when unset (local development).
   */
  ACCOUNT_ORIGINS?: string;
  /** Base URL of sign-in links (the game). Defaults to the request origin (local development). */
  GAME_ORIGIN?: string;
  /** "true" turns on accounts, server XP, NGO applications and admin (IMPL-0011). */
  ACCOUNTS_ENABLED?: string;
  /** Cloudflare Email Service binding (`send_email`), see mail.ts. */
  EMAIL?: unknown;
  MAIL_FROM?: string;
  /** Workers rate limiting binding for sign-in requests, keyed by client IP (never stored). */
  AUTH_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export const VERSION = "0.3.0";

export interface LotRow {
  id: string;
  street: string;
  slot: number;
  x: number;
  z: number;
  state: string;
  ngo_name: string | null;
  ngo_summary: string | null;
}

export interface Indicator {
  key: string;
  label: string;
  value: number | null;
  /** Why the value is null, when it is. */
  note?: string;
}

async function indicators(env: Env): Promise<Indicator[]> {
  let approved: number | null = null;
  if (env.DB) {
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM ngos WHERE status = 'published'").first<{ n: number }>();
    approved = row?.n ?? 0;
  }
  return [
    { key: "approved_ngos", label: "ONGs aprovadas", value: approved, note: approved === null ? "Banco indisponível." : undefined },
    { key: "registered_users", label: "Usuários cadastrados", value: null, note: "Cadastro ainda não aberto ao público." },
    { key: "confirmed_donations", label: "Doações confirmadas", value: null, note: "Depende de parceira e provedor de pagamento (PEN-004, PEN-006)." },
    { key: "confirmed_amount", label: "Valor confirmado", value: null, note: "Depende de verificação." },
    { key: "people_impacted", label: "Pessoas impactadas", value: null, note: "Exige metodologia aprovada (DEC-027)." },
  ];
}

async function lots(env: Env): Promise<LotRow[] | null> {
  if (!env.DB) return null;
  const { results } = await env.DB.prepare(
    `SELECT l.id, l.street, l.slot, l.x, l.z, l.state,
            CASE WHEN n.status = 'published' THEN n.name END AS ngo_name,
            CASE WHEN n.status = 'published' THEN n.summary END AS ngo_summary
       FROM lots l LEFT JOIN ngos n ON n.id = l.ngo_id
      ORDER BY l.street, l.slot`
  ).all<LotRow>();
  return results;
}

const accountOrigins = (env: Env) => allowedOrigins(env.ACCOUNT_ORIGINS ?? env.ALLOWED_ORIGINS);

/**
 * CORS headers for an allowed origin (exact match, no wildcard); none otherwise. Only account origins (the
 * game) get credentials: other allowed sites can read public data but never send the session cookie along.
 */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  if (!origin || !allowedOrigins(env.ALLOWED_ORIGINS).includes(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin,
    ...(accountOrigins(env).includes(origin) ? { "Access-Control-Allow-Credentials": "true" } : {}),
    "Access-Control-Allow-Methods": "GET, HEAD, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const res = await route(request, env);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(corsHeaders(request.headers.get("Origin"), env))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

const ACCOUNT_PREFIXES = ["/auth/", "/me", "/progress", "/ngo/", "/admin/"];
const ADMIN_APP = /^\/admin\/applications\/([0-9a-f-]{36})(\/decision)?$/;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  try {
    if (ACCOUNT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p))) return await accountRoute(request, env, url);
    if (method !== "GET" && method !== "HEAD") {
      return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
    }
    switch (pathname) {
      case "/health":
        return json({ ok: true, version: VERSION, environment: env.ENVIRONMENT ?? "unknown", db: Boolean(env.DB) }, { headers: NO_STORE });
      case "/config":
        return json({ accounts: env.ACCOUNTS_ENABLED === "true" }, { headers: NO_STORE });
      case "/indicators":
        return json({ updatedAt: new Date().toISOString(), indicators: await indicators(env) });
      case "/environment":
        // The server time is the clock authority; the rest is the deterministic weather contract.
        return json({ ...localSnapshot(Date.now()) }, { headers: NO_STORE });
      case "/lots": {
        const rows = await lots(env);
        if (rows === null) return json({ error: "db_unavailable" }, { status: 503 });
        return json({ lots: rows }, { headers: NO_STORE });
      }
      default:
        return json({ error: "not_found" }, { status: 404 });
    }
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    // Never log request parameters or personal data; only the route and the error type.
    console.error("api_error", pathname, err instanceof Error ? err.name : "unknown");
    return json({ error: "internal" }, { status: 500, headers: NO_STORE });
  }
}

/** Accounts, XP, NGO applications and admin (IMPL-0011). */
async function accountRoute(request: Request, env: Env, url: URL): Promise<Response> {
  if (env.ACCOUNTS_ENABLED !== "true") throw new HttpError(404, "accounts_disabled");
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const { pathname } = url;
  const method = request.method;
  const origin = request.headers.get("Origin");
  // Every account route answers only the game's own pages (cookies + CORS); mutations doubly so.
  if (!origin || !accountOrigins(env).includes(origin)) throw new HttpError(403, "forbidden_origin");
  if (pathname.startsWith("/auth/") && env.AUTH_LIMITER) {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    if (!(await env.AUTH_LIMITER.limit({ key: ip })).success) throw new HttpError(429, "too_many_requests");
  }
  const is = (m: string, p: string) => method === m && pathname === p;
  if (is("POST", "/auth/register")) return register(request, env, origin);
  if (is("POST", "/auth/link")) return requestLink(request, env, origin);
  if (is("POST", "/auth/verify")) return verify(request, env);
  if (is("POST", "/auth/logout")) return logout(request, env);
  if (is("GET", "/me")) return me(request, env);
  if (is("POST", "/me")) return updateMe(request, env);
  if (is("DELETE", "/me")) return deleteMe(request, env);
  if (is("GET", "/progress")) return getProgress(request, env);
  if (is("POST", "/progress/events")) return postEvents(request, env);
  if (is("GET", "/ngo/application")) return getApplication(request, env);
  if (is("POST", "/ngo/application")) return submitApplication(request, env);
  if (is("GET", "/admin/applications")) return listApplications(request, env);
  const m = ADMIN_APP.exec(pathname);
  if (m && method === "GET" && !m[2]) return getApplicationAdmin(request, env, m[1]);
  if (m && method === "POST" && m[2]) return decide(request, env, m[1]);
  throw new HttpError(404, "not_found");
}
