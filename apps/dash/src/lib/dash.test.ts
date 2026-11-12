/** Pure logic of the dashboard: API client, session rules, routes, login fragment, formatting. */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApplicationDetail, ApplicationSummary, Me } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";
import type { ApplicationFile } from "@vila/shared/accounts/files";
import { PALETTE } from "@vila/shared/game/world";

import { type Api, createApi } from "./api";
import { downloadDocument, REVOKE_AFTER_MS, saveBlob } from "./files";
import { ACTION_LABEL, actionText, applicationIdOf, FLAG_LABEL, fileSize, flagText, occupantOf, prettyJson } from "./format";
import { splitLoginFragment } from "./login-token";
import { sendDecision, sendWithdrawal } from "./review";
import { hrefOf, parseRoute, SECTIONS } from "./router";
import { EXPIRED_LINK, isAdmin, openSession } from "./session";
import { THEME } from "./theme";

const BASE = "https://api.example";
const ADMIN: Me = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "admin" };

type Sent = { url: string; init: RequestInit };
/** A fake `fetch` answering from a table of `"METHOD /path"` → [status, body]; a `Blob` body is sent as it is (file bytes). */
function fakeFetch(answers: Record<string, [number, unknown]>) {
  const sent: Sent[] = [];
  const fetcher = (async (input: RequestInfo | URL, init: RequestInit = {}) => {
    sent.push({ url: String(input), init });
    const answer = answers[`${init.method} ${String(input).slice(BASE.length)}`];
    if (!answer) throw new TypeError("fetch failed");
    return new Response(answer[0] === 204 ? null : answer[1] instanceof Blob ? answer[1] : JSON.stringify(answer[1]), { status: answer[0] });
  }) as typeof fetch;
  return { fetcher, sent };
}

const APP = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";
const LOGO: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "logo", contentType: "image/png", size: 4, createdAt: "2026-11-10T12:05:00.000Z" };
const PDF: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", size: 5, createdAt: "2026-11-10T12:06:00.000Z" };
const SCAN: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000003", kind: "document", contentType: "image/jpeg", size: 3, createdAt: "2026-11-11T09:00:00.000Z" };
const filePath = (file: ApplicationFile) => `/admin/applications/${APP}/files/${file.id}`;
const DETAIL = {
  application: { id: APP, status: "under_review", revision: 2 },
  applicant: { nickname: "ong_teste" },
  history: [],
  files: [LOGO],
} as unknown as ApplicationDetail;

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
      "POST /admin/ngos/abc/withdraw": [200, { application: {} }],
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
    // Withdrawal (IMPL-0020): the admin on screen, the revision on screen and the message to the organisation.
    await api.adminWithdraw("abc", "u1", 4, "Mensagem para a organização.");
    const withdrawal = sent[sent.length - 1];
    expect([withdrawal.init.method, withdrawal.url.slice(BASE.length)]).toEqual(["POST", "/admin/ngos/abc/withdraw"]);
    expect(JSON.parse(String(withdrawal.init.body))).toEqual({ accountId: "u1", revision: 4, reason: "Mensagem para a organização." });
  });

  it("asks the donation routes with the admin account and only the fields the API validates", async () => {
    const { fetcher, sent } = fakeFetch({
      "GET /admin/donations/overview": [200, { settings: {}, ngos: [], recentDonations: [], recentRedirects: [] }],
      "POST /admin/donations/settings": [200, { settings: {} }],
      "POST /admin/ngos/abc/payment-config": [200, { payment: {} }],
      "POST /admin/donations/external-proof": [201, { donation: { id: "d1" } }],
    });
    const api = createApi(BASE, fetcher);
    await api.donationOverview();
    await api.saveDonationSettings({ accountId: "u1", primaryNgoName: "Instituto Parceiro", primaryNgoCnpj: "11444777000161", ngoPercentBps: 9500, fixedFeeCents: 80 });
    await api.saveNgoPayment("abc", { accountId: "u1", paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar", linkValidated: true, ngoPercentBps: 9500, fixedFeeCents: 80 });
    await api.registerExternalProof({ accountId: "u1", ngoId: "abc", amountCents: 200, proofReference: "Comprovante 1" });
    expect(sent.map((s) => [s.init.method, s.url.slice(BASE.length)])).toEqual([
      ["GET", "/admin/donations/overview"],
      ["POST", "/admin/donations/settings"],
      ["POST", "/admin/ngos/abc/payment-config"],
      ["POST", "/admin/donations/external-proof"],
    ]);
    expect(JSON.parse(String(sent[2].init.body))).toEqual({
      accountId: "u1",
      paymentMethod: "external_link",
      donationUrl: "https://ong.org.br/doar",
      linkValidated: true,
      ngoPercentBps: 9500,
      fixedFeeCents: 80,
    });
    expect(JSON.parse(String(sent[3].init.body))).toEqual({ accountId: "u1", ngoId: "abc", amountCents: 200, proofReference: "Comprovante 1" });
  });

  it("reads the bytes of a file with the session cookie, as a Blob of the type the API declares", async () => {
    const { fetcher, sent } = fakeFetch({ [`GET ${filePath(PDF)}`]: [200, new Blob(["%PDF-"], { type: "application/pdf" })] });
    const blob = await createApi(BASE, fetcher).fileBytes(APP, PDF.id);
    expect([blob.type, await blob.text()]).toEqual(["application/pdf", "%PDF-"]);
    expect(sent.map((s) => [s.init.method, s.url, s.init.credentials, s.init.body])).toEqual([["GET", `${BASE}${filePath(PDF)}`, "include", undefined]]);
  });

  it("turns a refused or unanswered file read into ApiError, like any other call", async () => {
    const seen: string[] = [];
    const { fetcher } = fakeFetch({
      [`GET ${filePath(LOGO)}`]: [404, { error: "files_disabled" }],
      [`GET ${filePath(PDF)}`]: [404, { error: "not_found" }],
      [`GET ${filePath(SCAN)}`]: [401, { error: "not_signed_in" }],
    });
    const api = createApi(BASE, fetcher, (e) => seen.push(e.code));
    await expect(api.fileBytes(APP, LOGO.id)).rejects.toMatchObject({ status: 404, code: "files_disabled" });
    await expect(api.fileBytes(APP, PDF.id)).rejects.toMatchObject({ status: 404, code: "not_found" });
    await expect(api.fileBytes(APP, SCAN.id)).rejects.toMatchObject({ status: 401, code: "not_signed_in" });
    await expect(api.fileBytes(APP, "unknown")).rejects.toMatchObject({ status: 0, code: "network" });
    // The listener is how the app notices a session that ended while a file was being read.
    expect(seen).toEqual(["files_disabled", "not_found", "not_signed_in"]);
  });

  it("types the feature flags and keeps the ones it does not know", async () => {
    const { fetcher } = fakeFetch({ "GET /config": [200, { accounts: true, quests: false, files: true, withdrawal: false, later: "beta" }] });
    const config = await createApi(BASE, fetcher).config();
    expect([config.accounts, config.files, config.withdrawal, config.later]).toEqual([true, true, false, "beta"]);
  });
});

describe("application files (IMPL-0017)", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reads a document only when asked, exactly once per request, and saves it under a neutral name", async () => {
    const { fetcher, sent } = fakeFetch({
      [`GET /admin/applications/${APP}`]: [200, { ...DETAIL, files: [LOGO, PDF, SCAN] }],
      [`GET ${filePath(PDF)}`]: [200, new Blob(["%PDF-"], { type: "application/pdf" })],
      [`GET ${filePath(SCAN)}`]: [200, new Blob(["jpg"], { type: "image/jpeg" })],
    });
    const api = createApi(BASE, fetcher);
    const saved: Array<[string, string]> = [];
    const save = (blob: Blob, name: string) => void saved.push([name, blob.type]);
    // Loading the application reads no file: each read of a document is an audit row.
    expect((await api.adminGet(APP)).files).toHaveLength(3);
    expect(sent.filter((s) => s.url.includes("/files/"))).toEqual([]);
    await downloadDocument(api, APP, SCAN, 2, save);
    expect(sent.filter((s) => s.url.includes("/files/")).map((s) => s.url)).toEqual([`${BASE}${filePath(SCAN)}`]);
    await downloadDocument(api, APP, PDF, 1, save);
    expect(sent.filter((s) => s.url.includes("/files/")).map((s) => s.url)).toEqual([`${BASE}${filePath(SCAN)}`, `${BASE}${filePath(PDF)}`]);
    expect(saved).toEqual([
      ["documento-2.jpg", "image/jpeg"],
      ["documento-1.pdf", "application/pdf"],
    ]);
  });

  it("saves nothing when the read is refused", async () => {
    const { fetcher, sent } = fakeFetch({ [`GET ${filePath(PDF)}`]: [404, { error: "not_found" }] });
    const saved: string[] = [];
    await expect(downloadDocument(createApi(BASE, fetcher), APP, PDF, 1, (_, name) => void saved.push(name))).rejects.toMatchObject({ code: "not_found" });
    expect([sent.length, saved]).toEqual([1, []]);
  });

  it("downloads through an object URL on a temporary link, and revokes the URL afterwards", () => {
    vi.useFakeTimers();
    const revoked = vi.spyOn(URL, "revokeObjectURL");
    const steps: string[] = [];
    const link = { href: "", download: "", hidden: false, click: () => steps.push(`click ${link.download} ${link.href.split(":")[0]}`), remove: () => steps.push("remove") };
    const page = { createElement: (tag: string) => (steps.push(`create ${tag}`), link), body: { append: () => steps.push("append") } } as unknown as Document;
    saveBlob(new Blob(["%PDF-"], { type: "application/pdf" }), "documento-1.pdf", page);
    expect(steps).toEqual(["create a", "append", "click documento-1.pdf blob", "remove"]);
    expect(link.hidden).toBe(true);
    expect(revoked).not.toHaveBeenCalled();
    vi.advanceTimersByTime(REVOKE_AFTER_MS);
    expect(revoked.mock.calls).toEqual([[link.href]]);
  });
});

describe("decision", () => {
  const checks = { activeCnpj: true, oneYear: true, fundsConfirmable: true };

  it("refreshes the erasure notice when a decision races with account deletion", async () => {
    const current={...DETAIL,applicant:{nickname:"ong_teste",deletionPending:true}};
    const {fetcher}=fakeFetch({
      [`POST /admin/applications/${APP}/decision`]:[409,{error:"account_deleting"}],
      [`GET /admin/applications/${APP}`]:[200,current],
    });
    const result=await sendDecision(createApi(BASE,fetcher),APP,DETAIL,"approve","",checks);
    expect(result).toMatchObject({ok:false,stale:true,error:{code:"account_deleting"},detail:{applicant:{deletionPending:true}}});
  });

  it("re-reads the application after a stale revision, so the current files are the ones on screen", async () => {
    // The organisation sent a document while the review was open: the revision moved from 2 to 3.
    const current = { ...DETAIL, application: { ...DETAIL.application, revision: 3 }, files: [LOGO, PDF] };
    const { fetcher, sent } = fakeFetch({
      [`POST /admin/applications/${APP}/decision`]: [409, { error: "stale_revision" }],
      [`GET /admin/applications/${APP}`]: [200, current],
    });
    const result = await sendDecision(createApi(BASE, fetcher), APP, DETAIL, "approve", "", checks);
    expect(result).toMatchObject({ ok: false, stale: true, error: { code: "stale_revision" } });
    expect([result.detail.application.revision, result.detail.files.map((f) => f.id)]).toEqual([3, [LOGO.id, PDF.id]]);
    expect(sent.map((s) => `${s.init.method} ${s.url.slice(BASE.length)}`)).toEqual([`POST /admin/applications/${APP}/decision`, `GET /admin/applications/${APP}`]);
    // The decision was sent for the version on screen.
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ action: "approve", revision: 2, checks });
  });

  it("keeps what is on screen after any other refusal, without another request", async () => {
    const { fetcher, sent } = fakeFetch({ [`POST /admin/applications/${APP}/decision`]: [400, { error: "note_required", fields: { note: "Explique o motivo." } }] });
    const result = await sendDecision(createApi(BASE, fetcher), APP, DETAIL, "reject", "", checks);
    expect(result).toMatchObject({ ok: false, stale: false, error: { code: "note_required", fields: { note: "Explique o motivo." } } });
    expect(result.detail).toBe(DETAIL);
    expect(sent).toHaveLength(1);
    // Only an approval carries the checks.
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ action: "reject", revision: 2 });
  });

  it("shows a recorded decision with the fresh history, or with the new state when that read fails", async () => {
    const decided = { ...DETAIL.application, status: "published" };
    const fresh = { ...DETAIL, application: decided, history: [{ at: "2026-11-12T10:00:00.000Z", action: "ngo.approve", detail: null, actor: "ana_lima" }] };
    const answers: Record<string, [number, unknown]> = { [`POST /admin/applications/${APP}/decision`]: [200, { application: decided }] };
    const offline = await sendDecision(createApi(BASE, fakeFetch(answers).fetcher), APP, DETAIL, "approve", "", checks);
    expect(offline).toMatchObject({ ok: true, status: "published", detail: { application: { status: "published" }, history: [], files: [LOGO] } });
    const online = await sendDecision(createApi(BASE, fakeFetch({ ...answers, [`GET /admin/applications/${APP}`]: [200, fresh] }).fetcher), APP, DETAIL, "approve", "", checks);
    expect(online).toMatchObject({ ok: true, status: "published", detail: { history: [{ action: "ngo.approve" }] } });
  });
});

describe("withdrawal (IMPL-0020, PROPOSTA)", () => {
  const PUBLISHED = { ...DETAIL, application: { ...DETAIL.application, status: "published" } } as ApplicationDetail;
  const MESSAGE = "A organização pediu para sair da Vila.";
  const route = `POST /admin/ngos/${APP}/withdraw`;

  it("sends the admin on screen, the revision on screen and the message, then shows the fresh history", async () => {
    const withdrawn = { ...PUBLISHED.application, status: "withdrawn", revision: 3, withdrawal: { reason: MESSAGE, at: "2026-11-12T10:00:00.000Z" } };
    const fresh = { ...PUBLISHED, application: withdrawn, history: [{ at: "2026-11-12T10:00:00.000Z", action: "ngo.withdraw", detail: null, actor: "ana_lima" }] };
    const { fetcher, sent } = fakeFetch({ [route]: [200, { application: withdrawn }], [`GET /admin/applications/${APP}`]: [200, fresh] });
    const result = await sendWithdrawal(createApi(BASE, fetcher), APP, PUBLISHED, "u1", MESSAGE);
    expect(result).toMatchObject({ ok: true, status: "withdrawn", detail: { application: { withdrawal: { reason: MESSAGE } }, history: [{ action: "ngo.withdraw" }] } });
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ accountId: "u1", revision: 2, reason: MESSAGE });
    // The withdrawal is recorded: it is shown even when re-reading the history fails.
    const offline = await sendWithdrawal(createApi(BASE, fakeFetch({ [route]: [200, { application: withdrawn }] }).fetcher), APP, PUBLISHED, "u1", MESSAGE);
    expect(offline).toMatchObject({ ok: true, status: "withdrawn", detail: { application: { status: "withdrawn", revision: 3 }, files: [LOGO] } });
  });

  it.each(["stale_revision", "account_deleting", "application_withdrawn", "bad_transition"])("re-reads the application when the screen is out of date (%s)", async (code) => {
    const current = { ...PUBLISHED, application: { ...PUBLISHED.application, revision: 3 }, applicant: { nickname: "ong_teste", deletionPending: code === "account_deleting" } };
    const { fetcher, sent } = fakeFetch({ [route]: [409, { error: code }], [`GET /admin/applications/${APP}`]: [200, current] });
    const result = await sendWithdrawal(createApi(BASE, fetcher), APP, PUBLISHED, "u1", MESSAGE);
    expect(result).toMatchObject({ ok: false, stale: true, error: { code }, detail: { application: { revision: 3 } } });
    expect(sent.map((s) => `${s.init.method} ${s.url.slice(BASE.length)}`)).toEqual([route, `GET /admin/applications/${APP}`]);
  });

  it("keeps what is on screen when the message is refused, without another request", async () => {
    const fields = { reason: "Escreva a mensagem para a organização (10 a 1000 caracteres). Ela lê este texto." };
    const { fetcher, sent } = fakeFetch({ [route]: [400, { error: "reason_required", fields }] });
    const result = await sendWithdrawal(createApi(BASE, fetcher), APP, PUBLISHED, "u1", "curta");
    expect(result).toMatchObject({ ok: false, stale: false, error: { code: "reason_required", fields } });
    expect(result.detail).toBe(PUBLISHED);
    expect(sent).toHaveLength(1);
  });

  it("labels the audit action and the flag, and prints nothing from the audit detail", () => {
    expect(ACTION_LABEL["ngo.withdraw"]).toBe("Retirada da Vila pela administração");
    expect(actionText("ngo.withdraw", JSON.stringify({ from: "published", to: "withdrawn", revision: 3, lots: ["plaza-03"], hasReason: true }))).toBe("Retirada da Vila pela administração");
    expect(FLAG_LABEL.withdrawal).toBe("Retirada de ONG publicada (PROPOSTA)");
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
    expect(FLAG_LABEL.files).toBe("Logo e documentos nas candidaturas (PROPOSTA)");
  });

  it("labels the file events of the audit trail, with the kind of file and never its id", () => {
    expect([ACTION_LABEL["ngo.file_add"], ACTION_LABEL["ngo.file_remove"], ACTION_LABEL["ngo.file_read"]]).toEqual(["Arquivo enviado", "Arquivo removido", "Documento baixado pela administração"]);
    expect(actionText("ngo.file_add", JSON.stringify({ kind: "logo", file: LOGO.id, revision: 2 }))).toBe("Arquivo enviado (logo)");
    expect(actionText("ngo.file_remove", JSON.stringify({ kind: "document", file: PDF.id, revision: 3 }))).toBe("Arquivo removido (documento)");
    expect(actionText("ngo.file_read", JSON.stringify({ kind: "document", file: PDF.id }))).toBe("Documento baixado pela administração");
    // A detail that is missing, broken or of an unknown kind adds nothing (and nothing from it is printed).
    for (const detail of [null, "", "not json", "null", "[]", '{"kind":"constructor"}', '{"kind":"video","file":"x"}']) expect([detail, actionText("ngo.file_add", detail)]).toEqual([detail, "Arquivo enviado"]);
    expect(actionText("ngo.approve", '{"kind":"logo"}')).toBe("Aprovada e publicada");
    expect(actionText("ngo.later", null)).toBe("ngo.later");
  });

  it("prints file sizes for people", () => {
    expect([fileSize(0), fileSize(734), fileSize(1024), fileSize(186_368), fileSize(512 * 1024), fileSize(1_572_864), fileSize(5 * 1024 * 1024)]).toEqual(["0 bytes", "734 bytes", "1 KB", "182 KB", "512 KB", "1,5 MB", "5 MB"]);
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
