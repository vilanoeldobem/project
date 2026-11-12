/**
 * HTTP API of Vila Noel do Bem (api.vilanoeldobem.com.br, IMPL-0009; pure logic, testable without workerd).
 *
 * Public, read-only:
 *   GET /health      → { ok, version, environment, db, mail, files }
 *   GET /config      → { accounts, quests, files, withdrawal, moderation }  (feature flags the client needs)
 *   GET /indicators  → public indicators (P02, DEC-027); no verifiable source → null
 *   GET /lots        → village lots and, once approved and published, the occupying NGO (P03, DEC-028)
 *   GET /environment → world clock authority + procedural weather contract (IMPL-0006); no-store
 *   GET /ngos/:id/logo → logo of a published NGO, from R2 (IMPL-0017; only when NGO_FILES_ENABLED = "true")
 *
 * Every public projection of an NGO (lots, indicators, profile, logo, gallery) requires the published lot
 * association: a withdrawn NGO (IMPL-0020) has no lot, so it leaves all of them, and none of them reads
 * `ngo_withdrawals` or any other table production may not have yet.
 *
 * Accounts, server XP, NGO applications and admin review (IMPL-0011; only when ACCOUNTS_ENABLED = "true"):
 * see auth.ts, progress.ts, ngo.ts, files.ts, admin.ts, backoffice.ts. Roles, account block and presence
 * moderation (IMPL-0021): account-moderation.ts, presence-moderation.ts. Mutations require an allowed `Origin` and a JSON body (which
 * forces a CORS preflight); the session cookie is HttpOnly, Secure, SameSite=Lax.
 *
 * Realtime server only, through a service binding (IMPL-0021): POST /moderation/consume. No session, no CORS.
 *
 * CORS: `Access-Control-Allow-Origin` (+ credentials) only for exact origins on ALLOWED_ORIGINS.
 * Nothing here takes payments (IMPL-0002). Personal data: the four P13 fields only; never logged.
 * `label` and `note` are user-facing copy and stay in pt-BR.
 */

import { localSnapshot } from "@vila/shared/environment/config";

import { blockAccount, changeRole, unblockAccount } from "./account-moderation";
import { decide, getApplicationAdmin, listApplications } from "./admin";
import { deleteMe, logout, me, register, requestLink, updateMe, verify } from "./auth";
import { listAudit, listUsers } from "./backoffice";
import { deleteFile, downloadFileAdmin, downloadOwnFile, filesBucket, noFilesTable, publicLogo, recoverFileUploads, removeLogoAdmin, uploadFile } from "./files";
import { allowedOrigins, errorResponse, HttpError, json, noStore, NO_STORE } from "./http";
import { mailConfigured } from "./mail";
import { getApplication, submitApplication } from "./ngo";
import { getProgress, postEvents } from "./progress";
import { publicNgo } from "./public-ngo";
import { decidePhoto, deleteOwnPhoto, listPhotos, pendingPhotos, photoContent, uploadPhoto } from "./ngo-photos";
import { withdrawNgo } from "./ngo-withdrawal";
import { consumeTicket, issueTicket } from "./presence-moderation";

export interface Env {
  DB?: D1Database;
  /** Institutional gallery on the canonical private FILES bucket (IMPL-0018). */
  NGO_PHOTOS_ENABLED?: string;
  /**
   * "true" turns on the administrative withdrawal of a published NGO (PROPOSTA; IMPL-0020, OQ-14). Needs
   * ACCOUNTS_ENABLED and migration 0009. Off in production and staging until the product owner answers OQ-14.
   * It only gates new withdrawals: one already recorded stays in force with the flag off.
   */
  NGO_WITHDRAWAL_ENABLED?: string;
  /**
   * "true" lets an administrator block an account (PROPOSTA; IMPL-0021, OQ-11). Needs ACCOUNTS_ENABLED and
   * migration 0010. Off in production and staging until the product owner answers OQ-11. It only gates new
   * blocks: one already recorded stays in force with the flag off, and can still be lifted.
   */
  ACCOUNT_BLOCK_ENABLED?: string;
  /**
   * "true" lets an administrator remove a visitor from a room of the realtime server (PROPOSTA; IMPL-0021).
   * Needs ACCOUNTS_ENABLED, migration 0010 and the realtime server deployed with the same flag and its service
   * binding to this Worker. Off in production and staging.
   */
  PRESENCE_MODERATION_ENABLED?: string;
  ENVIRONMENT?: string;
  /** Comma-separated page origins allowed to read the API from a browser (exact match). */
  ALLOWED_ORIGINS?: string;
  /**
   * Exact origins allowed on account routes and to receive credentialed CORS (the game and the backoffice
   * dashboard; the public website does not need the session). Defaults to ALLOWED_ORIGINS when unset (local
   * development).
   */
  ACCOUNT_ORIGINS?: string;
  /** Base URL of sign-in links (the game). Defaults to the request origin (local development). */
  GAME_ORIGIN?: string;
  /** Origin of the backoffice dashboard (apps/dash). A sign-in link asked from exactly this origin opens it (IMPL-0015). */
  DASH_ORIGIN?: string;
  /** "true" turns on accounts, server XP, NGO applications and admin (IMPL-0011). */
  ACCOUNTS_ENABLED?: string;
  /** "true" accepts quests-v1 events (PROPOSTA; DEC-039..042, PEN-025). Off in production. */
  QUESTS_V1_ENABLED?: string;
  /** Resend API key (Worker secret, never a `var`), see mail.ts. Without it sign-in e-mails fail closed. */
  RESEND_API_KEY?: string;
  /** Sender address of the sign-in e-mail; its domain must be verified in Resend. */
  MAIL_FROM?: string;
  /** Workers rate limiting binding for sign-in requests, keyed by client IP (never stored). */
  AUTH_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Private R2 bucket with the files of NGO applications (IMPL-0017). Never exposed by a public bucket URL. */
  FILES?: R2Bucket;
  /** "true" turns on NGO logo and document uploads (PROPOSTA; PEN-019). Needs `FILES` and ACCOUNTS_ENABLED. Off in production. */
  NGO_FILES_ENABLED?: string;
  /** Workers rate limiting binding for uploads, keyed by account id. */
  FILE_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
  /** Workers rate limiting binding for `POST /moderation/consume`, keyed by client address, or by room through the service binding (no address there). */
  MODERATION_LIMITER?: { limit(options: { key: string }): Promise<{ success: boolean }> };
}

export const VERSION = "0.4.0";

export interface LotRow {
  id: string;
  street: string;
  slot: number;
  x: number;
  z: number;
  state: string;
  ngo_id: string | null;
  ngo_name: string | null;
  ngo_summary: string | null;
  /** Path of the published NGO's logo on this API (`/ngos/<id>/logo?v=…`), or null (IMPL-0017). */
  ngo_logo: string | null;
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
    // What the village shows: a published NGO on a published lot, like every other public projection. A withdrawn
    // NGO keeps `status = 'published'` but has no lot (IMPL-0020). No table newer than migration 0003 is read here.
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM ngos n WHERE n.status = 'published' AND EXISTS (SELECT 1 FROM lots l WHERE l.ngo_id = n.id AND l.state = 'published')"
    ).first<{ n: number }>();
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
  const LOGO = `CASE WHEN n.status = 'published' AND l.state = 'published' THEN
       (SELECT '/ngos/' || n.id || '/logo?v=' || substr(f.id, 1, 8) FROM ngo_files f WHERE f.ngo_id = n.id AND f.kind = 'logo') END`;
  const query = (logo: string) =>
    env.DB!.prepare(
      `SELECT l.id, l.street, l.slot, l.x, l.z, l.state,
              CASE WHEN n.status = 'published' AND l.state = 'published' THEN n.id END AS ngo_id,
              CASE WHEN n.status = 'published' AND l.state = 'published' THEN n.name END AS ngo_name,
              CASE WHEN n.status = 'published' AND l.state = 'published' THEN n.summary END AS ngo_summary,
              ${logo} AS ngo_logo
         FROM lots l LEFT JOIN ngos n ON n.id = l.ngo_id
        ORDER BY l.street, l.slot`
    ).all<LotRow>();
  // `ngo_files` is read only with the feature on, and a database that does not have the table yet (migration
  // 0006 not applied) still answers, without logos: this public route must never depend on a later migration.
  if (!filesBucket(env)) return (await query("NULL")).results;
  try {
    return (await query(LOGO)).results;
  } catch (e) {
    if (!noFilesTable(e)) throw e;
    return (await query("NULL")).results;
  }
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
    "Access-Control-Allow-Headers": "Content-Type, X-Vila-Account, X-Vila-Caption",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Called by the realtime server through its service binding (IMPL-0021), never by a browser page. */
const CONSUME_TICKET = "/moderation/consume";

export async function handleApi(request: Request, env: Env): Promise<Response> {
  // Every route builds its own Response (json(), errorResponse(), the empty preflight), so the CORS
  // headers are set on it in place. Re-wrapping `res.body` would turn a fixed-length body into a stream.
  const res = await route(request, env);
  // No CORS header at all, whatever the Origin: a page cannot read the answer, and its preflight fails.
  if (new URL(request.url).pathname === CONSUME_TICKET) return res;
  for (const [k, v] of Object.entries(corsHeaders(request.headers.get("Origin"), env))) res.headers.set(k, v);
  return res;
}

const ACCOUNT_PREFIXES = ["/auth/", "/me", "/progress", "/ngo/", "/admin/"];
const ADMIN_APP = /^\/admin\/applications\/([0-9a-f-]{36})(\/decision)?$/;
const ADMIN_FILE = /^\/admin\/applications\/([0-9a-f-]{36})\/files\/([0-9a-f-]{36})$/;
const OWN_FILE = /^\/ngo\/application\/files\/([0-9a-f-]{36})$/;
const PUBLIC_LOGO = /^\/ngos\/([0-9a-f-]{36})\/logo$/;

async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const method = request.method;
  const accountRequest = ACCOUNT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p));
  const serverRequest = pathname === CONSUME_TICKET;
  if (method === "OPTIONS") return new Response(null, { status: 204 });
  try {
    if (accountRequest) return noStore(await accountRoute(request, env, url));
    if (serverRequest) return noStore(await consumeTicket(request, env));
    if (method !== "GET" && method !== "HEAD") {
      return json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET, HEAD, OPTIONS" } });
    }
    switch (pathname) {
      case "/health":
        return json({ ok: true, version: VERSION, environment: env.ENVIRONMENT ?? "unknown", db: Boolean(env.DB), mail: mailConfigured(env), files: Boolean(env.FILES) }, { headers: NO_STORE });
      case "/config": {
        const accounts = env.ACCOUNTS_ENABLED === "true";
        return json({
          accounts, quests: env.QUESTS_V1_ENABLED === "true", files: accounts && Boolean(filesBucket(env)), withdrawal: accounts && env.NGO_WITHDRAWAL_ENABLED === "true",
          // What works right now (IMPL-0021, PROPOSTA), so the apps show only that.
          moderation: { presence: accounts && env.PRESENCE_MODERATION_ENABLED === "true", block: accounts && env.ACCOUNT_BLOCK_ENABLED === "true" },
        }, { headers: NO_STORE });
      }
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
      default: {
        const logo = PUBLIC_LOGO.exec(pathname);
        if (logo) return await publicLogo(request, env, logo[1]);
        const photo = /^\/ngos\/([^/]+)\/photos\/([^/]+)$/.exec(pathname);
        if (photo) return await photoContent(request, env, photo[2], "public", photo[1]);
        if (pathname.startsWith("/ngos/")) return await publicNgo(env, pathname.slice("/ngos/".length));
        return json({ error: "not_found" }, { status: 404 });
      }
    }
  } catch (err) {
    if (err instanceof HttpError) return errorResponse(err);
    // Recognize only the new migration columns, the withdrawal ledger (0009, joined by the signed-in NGO and
    // admin routes) and what a database without 0010 lacks first: the block every session read checks, and the
    // moderation tickets of the realtime server's route. Never retry protected writes with weaker guards.
    if ((accountRequest || serverRequest) && err instanceof Error &&
      /no such column: (?:[a-z_]+\.)?(?:files_deleting|file_write_token|blocked)\b|no such table: (?:ngo_withdrawals|moderation_tickets)\b/i.test(err.message))
      return errorResponse(new HttpError(503, "schema_outdated"));
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
  if (is("POST", "/ngo/photos")) return uploadPhoto(request, env);
  if (is("GET", "/ngo/photos")) return listPhotos(request, env, url.searchParams.get("ngoId") ?? "", false);
  if (is("GET", "/admin/ngo-photos")) return pendingPhotos(request, env);
  const ownPhoto = /^\/ngo\/photos\/([^/]+)$/.exec(pathname);
  if (ownPhoto && method === "DELETE") return deleteOwnPhoto(request, env, ownPhoto[1]);
  const adminPhotos = /^\/admin\/ngos\/([^/]+)\/photos$/.exec(pathname);
  if (adminPhotos && method === "GET") return listPhotos(request, env, adminPhotos[1], true);
  const preview = /^\/(ngo\/photos|admin\/ngo-photos)\/([^/]+)\/content$/.exec(pathname);
  if (preview && (method === "GET" || method === "HEAD")) return photoContent(request, env, preview[2], preview[1].startsWith("admin") ? "admin" : "owner");
  const decision = /^\/admin\/ngo-photos\/([^/]+)\/decision$/.exec(pathname);
  if (decision && method === "POST") return decidePhoto(request, env, decision[1]);
  if (is("POST", "/ngo/application/files/recover")) return recoverFileUploads(request, env);
  const recover = /^\/admin\/applications\/([0-9a-f-]{36})\/files\/recover$/.exec(pathname);
  if (recover && method === "POST") return recoverFileUploads(request, env, recover[1]);
  if (is("POST", "/ngo/application/files")) return uploadFile(request, env, url);
  const own = OWN_FILE.exec(pathname);
  if (own && method === "GET") return downloadOwnFile(request, env, own[1]);
  if (own && method === "DELETE") return deleteFile(request, env, own[1]);
  const adminFile = ADMIN_FILE.exec(pathname);
  if (adminFile && method === "GET") return downloadFileAdmin(request, env, adminFile[1], adminFile[2]);
  if (is("GET", "/admin/applications")) return listApplications(request, env);
  if (is("GET", "/admin/audit")) return listAudit(request, env);
  if (is("GET", "/admin/users")) return listUsers(request, env);
  const adminUser = /^\/admin\/users\/([^/]+)\/(role|block|unblock)$/.exec(pathname);
  if (adminUser && method === "POST")
    return (adminUser[2] === "role" ? changeRole : adminUser[2] === "block" ? blockAccount : unblockAccount)(request, env, adminUser[1]);
  if (is("POST", "/admin/moderation/ticket")) return issueTicket(request, env);
  const logoRemoval = /^\/admin\/ngos\/([^/]+)\/logo\/remove$/.exec(pathname);
  if (logoRemoval && method === "POST") return removeLogoAdmin(request, env, logoRemoval[1]);
  const ngoWithdrawal = /^\/admin\/ngos\/([^/]+)\/withdraw$/.exec(pathname);
  if (ngoWithdrawal && method === "POST") return withdrawNgo(request, env, ngoWithdrawal[1]);
  const m = ADMIN_APP.exec(pathname);
  if (m && method === "GET" && !m[2]) return getApplicationAdmin(request, env, m[1]);
  if (m && method === "POST" && m[2]) return decide(request, env, m[1]);
  throw new HttpError(404, "not_found");
}
