/**
 * Public API of Vila Noel do Bem (pure logic, testable without workerd).
 *
 * Only `/api/*` runs code (wrangler.jsonc → `run_worker_first`); everything else is
 * served by Static Assets (SPA). All routes are read-only and public:
 *
 *   GET /api/health      → { ok, version, environment, db }
 *   GET /api/indicators  → public indicators (P02, DEC-027); no verifiable source → null
 *   GET /api/lots        → village lots and, once approved and published, the occupying NGO (P03, DEC-028)
 *   GET /api/environment → world clock authority + procedural weather contract (IMPL-0006); no-store
 *
 * Nothing here writes, takes payments or records personal data (IMPL-0002, LGPD).
 * `label` and `note` are user-facing copy and stay in pt-BR.
 */

import { localSnapshot } from "../src/environment/config";

export interface Env {
  ASSETS: Fetcher;
  DB?: D1Database;
  ENVIRONMENT?: string;
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

export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  if (request.method !== "GET" && request.method !== "HEAD") {
    return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET, HEAD" } });
  }
  try {
    switch (url.pathname) {
      case "/api/health":
        return json(
          { ok: true, version: VERSION, environment: env.ENVIRONMENT ?? "unknown", db: Boolean(env.DB) },
          { headers: { "Cache-Control": "no-store" } }
        );
      case "/api/indicators":
        return json({ updatedAt: new Date().toISOString(), indicators: await indicators(env) });
      case "/api/environment":
        // The server time is the clock authority; the rest is the deterministic weather contract.
        return json({ ...localSnapshot(Date.now()) }, { headers: { "Cache-Control": "no-store" } });
      case "/api/lots": {
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
