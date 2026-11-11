/**
 * Public HTTP API of Vila Noel do Bem (api.vilanoeldobem.com.br, IMPL-0009; pure logic, testable without
 * workerd). Public routes are read-only; optional account routes live in auth.ts (IMPL-0011):
 *
 *   GET /health      → { ok, version, environment, db }
 *   GET /indicators  → public indicators (P02, DEC-027); no verifiable source → null
 *   GET /lots        → village lots and, once approved and published, the occupying NGO (P03, DEC-028)
 *   GET /environment → world clock authority + procedural weather contract (IMPL-0006); no-store
 *
 * CORS: responses carry `Access-Control-Allow-Origin` only for origins on ALLOWED_ORIGINS (the game and the
 * website); other sites cannot read them from a browser.
 * Public routes do not write or take payments. Local accounts require explicit development configuration.
 * `label` and `note` are user-facing copy and stay in pt-BR.
 */

import { localSnapshot } from "@vila/shared/environment/config";
import { handleAuth, type AuthEnv } from "./auth";

export interface Env extends AuthEnv {
  DB?: D1Database;
  ENVIRONMENT?: string;
  /** Comma-separated page origins allowed to read the API from a browser (exact match). */
  ALLOWED_ORIGINS?: string;
}

export const VERSION = "0.3.0";

type Json = Record<string, unknown> | unknown[];

const json = (body: Json, init: ResponseInit = {}): Response =>
  new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=30",
      ...init.headers,
    },
  });

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
    { key: "registered_users", label: "Usuários cadastrados", value: null, note: "Cadastro ainda não implementado." },
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

/** CORS headers for an allowed origin (exact match, no wildcard); none otherwise. */
export function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowed = (env.ALLOWED_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  if (!origin || !allowed.includes(origin)) return { Vary: "Origin" };
  return { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS", "Access-Control-Max-Age": "86400", Vary: "Origin" };
}

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const auth = new URL(request.url).pathname.startsWith("/auth/");
  const res = await route(request, env);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(auth ? authCorsHeaders(request.headers.get("Origin"), env) : corsHeaders(request.headers.get("Origin"), env))) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

function authCorsHeaders(origin: string | null, env: Env): Record<string, string> {
  const headers: Record<string, string> = { Vary: "Origin" };
  if (origin !== env.AUTH_PAGE_ORIGIN || !corsHeaders(origin, env)["Access-Control-Allow-Origin"]) return headers;
  return { ...headers, "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "600" };
}

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname.startsWith("/auth/")) {
    if (request.method === "OPTIONS") {
      const allowed = authCorsHeaders(request.headers.get("Origin"), env)["Access-Control-Allow-Origin"];
      const method = request.headers.get("Access-Control-Request-Method");
      const headers = (request.headers.get("Access-Control-Request-Headers") ?? "").toLowerCase().split(",").map((h) => h.trim()).filter(Boolean);
      const valid = allowed && (method === "GET" || method === "POST") && headers.every((h) => h === "content-type");
      return new Response(null, { status: valid ? 204 : 403, headers: { "Cache-Control": "no-store" } });
    }
    try { return await handleAuth(request, env); }
    catch {
      console.error("auth_error");
      return json({ error: "internal" }, { status: 500, headers: { "Cache-Control": "no-store" } });
    }
  }
  if (request.method === "OPTIONS") return new Response(null, { status: 204 });
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
  }
  try {
    switch (url.pathname) {
      case "/health":
        return json(
          { ok: true, version: VERSION, environment: env.ENVIRONMENT ?? "unknown", db: Boolean(env.DB) },
          { headers: { "Cache-Control": "no-store" } }
        );
      case "/indicators":
        return json({ updatedAt: new Date().toISOString(), indicators: await indicators(env) });
      case "/environment":
        // The server time is the clock authority; the rest is the deterministic weather contract.
        return json({ ...localSnapshot(Date.now()) }, { headers: { "Cache-Control": "no-store" } });
      case "/lots": {
        const rows = await lots(env);
        if (rows === null) return json({ error: "db_unavailable" }, { status: 503 });
        return json({ lots: rows });
      }
      default:
        return json({ error: "not_found" }, { status: 404 });
    }
  } catch (err) {
    // Never log request parameters or personal data; only the route and the error type.
    console.error("api_error", url.pathname, err instanceof Error ? err.name : "unknown");
    return json({ error: "internal" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
