import { readFileSync } from "node:fs";
import { DatabaseSync, type SQLInputValue } from "node:sqlite";
import { URL as NodeURL } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleApi, type Env } from "./api";
interface Account { id: string; name: string; nickname: string; city: string; email: string; }

// Exercise real SQL and foreign keys, with D1's atomic batch semantics.
function database() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  sqlite.exec(readFileSync(new NodeURL("../../../migrations/0004_accounts.sql", import.meta.url), "utf8"));
  class Statement {
    constructor(readonly sql: string, readonly values: SQLInputValue[] = []) {}
    bind(...values: SQLInputValue[]) { return new Statement(this.sql, values); }
    async first() { return sqlite.prepare(this.sql).get(...this.values) ?? null; }
    async run() { return execute(this); }
  }
  function execute(s: Statement) {
    const result = sqlite.prepare(s.sql).run(...s.values);
    return { success: true, meta: { changes: Number(result.changes) }, results: [] };
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec("BEGIN IMMEDIATE");
      try {
        const results = statements.map(execute);
        sqlite.exec("COMMIT");
        return results;
      } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  } as unknown as D1Database;
  return { sqlite, db };
}

const origin = "http://localhost:8787";
const pageOrigin = "http://localhost:8799";
const signup = { mode: "signup", name: "Maria Silva", nickname: "Maria_1", city: "São Paulo", email: "maria@example.test" };
const cookiePair = (response: Response) => response.headers.get("Set-Cookie")!.split(";")[0];

describe("optional magic-link accounts", () => {
  let store: ReturnType<typeof database>;
  let env: Env;
  beforeEach(() => {
    store = database();
    env = { DB: store.db, ENVIRONMENT: "development", AUTH_MODE: "local", AUTH_API_ORIGIN: origin, AUTH_PAGE_ORIGIN: pageOrigin, ALLOWED_ORIGINS: pageOrigin };
  });
  afterEach(() => store.sqlite.close());
  const call = (path: string, body?: unknown, cookies = "", headers: Record<string, string> = {}) =>
    handleApi(new Request(`${origin}/auth/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: { Origin: pageOrigin, "Content-Type": "application/json", Cookie: cookies, ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    }), env);
  function count(table: string) { return Number(store.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get()!.n); }
  async function sessionUser(cookies = "") {
    return (await (await call("session", undefined, cookies)).json() as { user: Account | null }).user;
  }
  async function issue(fields: Record<string, string> = signup) {
    const response = await call("request", fields);
    expect(response.status).toBe(202);
    const row = store.sqlite.prepare("SELECT link FROM auth_local_outbox WHERE recipient = ? ORDER BY rowid DESC LIMIT 1").get(fields.email.trim().toLowerCase())!;
    return { token: new URL(String(row.link)).hash.slice(7), browser: cookiePair(response), response };
  }
  async function register() {
    const link = await issue();
    const response = await call("confirm", { token: link.token }, link.browser);
    expect(response.status).toBe(200);
    return { ...link, session: cookiePair(response), response };
  }

  it("verifies before account creation, hashes credentials, persists and revokes a private session", async () => {
    const link = await issue({ ...signup, email: " Maria@Example.test " });
    expect(count("auth_users")).toBe(0);
    expect(await link.response.json()).toEqual({ accepted: true });
    expect(store.sqlite.prepare("SELECT token_hash FROM auth_links").get()!.token_hash).not.toBe(link.token);
    const response = await call("confirm", { token: link.token }, link.browser);
    expect(response.status).toBe(200);
    expect(response.headers.get("Set-Cookie")).toContain("HttpOnly; SameSite=Lax; Max-Age=604800");
    const session = cookiePair(response);
    expect(count("auth_links")).toBe(0);
    expect(count("auth_local_outbox")).toBe(0);
    const own = await call("session", undefined, session);
    expect(own.headers.get("Cache-Control")).toBe("no-store");
    expect(await sessionUser(session)).toMatchObject({ name: signup.name, nickname: signup.nickname, email: signup.email, city: signup.city });
    expect(await sessionUser()).toBeNull();
    expect((await call("logout", {}, session)).headers.get("Set-Cookie")).toContain("Max-Age=0");
    expect(count("auth_sessions")).toBe(0);
    expect(await sessionUser(session)).toBeNull();
  });

  it("resists link previews, wrong browsers, concurrent confirmation and replay", async () => {
    const link = await issue();
    expect((await call("confirm")).status).toBe(405);
    expect((await call("confirm", { token: link.token })).status).toBe(400);
    expect((await call("confirm", { token: link.token }, `vila_login=${"a".repeat(64)}`)).status).toBe(400);
    const responses = await Promise.all([call("confirm", { token: link.token }, link.browser), call("confirm", { token: link.token }, link.browser)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 400]);
    expect(count("auth_users")).toBe(1);
    expect(count("auth_sessions")).toBe(1);
    expect((await call("confirm", { token: link.token }, link.browser)).status).toBe(400);
  });

  it("expires sessions and links and cleans their local delivery fixtures", async () => {
    const account = await register();
    store.sqlite.exec("UPDATE auth_sessions SET expires_at = 0");
    expect(await sessionUser(account.session)).toBeNull();
    const link = await issue();
    store.sqlite.exec("UPDATE auth_links SET expires_at = 0");
    expect((await call("confirm", { token: link.token }, link.browser)).status).toBe(400);
    expect(count("auth_links")).toBe(0);
    expect(count("auth_local_outbox")).toBe(0);
    expect(count("auth_sessions")).toBe(0);
  });

  it("does not overwrite existing profiles and invalidates the previous session when logging in", async () => {
    const first = await register();
    const second = await issue({ ...signup, name: "Other Name", nickname: "Other_Nick", city: "Other City", email: signup.email.toUpperCase() });
    const response = await call("confirm", { token: second.token }, `${second.browser}; ${first.session}`);
    expect(response.status).toBe(200);
    expect(count("auth_users")).toBe(1);
    expect(count("auth_sessions")).toBe(1);
    expect(await sessionUser(first.session)).toBeNull();
    expect((await sessionUser(cookiePair(response)))?.name).toBe(signup.name);
    const login = await issue({ mode: "login", email: signup.email });
    expect((await call("confirm", { token: login.token }, login.browser)).status).toBe(200);
  });

  it("enforces nickname uniqueness case-insensitively and rolls back the losing transaction", async () => {
    const one = await issue();
    const two = await issue({ ...signup, email: "other@example.test", nickname: signup.nickname.toUpperCase() });
    const responses = await Promise.all([call("confirm", { token: one.token }, one.browser), call("confirm", { token: two.token }, two.browser)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(count("auth_users")).toBe(1);
    expect(count("auth_sessions")).toBe(1);
    expect(count("auth_links")).toBe(1);
    expect(count("auth_local_outbox")).toBe(1);
  });

  it("responds identically for known and unknown emails without registering unknown logins", async () => {
    await register();
    const known = await issue({ mode: "login", email: signup.email });
    const unknown = await issue({ mode: "login", email: "unknown@example.test" });
    expect(await known.response.json()).toEqual(await unknown.response.json());
    expect((await call("confirm", { token: unknown.token }, unknown.browser)).status).toBe(400);
    expect(count("auth_users")).toBe(1);
  });

  it("rejects cross-origin writes, malformed bodies and invalid fields", async () => {
    const origins: Record<string, string>[] = [{ Origin: "" }, { Origin: "https://attacker.test" }, { "Sec-Fetch-Site": "cross-site" }];
    for (const headers of origins) for (const path of ["request", "confirm", "logout"]) expect((await call(path, signup, "", headers)).status).toBe(403);
    for (const body of [[], null, { ...signup, mode: ["signup"] }, { ...signup, mode: { toString: "signup" } }, { ...signup, email: "bad" }, { ...signup, nickname: "bad space" }, { ...signup, name: "x" }, { ...signup, city: "a\nb" }]) expect((await call("request", body)).status).toBe(400);
    expect((await call("request", signup, "", { "Content-Type": "text/plain" })).status).toBe(400);
    expect((await call("request", { ...signup, padding: "a".repeat(4096) })).status).toBe(400);
    expect((await call("confirm", { token: "garbage" })).status).toBe(400);
    expect(count("auth_links")).toBe(0);
  });

  it("limits requests per email and per IP across different addresses", async () => {
    for (let n = 0; n < 3; n++) expect((await call("request", { mode: "login", email: signup.email })).status).toBe(202);
    expect((await call("request", { mode: "login", email: signup.email.toUpperCase() })).status).toBe(429);
    for (let n = 0; n < 6; n++) expect((await call("request", { mode: "login", email: `person${n}@example.test` })).status).toBe(202);
    const limited = await call("request", { mode: "login", email: "extra@example.test" });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
  });

  it("fails closed without explicit loopback development settings; never exposes the outbox", async () => {
    for (const override of [{ ENVIRONMENT: "production" }, { AUTH_MODE: undefined }, { DB: undefined }, { AUTH_API_ORIGIN: "http://elsewhere.test" }]) {
      const previous = env;
      env = { ...env, ...override };
      expect((await call("request", signup)).status).toBe(503);
      expect(await (await call("session")).json()).toEqual({ available: false, user: null });
      env = previous;
    }
    env.AUTH_API_ORIGIN = "https://app.vilanoeldobem.com.br";
    expect((await handleApi(new Request(`${env.AUTH_API_ORIGIN}/auth/request`, { method: "POST", body: JSON.stringify(signup) }), env)).status).toBe(503);
    expect(count("auth_links")).toBe(0);
    expect((await call("outbox")).status).toBe(404);
  });

  it("keeps page callbacks on the client and grants credentialed CORS only to its exact origin", async () => {
    const link = await issue();
    const row = store.sqlite.prepare("SELECT link FROM auth_local_outbox").get()!;
    expect(new URL(String(row.link)).origin).toBe(pageOrigin);
    expect(link.response.headers.get("Access-Control-Allow-Origin")).toBe(pageOrigin);
    expect(link.response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    const preflight = (target: string, method = "POST", headers = "content-type") => handleApi(new Request(`${origin}/auth/request`, {
      method: "OPTIONS", headers: { Origin: target, "Access-Control-Request-Method": method, "Access-Control-Request-Headers": headers },
    }), env);
    expect((await preflight(pageOrigin)).status).toBe(204);
    for (const response of [await preflight("http://localhost:8799.evil.test"), await preflight(pageOrigin, "DELETE"), await preflight(pageOrigin, "POST", "x-injected")]) expect(response.status).toBe(403);
    const forbidden = await call("request", signup, "", { Origin: "https://attacker.test" });
    expect(forbidden.headers.has("Access-Control-Allow-Origin")).toBe(false);
    expect(forbidden.headers.has("Access-Control-Allow-Credentials")).toBe(false);
    const publicResponse = await handleApi(new Request(`${origin}/health`, { headers: { Origin: pageOrigin } }), env);
    expect(publicResponse.headers.has("Access-Control-Allow-Credentials")).toBe(false);
  });

  it("sets Secure cookies on HTTPS, including local testing", async () => {
    env.AUTH_API_ORIGIN = "https://localhost:8787";
    const response = await handleApi(new Request(`${env.AUTH_API_ORIGIN}/auth/request`, {
      method: "POST", headers: { Origin: pageOrigin, "Content-Type": "application/json" }, body: JSON.stringify(signup),
    }), env);
    expect(response.status).toBe(202);
    expect(response.headers.get("Set-Cookie")).toContain("; Secure");
  });
});
