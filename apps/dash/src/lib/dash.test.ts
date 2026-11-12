/** Pure logic of the dashboard: API client, session rules, routes, login fragment, formatting. */
import { describe, expect, it } from "vitest";

import type { ApplicationSummary, Me } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";
import { PALETTE } from "@vila/shared/game/world";

import { type Api, createApi } from "./api";
import { applicationIdOf, flagText, occupantOf, prettyJson } from "./format";
import { splitLoginFragment } from "./login-token";
import { hrefOf, parseRoute, SECTIONS } from "./router";
import { EXPIRED_LINK, isAdmin, openSession } from "./session";
import { THEME } from "./theme";

const BASE = "https://api.example";
const ADMIN: Me = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "admin" };

type Sent = { url: string; init: RequestInit };
/** A fake `fetch` answering from a table of `"METHOD /path"` → [status, body]. */
function fakeFetch(answers: Record<string, [number, unknown]>) {
  const sent: Sent[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    sent.push({ url: String(input), init });
    const answer = answers[`${init.method} ${String(input).slice(BASE.length)}`];
    if (!answer) throw new TypeError("fetch failed");
    return new Response(answer[0] === 204 ? null : JSON.stringify(answer[1]), { status: answer[0] });
  }) as typeof fetch;
  return { fetcher, sent };
}

describe("API client", () => {
  it("sends the session cookie and JSON only when there is a body", async () => {
    const { fetcher, sent } = fakeFetch({ "GET /me": [200, { user: ADMIN }], "POST /auth/link": [202, { ok: true }] });
    const api = createApi(BASE, fetcher);
    expect((await api.me()).user?.nickname).toBe("ana_lima");
    await api.requestLink("ana@example.com");
    expect(sent.map((s) => [s.url, s.init.credentials])).toEqual([[`${BASE}/me`, "include"], [`${BASE}/auth/link`, "include"]]);
    expect(sent[0].init.headers).toEqual({ Accept: "application/json" });
    expect(sent[0].init.body).toBeUndefined();
    expect(sent[1].init.headers).toEqual({ Accept: "application/json", "Content-Type": "application/json" });
    expect(sent[1].init.body).toBe('{"email":"ana@example.com"}');
  });

  it("turns failures into ApiError with the API's code, and tells the listener", async () => {
    const seen: string[] = [];
    const { fetcher } = fakeFetch({
      "GET /admin/users": [403, { error: "admin_only" }],
      "POST /admin/applications/abc/decision": [400, { error: "note_required", fields: { note: "Explique o motivo." } }],
      "POST /auth/logout": [204, null],
    });
    const api = createApi(BASE, fetcher, (e) => seen.push(e.code));
    await expect(api.users()).rejects.toMatchObject({ status: 403, code: "admin_only" });
    await expect(api.adminDecide("abc", "reject", 1)).rejects.toMatchObject({ code: "note_required", fields: { note: "Explique o motivo." } });
    await expect(api.health()).rejects.toMatchObject({ status: 0, code: "network" });
    expect(await api.logout()).toBeNull();
    // A request that never got an answer is not an API refusal.
    expect(seen).toEqual(["admin_only", "note_required"]);
  });

  it("asks the review and list routes the way the API documents them", async () => {
    const { fetcher, sent } = fakeFetch({
      "GET /admin/applications": [200, { applications: [] }],
      "GET /admin/applications?status=under_review": [200, { applications: [] }],
      "POST /admin/applications/abc/decision": [200, { application: {} }],
      "GET /admin/audit": [200, { events: [{ at: "2026-01-02T00:00:00.000Z", action: "ngo.submit", subject: "ngo:x", detail: null, actor: null }], next: "2026-01-02T00:00:00.000Z" }],
      "GET /admin/audit?before=2026-01-02T00%3A00%3A00.000Z": [200, { events: [], next: null }],
      "GET /admin/users": [200, { users: [], next: null }],
    });
    const api = createApi(BASE, fetcher);
    await api.adminList();
    await api.adminList("under_review");
    await api.adminDecide("abc", "approve", 3, undefined, { activeCnpj: true, oneYear: true, fundsConfirmable: true });
    expect(JSON.parse(String(sent[2].init.body))).toEqual({ action: "approve", revision: 3, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true } });
    const first = await api.audit();
    expect([first.items.length, first.next]).toEqual([1, "2026-01-02T00:00:00.000Z"]);
    expect(await api.audit(first.next!)).toEqual({ items: [], next: null });
    expect(await api.users()).toEqual({ items: [], next: null });
  });
});

describe("session", () => {
  const fake = (over: Partial<Pick<Api, "config" | "verify" | "me">>, calls: string[] = []) => ({
    config: async () => (calls.push("config"), { accounts: true }),
    verify: async () => (calls.push("verify"), { user: ADMIN }),
    me: async () => (calls.push("me"), { user: null }),
    ...over,
  });

  it("calls no account route while accounts are off", async () => {
    const calls: string[] = [];
    const api = fake({ config: async () => (calls.push("config"), { accounts: false }) }, calls);
    expect(await openSession(api, "token")).toEqual({ kind: "accounts_off" });
    expect(await openSession(fake({ config: async () => ({}) }, calls), null)).toEqual({ kind: "accounts_off" });
    expect(calls).toEqual(["config"]);
  });

  it("signs in with a link token, and otherwise restores the cookie session", async () => {
    const calls: string[] = [];
    expect(await openSession(fake({}, calls), "token")).toEqual({ kind: "signed_in", user: ADMIN });
    expect(calls).toEqual(["config", "verify"]);
    expect(await openSession(fake({ me: async () => ({ user: ADMIN }) }), null)).toEqual({ kind: "signed_in", user: ADMIN });
    expect(await openSession(fake({}), null)).toEqual({ kind: "signed_out", notice: undefined });
  });

  it("explains a used or expired link, unless a session already exists", async () => {
    const refused = async (): Promise<{ user: Me }> => {
      throw new ApiError(400, "invalid_token");
    };
    expect(await openSession(fake({ verify: refused }), "token")).toEqual({ kind: "signed_out", notice: EXPIRED_LINK });
    expect(await openSession(fake({ verify: refused, me: async () => ({ user: ADMIN }) }), "token")).toEqual({ kind: "signed_in", user: ADMIN });
  });

  it("reports an unreachable API instead of pretending to be signed out, and keeps an unused link token", async () => {
    const down = async (): Promise<never> => {
      throw new ApiError(0, "network");
    };
    expect(await openSession(fake({ config: down }), null)).toEqual({ kind: "unavailable", token: null });
    expect(await openSession(fake({ config: down }), "token")).toEqual({ kind: "unavailable", token: "token" });
    expect(await openSession(fake({ verify: down }), "token")).toEqual({ kind: "unavailable", token: "token" });
    expect(await openSession(fake({ me: down }), null)).toEqual({ kind: "unavailable", token: null });
  });

  it("does not call a link expired when the API refused for another reason", async () => {
    const calls: string[] = [];
    const limited = async (): Promise<never> => {
      throw new ApiError(429, "too_many_requests");
    };
    // The rate limiter answers before the token is looked at: the link is still good, so it is kept for a retry.
    expect(await openSession(fake({ verify: limited }, calls), "token")).toEqual({
      kind: "unavailable",
      token: "token",
      reason: "Muitas tentativas seguidas. Espere um minuto e tente de novo.",
    });
    expect(calls).toEqual(["config"]);
    const broken = async (): Promise<never> => {
      throw new ApiError(503, "db_unavailable");
    };
    expect(await openSession(fake({ verify: broken }), "token")).toMatchObject({ kind: "unavailable", token: "token" });
  });

  it("treats only the admin role as an admin", () => {
    expect(isAdmin({ kind: "signed_in", user: ADMIN })).toBe(true);
    expect(isAdmin({ kind: "signed_in", user: { ...ADMIN, role: "player" } })).toBe(false);
    expect(isAdmin({ kind: "accounts_off" })).toBe(false);
    expect(isAdmin({ kind: "signed_out" })).toBe(false);
  });
});

describe("routes", () => {
  const ID = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";

  it("parses every section and round-trips through hrefOf", () => {
    for (const { section } of SECTIONS) expect(parseRoute(`#/${section}`)).toEqual({ section });
    expect(parseRoute(`#/applications/${ID}`)).toEqual({ section: "applications", id: ID });
    expect(parseRoute(hrefOf({ section: "applications", id: ID }))).toEqual({ section: "applications", id: ID });
    expect(hrefOf({ section: "audit" })).toBe("#/audit");
  });

  it("falls back to the first section for anything unknown, including a login fragment", () => {
    for (const hash of ["", "#", "#/", "#/nope", "#login=abc", "#/applications/not-a-uuid/extra", "#/audit/x", "#/users/../system"])
      expect([hash, parseRoute(hash).section]).toEqual([hash, "applications"]);
    expect(parseRoute("#/applications/<script>")).toEqual({ section: "applications" });
    expect(parseRoute("#/lots/")).toEqual({ section: "lots" });
  });
});

describe("login fragment", () => {
  it("takes the token out and keeps the rest of the fragment", () => {
    expect(splitLoginFragment("#login=abc123")).toEqual({ token: "abc123", rest: "" });
    expect(splitLoginFragment("#login=a%2Bb&x=1")).toEqual({ token: "a+b", rest: "#x=1" });
    expect(splitLoginFragment("#/audit")).toEqual({ token: null, rest: "#/audit" });
    expect(splitLoginFragment("")).toEqual({ token: null, rest: "" });
  });
});

describe("what the screens print", () => {
  it("links an audit subject to its application only when it is one", () => {
    expect(applicationIdOf("ngo:3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b")).toBe("3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b");
    expect(applicationIdOf("user:3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b")).toBeNull();
    expect(applicationIdOf("ngo:javascript:alert(1)")).toBeNull();
  });

  it("pretty-prints audit detail and shows broken JSON as it is", () => {
    expect(prettyJson('{"from":"submitted","to":"published"}')).toBe('{\n  "from": "submitted",\n  "to": "published"\n}');
    expect(prettyJson("not json")).toBe("not json");
  });

  it("reads feature flags without guessing", () => {
    expect([flagText(true), flagText(false), flagText("beta"), flagText(3)]).toEqual(["Ligado", "Desligado", '"beta"', "3"]);
  });

  it("shows the current lot occupant, excluding rejected and withdrawn historical applications", () => {
    const app = (id: string, lotId: string, status: ApplicationSummary["status"]): ApplicationSummary => ({ id, lotId, status, name: id, city: "Recife", revision: 1, createdAt: "", updatedAt: "" });
    const apps = [app("withdrawn", "plaza-03", "withdrawn"), app("old", "plaza-03", "rejected"), app("now", "plaza-03", "under_review"), app("other", "plaza-04", "published"), app("gone", "plaza-05", "withdrawn")];
    expect(occupantOf({ id: "plaza-03" }, apps)?.id).toBe("now");
    expect(occupantOf({ id: "plaza-04" }, apps)?.id).toBe("other");
    expect(occupantOf({ id: "plaza-05" }, apps)).toBeUndefined();
  });

  it("takes every colour from the product palette", () => {
    const palette = new Set<string>(Object.values(PALETTE));
    for (const [name, value] of Object.entries(THEME)) expect([name, palette.has(value)]).toEqual([name, true]);
  });
});
