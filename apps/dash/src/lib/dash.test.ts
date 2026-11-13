/** Pure logic of the dashboard: API client, session rules, routes, login fragment, formatting. */
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ApplicationDetail, ApplicationSummary, Me, UserSummary } from "@vila/shared/accounts/contract";
import { ApiError } from "@vila/shared/accounts/errors";
import type { ApplicationFile } from "@vila/shared/accounts/files";
import { BLOCK_MESSAGE_ERROR, BLOCK_MESSAGE_MAX } from "@vila/shared/accounts/moderation";
import { PALETTE } from "@vila/shared/game/world";

// The source of the script the HTML loads before the bundle, to run it here against a fake page.
import loginFragmentScript from "../../public/login-fragment.js?raw";
import { type Api, createApi, type Page } from "./api";
import { downloadDocument, REVOKE_AFTER_MS, saveBlob } from "./files";
import { ACTION_LABEL, actionText, applicationIdOf, FLAG_LABEL, fileSize, flagRows, flagText, occupantOf, prettyJson, roleLabel } from "./format";
import { readPages } from "./hooks";
import { isId } from "./ids";
import { splitLoginFragment } from "./login-token";
import {
  ADMIN_BLOCK_NOTE,
  BLOCK_MESSAGE_LABEL,
  BLOCKED_ROLE_NOTE,
  confirmationOf,
  NO_ROW_TEXT,
  offerFor,
  OWN_BLOCK_NOTE,
  OWN_ROLE_NOTE,
  sendUserAction,
  USER_ACTION_LABEL,
  type UserAction,
  withUser,
} from "./moderation";
import { forgetReturn, rememberReturn, RETURN_KEY, RETURN_TTL_MS, type ReturnStore, takeReturn } from "./return-to";
import { logoRefusalText, sendDecision, sendLogoRemoval, sendWithdrawal } from "./review";
import { hrefOf, namesSection, parseRoute, SECTIONS } from "./router";
import {
  EXPIRED_LINK,
  isAdmin,
  lostAdmin,
  openSession,
  sameDashboard,
  type Session,
  SESSION_CONTRADICTED,
  SESSION_ENDED,
  sessionChangedBy,
  trackSession,
  viewOf,
} from "./session";
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
const USER = "b0000000-0000-4000-8000-000000000002";
const LOGO: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000001", kind: "logo", contentType: "image/png", size: 4, createdAt: "2026-11-10T12:05:00.000Z" };
const PDF: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000002", kind: "document", contentType: "application/pdf", size: 5, createdAt: "2026-11-10T12:06:00.000Z" };
const SCAN: ApplicationFile = { id: "aaaaaaaa-0000-4000-8000-000000000003", kind: "document", contentType: "image/jpeg", size: 3, createdAt: "2026-11-11T09:00:00.000Z" };
/** A well-formed id the fake API has no answer for. */
const UNANSWERED = "aaaaaaaa-0000-4000-8000-00000000ffff";
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
      [`POST /admin/applications/${APP}/decision`]: [400, { error: "note_required", fields: { note: "Explique o motivo." } }],
      "POST /auth/logout": [204, null],
    });
    const api = createApi(BASE, fetcher, (e) => seen.push(e.code));
    await expect(api.users()).rejects.toMatchObject({ status: 403, code: "admin_only" });
    await expect(api.adminDecide(APP, "reject", 1)).rejects.toMatchObject({ code: "note_required", fields: { note: "Explique o motivo." } });
    await expect(api.health()).rejects.toMatchObject({ status: 0, code: "network" });
    expect(await api.logout()).toBeNull();
    // A request that never got an answer is not an API refusal.
    expect(seen).toEqual(["admin_only", "note_required"]);
  });

  it("asks the review and list routes the way the API documents them", async () => {
    const { fetcher, sent } = fakeFetch({
      "GET /admin/applications": [200, { applications: [] }],
      "GET /admin/applications?status=under_review": [200, { applications: [] }],
      [`POST /admin/applications/${APP}/decision`]: [200, { application: {} }],
      [`POST /admin/ngos/${APP}/withdraw`]: [200, { application: {} }],
      "GET /admin/audit": [200, { events: [{ at: "2026-01-02T00:00:00.000Z", action: "ngo.submit", subject: "ngo:x", detail: null, actor: null }], next: "2026-01-02T00:00:00.000Z" }],
      "GET /admin/audit?before=2026-01-02T00%3A00%3A00.000Z": [200, { events: [], next: null }],
      "GET /admin/users": [200, { users: [], next: null }],
    });
    const api = createApi(BASE, fetcher);
    await api.adminList();
    await api.adminList("under_review");
    await api.adminDecide(APP, "approve", 3, undefined, { activeCnpj: true, oneYear: true, fundsConfirmable: true });
    expect(JSON.parse(String(sent[2].init.body))).toEqual({ action: "approve", revision: 3, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true } });
    const first = await api.audit();
    expect([first.items.length, first.next]).toEqual([1, "2026-01-02T00:00:00.000Z"]);
    expect(await api.audit(first.next!)).toEqual({ items: [], next: null });
    expect(await api.users()).toEqual({ items: [], next: null });
    // Withdrawal (IMPL-0020): the admin on screen, the revision on screen and the message to the organisation.
    await api.adminWithdraw(APP, "u1", 4, "Mensagem para a organização.");
    const withdrawal = sent[sent.length - 1];
    expect([withdrawal.init.method, withdrawal.url.slice(BASE.length)]).toEqual(["POST", `/admin/ngos/${APP}/withdraw`]);
    expect(JSON.parse(String(withdrawal.init.body))).toEqual({ accountId: "u1", revision: 4, reason: "Mensagem para a organização." });
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
    await expect(api.fileBytes(APP, UNANSWERED)).rejects.toMatchObject({ status: 0, code: "network" });
    // The listener is how the app notices a session that ended while a file was being read.
    expect(seen).toEqual(["files_disabled", "not_found", "not_signed_in"]);
  });

  it("types the feature flags and keeps the ones it does not know", async () => {
    const { fetcher } = fakeFetch({ "GET /config": [200, { accounts: true, quests: false, files: true, withdrawal: false, moderation: { presence: false, block: true }, later: "beta" }] });
    const config = await createApi(BASE, fetcher).config();
    expect([config.accounts, config.files, config.withdrawal, config.later]).toEqual([true, true, false, "beta"]);
    expect([config.moderation?.presence, config.moderation?.block]).toEqual([false, true]);
  });

  it("asks the role, block, unblock and logo-removal routes in the name of the signed-in account (IMPL-0021)", async () => {
    const user = { id: USER, nickname: "bia", role: "player", city: "Recife", createdAt: "2026-11-01T00:00:00.000Z", verified: true, blocked: false };
    const { fetcher, sent } = fakeFetch({
      [`POST /admin/users/${USER}/role`]: [200, { user: { ...user, role: "admin" } }],
      [`POST /admin/users/${USER}/block`]: [200, { user: { ...user, blocked: true } }],
      [`POST /admin/users/${USER}/unblock`]: [200, { user }],
      [`POST /admin/ngos/${APP}/logo/remove`]: [200, { application: { id: APP, revision: 3 } }],
    });
    const api = createApi(BASE, fetcher);
    expect((await api.adminSetRole(USER, "u1", "admin")).user.role).toBe("admin");
    expect((await api.adminBlock(USER, "u1", "Mensagem para a pessoa.")).user.blocked).toBe(true);
    expect((await api.adminUnblock(USER, "u1")).user.blocked).toBe(false);
    expect((await api.adminRemoveLogo(APP, "u1", 2)).application.revision).toBe(3);
    expect(sent.map((s) => [s.init.method, s.url.slice(BASE.length), s.init.credentials, JSON.parse(String(s.init.body))])).toEqual([
      ["POST", `/admin/users/${USER}/role`, "include", { accountId: "u1", role: "admin" }],
      ["POST", `/admin/users/${USER}/block`, "include", { accountId: "u1", message: "Mensagem para a pessoa." }],
      ["POST", `/admin/users/${USER}/unblock`, "include", { accountId: "u1" }],
      ["POST", `/admin/ngos/${APP}/logo/remove`, "include", { accountId: "u1", revision: 2 }],
    ]);
  });

  it("never puts anything that is not a well-formed id into a request path", async () => {
    const seen: string[] = [];
    const { fetcher, sent } = fakeFetch({});
    const api = createApi(BASE, fetcher, (e) => seen.push(e.code));
    for (const bad of ["", "abc", "../users", `${APP}/decision`, `${APP}?x=1`, APP.toUpperCase(), ` ${APP}`, "%2e%2e", "<script>"]) {
      const calls = [
        () => api.adminGet(bad),
        () => api.adminDecide(bad, "reject", 1),
        () => api.adminWithdraw(bad, "u1", 1, "Mensagem para a organização."),
        () => api.adminRemoveLogo(bad, "u1", 1),
        () => api.adminSetRole(bad, "u1", "admin"),
        () => api.adminBlock(bad, "u1", "Mensagem para a pessoa."),
        () => api.adminUnblock(bad, "u1"),
        () => api.fileBytes(bad, LOGO.id),
        () => api.fileBytes(APP, bad),
      ];
      // Refused as a rejection (never a synchronous throw), as "not found", like the API would answer.
      for (const call of calls) await expect(call()).rejects.toMatchObject({ status: 404, code: "not_found" });
    }
    // Nothing was sent, and the session listener heard nothing: the API never spoke.
    expect([sent.length, seen]).toEqual([0, []]);
    expect([isId(APP), isId(APP.toUpperCase()), isId(`${APP}\n`), isId(null), isId(42)]).toEqual([true, false, false, false, false]);
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

  const PLAYER: Me = { ...ADMIN, role: "player" };
  const BLOCK = { message: "Sua conta foi bloqueada por desrespeitar outras pessoas.", at: "2026-11-12T10:00:00.000Z" };

  it("shows each session what it may see: the dashboard only to an administrator who is not blocked", () => {
    const views = (
      [
        { kind: "loading" },
        { kind: "unavailable", token: null },
        { kind: "accounts_off" },
        { kind: "signed_out" },
        { kind: "signed_in", user: ADMIN },
        { kind: "signed_in", user: PLAYER },
        { kind: "signed_in", user: { ...PLAYER, blocked: BLOCK } },
        // The API never blocks an administrator; if it ever says so, the block wins.
        { kind: "signed_in", user: { ...ADMIN, blocked: BLOCK } },
      ] satisfies Session[]
    ).map(viewOf);
    expect(views).toEqual(["starting", "unavailable", "dashboard", "sign_in", "dashboard", "not_admin", "blocked", "blocked"]);
  });

  it("opens a restricted session for a blocked account, by link or by cookie, keeping the message", async () => {
    const blocked = { ...PLAYER, blocked: BLOCK };
    for (const session of [await openSession(fake({ verify: async () => ({ user: blocked }) }), "token"), await openSession(fake({ me: async () => ({ user: blocked }) }), null)]) {
      expect(session).toEqual({ kind: "signed_in", user: blocked });
      expect(viewOf(session)).toBe("blocked");
    }
  });

  it("reads the session again only for refusals about who is signed in, never for refusals about the action", () => {
    expect(["not_signed_in", "admin_only", "session_blocked", "accounts_disabled"].map(sessionChangedBy)).toEqual([true, true, true, true]);
    for (const code of ["last_admin", "self_role", "self_block", "account_blocked", "admin_account", "bad_transition", "stale_revision", "not_found", "message_required", "account_changed", "network"])
      expect([code, sessionChangedBy(code)]).toEqual([code, false]);
  });

  /**
   * The app as it runs, without React: the API client tells the tracker about refusals (services.ts), the tracker
   * reads the session (App.tsx), and whenever the dashboard is drawn its accounts section reads the list, as
   * `Users` does when it mounts. A fake API that keeps contradicting itself would make this run for ever, so the
   * fake stops answering after `limit` requests and the test fails on the count.
   */
  function runningApp(answers: Record<string, [number, unknown]>, limit = 40) {
    const { fetcher, sent } = fakeFetch(answers);
    const shown: Array<{ session: Session; demoted: boolean }> = [];
    const capped = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (sent.length >= limit) throw new TypeError("too many requests");
      return fetcher(input, init);
    }) as typeof fetch;
    const api = createApi(BASE, capped, (e) => sessionChangedBy(e.code) && tracker.refused());
    const tracker = trackSession(api, (session, demoted) => {
      shown.push({ session, demoted });
      if (viewOf(session) === "dashboard") void api.users().catch(() => null);
    });
    return {
      tracker,
      api,
      shown,
      requests: () => sent.map((s) => `${s.init.method} ${s.url.slice(BASE.length)}`),
      views: () => shown.map((s) => viewOf(s.session)),
      /** Waits until nothing new was asked or drawn for a few turns of the event loop. */
      settle: async () => {
        for (let quiet = 0, seen = -1; quiet < 5; ) {
          await new Promise((done) => setTimeout(done, 0));
          const now = sent.length + shown.length;
          quiet = now === seen ? quiet + 1 : 0;
          seen = now;
        }
      },
    };
  }

  it("moves an administrator demoted while using the dashboard to the admin-only state on the next request, without a loop", async () => {
    // The role was taken by another administrator: the session is still valid, `/admin/*` now answers admin_only.
    const answers: Record<string, [number, unknown]> = { "GET /admin/users": [200, { users: [], next: null }], "GET /config": [200, { accounts: true }], "GET /me": [200, { user: ADMIN }] };
    const app = runningApp(answers);
    app.tracker.follow(openSession(app.api, null));
    await app.settle();
    expect(app.views()).toEqual(["dashboard"]);
    answers["GET /admin/users"] = [403, { error: "admin_only" }];
    answers["GET /me"] = [200, { user: PLAYER }];
    await expect(app.api.users()).rejects.toMatchObject({ status: 403, code: "admin_only" });
    await app.settle();
    expect(app.views()).toEqual(["dashboard", "starting", "not_admin"]);
    expect(app.shown[2]).toEqual({ session: { kind: "signed_in", user: PLAYER }, demoted: true });
    // One refused request, one session read (`/config`, `/me`), and nothing after it: the admin-only screen asks for nothing.
    expect(app.requests().slice(3)).toEqual(["GET /admin/users", "GET /config", "GET /me"]);
  });

  it("sends a session that really ended to the sign-in screen, with the notice", async () => {
    const answers: Record<string, [number, unknown]> = { "GET /admin/users": [200, { users: [], next: null }], "GET /config": [200, { accounts: true }], "GET /me": [200, { user: ADMIN }] };
    const app = runningApp(answers);
    app.tracker.follow(openSession(app.api, null));
    await app.settle();
    answers["GET /admin/users"] = [401, { error: "not_signed_in" }];
    answers["GET /me"] = [200, { user: null }];
    await expect(app.api.users()).rejects.toMatchObject({ code: "not_signed_in" });
    await app.settle();
    expect(app.shown.slice(1)).toEqual([
      { session: { kind: "loading" }, demoted: false },
      { session: { kind: "signed_out", notice: SESSION_ENDED }, demoted: false },
    ]);
    expect(app.requests().slice(3)).toEqual(["GET /admin/users", "GET /config", "GET /me"]);
  });

  it.each([
    [403, "admin_only"],
    [403, "session_blocked"],
    [401, "not_signed_in"],
  ])("does not loop when admin routes answer %i %s while /me still says administrator", async (status, code) => {
    // An API that contradicts itself: every admin route refuses, `/me` keeps answering the same administrator.
    const app = runningApp({ "GET /admin/users": [status, { error: code }], "GET /config": [200, { accounts: true }], "GET /me": [200, { user: ADMIN }] });
    app.tracker.follow(openSession(app.api, null));
    await app.settle();
    // The dashboard was drawn once, its request was refused, the session was read once more, and that is all.
    expect(app.requests()).toEqual(["GET /config", "GET /me", "GET /admin/users", "GET /config", "GET /me"]);
    expect(app.views()).toEqual(["dashboard", "starting", "unavailable"]);
    expect(app.shown[2]).toEqual({ session: { kind: "unavailable", token: null, reason: SESSION_CONTRADICTED }, demoted: false });

    // "Tentar de novo" is the only thing that asks again, and each press costs the same bounded round.
    for (let press = 1; press <= 3; press++) {
      app.tracker.reopen(null);
      await app.settle();
      expect(app.requests()).toHaveLength(5 + 5 * press);
      expect(app.views().slice(-4)).toEqual(["starting", "dashboard", "starting", "unavailable"]);
    }

    // Once the API agrees with itself again, the same button opens the dashboard for good.
    const healthy = runningApp({ "GET /admin/users": [200, { users: [], next: null }], "GET /config": [200, { accounts: true }], "GET /me": [200, { user: ADMIN }] });
    healthy.tracker.reopen(null);
    await healthy.settle();
    expect(healthy.views()).toEqual(["starting", "dashboard"]);
    expect(healthy.requests()).toEqual(["GET /config", "GET /me", "GET /admin/users"]);
  });

  it("calls it a contradiction only when the same account is still shown the dashboard", () => {
    const admin: Session = { kind: "signed_in", user: ADMIN };
    expect(sameDashboard(admin, admin)).toBe(true);
    expect(sameDashboard(admin, { kind: "signed_in", user: { ...ADMIN, name: "Ana L." } })).toBe(true);
    for (const after of [
      { kind: "signed_in", user: PLAYER },
      { kind: "signed_in", user: { ...ADMIN, blocked: BLOCK } },
      { kind: "signed_in", user: { ...ADMIN, id: "u2" } },
      { kind: "signed_out" },
      { kind: "accounts_off" },
      { kind: "unavailable", token: null },
    ] satisfies Session[])
      expect([after, sameDashboard(admin, after)]).toEqual([after, false]);
    expect(sameDashboard({ kind: "loading" }, admin)).toBe(false);
    expect(sameDashboard({ kind: "accounts_off" }, { kind: "accounts_off" })).toBe(false);
    expect(SESSION_CONTRADICTED).toContain("Tente de novo");
  });

  it("drops a session read that answers after a newer one began, and after a sign-out", async () => {
    const shown: Session[] = [];
    const tracker = trackSession(fake({ me: async () => ({ user: ADMIN }) }), (s) => shown.push(s));
    let late!: (s: Session) => void;
    tracker.follow(new Promise<Session>((resolve) => (late = resolve)));
    tracker.reopen(null);
    await vi.waitFor(() => expect(shown).toHaveLength(2));
    late({ kind: "signed_out" });
    await new Promise((done) => setTimeout(done, 0));
    expect(shown).toEqual([{ kind: "loading" }, { kind: "signed_in", user: ADMIN }]);
    tracker.reopen(null);
    tracker.signedOut();
    await new Promise((done) => setTimeout(done, 0));
    expect(shown.slice(2)).toEqual([{ kind: "loading" }, { kind: "signed_out" }]);
    // A refusal while a read is in flight starts no second one.
    const calls: string[] = [];
    const busy = trackSession(fake({}, calls), () => undefined);
    busy.reopen(null);
    busy.refused();
    busy.refused();
    await new Promise((done) => setTimeout(done, 0));
    expect(calls).toEqual(["config", "me"]);
  });

  it("says the role was taken only when the same account was an administrator a moment ago", () => {
    const admin: Session = { kind: "signed_in", user: ADMIN };
    expect(lostAdmin(admin, { kind: "signed_in", user: PLAYER })).toBe(true);
    expect(lostAdmin(admin, { kind: "signed_in", user: { ...PLAYER, id: "u2" } })).toBe(false);
    expect(lostAdmin(admin, { kind: "signed_in", user: { ...PLAYER, blocked: BLOCK } })).toBe(false);
    expect(lostAdmin(admin, admin)).toBe(false);
    expect(lostAdmin(admin, { kind: "signed_out" })).toBe(false);
    expect(lostAdmin({ kind: "loading" }, { kind: "signed_in", user: PLAYER })).toBe(false);
    expect(lostAdmin({ kind: "signed_in", user: PLAYER }, { kind: "signed_in", user: PLAYER })).toBe(false);
  });
});

describe("roles and account block (IMPL-0021)", () => {
  const row = (over: Partial<UserSummary>): UserSummary => ({ id: USER, nickname: "bia", role: "player", city: "Recife", createdAt: "2026-11-01T00:00:00.000Z", verified: true, blocked: false, ...over });
  const SELF = row({ id: "a0000000-0000-4000-8000-000000000001", nickname: "ana_lima", role: "admin" });
  const OTHER_ADMIN = row({ id: "c0000000-0000-4000-8000-000000000003", nickname: "caio", role: "admin" });
  const PLAYER = row({});
  const BLOCKED = row({ id: "d0000000-0000-4000-8000-000000000004", nickname: "dani", blocked: true });
  const MESSAGE = "Sua conta foi bloqueada por desrespeitar outras pessoas.";
  const path = (user: UserSummary, action: string) => `POST /admin/users/${user.id}/${action}`;

  it("offers no role change and no block on one's own row, and says why", () => {
    expect(offerFor(SELF, SELF.id, true)).toEqual({ actions: [], notes: [OWN_ROLE_NOTE, OWN_BLOCK_NOTE] });
    expect(offerFor(SELF, SELF.id, false)).toEqual({ actions: [], notes: [OWN_ROLE_NOTE] });
    expect(OWN_ROLE_NOTE).toBe("Você não pode mudar o próprio papel.");
  });

  it("offers no block on an administrator's row, and says to remove the role first", () => {
    expect(offerFor(OTHER_ADMIN, SELF.id, true)).toEqual({ actions: ["demote"], notes: [ADMIN_BLOCK_NOTE] });
    expect(ADMIN_BLOCK_NOTE).toContain("Remova o papel de administrador antes");
    // With the block off there is nothing to explain.
    expect(offerFor(OTHER_ADMIN, SELF.id, false)).toEqual({ actions: ["demote"], notes: [] });
  });

  it("offers the block only with the flag on, and the unblock whenever a row is blocked", () => {
    expect(offerFor(PLAYER, SELF.id, true)).toEqual({ actions: ["promote", "block"], notes: [] });
    expect(offerFor(PLAYER, SELF.id, false)).toEqual({ actions: ["promote"], notes: [] });
    for (const blockOn of [true, false]) expect([blockOn, offerFor(BLOCKED, SELF.id, blockOn)]).toEqual([blockOn, { actions: ["unblock"], notes: [BLOCKED_ROLE_NOTE] }]);
    // Nothing can be sent without knowing who is signed in.
    for (const user of [SELF, OTHER_ADMIN, PLAYER, BLOCKED]) expect(offerFor(user, undefined, true)).toEqual({ actions: [], notes: [] });
  });

  it("labels the buttons and the message field, and uses the shared role labels", () => {
    expect(USER_ACTION_LABEL).toEqual({ promote: "Tornar administrador", demote: "Tornar padrão", block: "Bloquear conta", unblock: "Desbloquear" });
    expect(BLOCK_MESSAGE_LABEL).toBe("Mensagem para a pessoa (ela vai ler)");
    expect([roleLabel("player"), roleLabel("admin"), roleLabel("later"), roleLabel("constructor")]).toEqual(["Padrão", "Administrador", "later", "constructor"]);
  });

  it("names the account and states the consequence in every confirmation", () => {
    const texts = Object.fromEntries((["promote", "demote", "block", "unblock"] as const).map((action) => [action, confirmationOf(action, "bia")]));
    expect(texts.promote.title).toBe("Tornar @bia administrador?");
    expect(texts.promote.effect).toContain("@bia terá acesso a este painel e poderes de moderação no jogo");
    expect(texts.demote.title).toBe("Tornar @bia padrão?");
    expect(texts.demote.effect).toContain("@bia perderá o acesso a este painel");
    expect(texts.block.title).toBe("Bloquear a conta de @bia?");
    for (const effect of ["Todas as sessões de @bia são encerradas", "só consegue ler a mensagem abaixo, sair e excluir a própria conta", "vale até um administrador desbloquear", "nunca o texto da mensagem"]) expect(texts.block.effect).toContain(effect);
    expect(texts.unblock.title).toBe("Desbloquear a conta de @bia?");
    for (const text of Object.values(texts)) expect([text.understood.includes("@bia"), text.understood.startsWith("Confirmo")]).toEqual([true, true]);
  });

  it("sends each action for the row on screen and says what was done", async () => {
    const { fetcher, sent } = fakeFetch({
      [path(PLAYER, "role")]: [200, { user: { ...PLAYER, role: "admin" } }],
      [path(OTHER_ADMIN, "role")]: [200, { user: { ...OTHER_ADMIN, role: "player" } }],
      [path(PLAYER, "block")]: [200, { user: { ...PLAYER, blocked: true } }],
      [path(BLOCKED, "unblock")]: [200, { user: { ...BLOCKED, blocked: false } }],
    });
    const api = createApi(BASE, fetcher);
    expect(await sendUserAction(api, "promote", PLAYER, SELF.id)).toEqual({ ok: true, user: { ...PLAYER, role: "admin" }, done: "Papel alterado: @bia agora é Administrador." });
    expect(await sendUserAction(api, "demote", OTHER_ADMIN, SELF.id)).toEqual({ ok: true, user: { ...OTHER_ADMIN, role: "player" }, done: "Papel alterado: @caio agora é Padrão." });
    // The message goes as the shared rule cleans it: trimmed, otherwise word for word.
    expect(await sendUserAction(api, "block", PLAYER, SELF.id, `  ${MESSAGE}\n`)).toEqual({ ok: true, user: { ...PLAYER, blocked: true }, done: "Conta de @bia bloqueada. As sessões dela foram encerradas." });
    expect(await sendUserAction(api, "unblock", BLOCKED, SELF.id)).toEqual({ ok: true, user: { ...BLOCKED, blocked: false }, done: "Conta de @dani desbloqueada." });
    expect(sent.map((s) => [`${s.init.method} ${s.url.slice(BASE.length)}`, JSON.parse(String(s.init.body))])).toEqual([
      [path(PLAYER, "role"), { accountId: SELF.id, role: "admin" }],
      [path(OTHER_ADMIN, "role"), { accountId: SELF.id, role: "player" }],
      [path(PLAYER, "block"), { accountId: SELF.id, message: MESSAGE }],
      [path(BLOCKED, "unblock"), { accountId: SELF.id }],
    ]);
  });

  it("refuses a block message outside the shared rule without a request, with the sentence for the field", async () => {
    const { fetcher, sent } = fakeFetch({ [path(PLAYER, "block")]: [200, { user: { ...PLAYER, blocked: true } }] });
    const api = createApi(BASE, fetcher);
    for (const message of ["", "   ", "curta", "  nove car ", "x".repeat(BLOCK_MESSAGE_MAX + 1)])
      expect([message.length, await sendUserAction(api, "block", PLAYER, SELF.id, message)]).toEqual([message.length, { ok: false, message: "", field: BLOCK_MESSAGE_ERROR, stale: false }]);
    expect(sent).toHaveLength(0);
    // The limits themselves fit (counted in characters, as the API counts them).
    expect((await sendUserAction(api, "block", PLAYER, SELF.id, "x".repeat(BLOCK_MESSAGE_MAX))).ok).toBe(true);
    expect((await sendUserAction(api, "block", PLAYER, SELF.id, "🎄".repeat(10))).ok).toBe(true);
    expect(sent).toHaveLength(2);
  });

  /** [action, row, status, code, the sentence on screen, whether the list is read again] */
  const REFUSALS: Array<[UserAction, UserSummary, number, string, string, boolean]> = [
    ["demote", OTHER_ADMIN, 409, "last_admin", "Esta pessoa é a única administradora. A Vila precisa de pelo menos um administrador.", true],
    ["promote", PLAYER, 409, "account_blocked", "Esta conta está bloqueada. Desbloqueie a conta antes de torná-la administradora.", true],
    ["promote", PLAYER, 403, "admin_only", "Esta ação é só para administradores. Seu papel pode ter mudado; atualize a página.", false],
    ["promote", SELF, 403, "self_role", "Você não pode mudar o seu próprio papel. Peça a outro administrador.", false],
    ["promote", PLAYER, 409, "bad_transition", "A situação mudou enquanto esta tela estava aberta. Atualize a página e confira antes de tentar de novo.", true],
    ["promote", PLAYER, 404, "not_found", "Esta conta não existe mais, ou esta ação foi desligada nesta API. A lista foi lida de novo.", true],
    ["promote", PLAYER, 409, "account_changed", "Você entrou ou saiu da conta em outra aba. Confira a conta e tente de novo.", false],
    ["promote", PLAYER, 503, "schema_outdated", "As contas estão temporariamente indisponíveis durante uma atualização. Tente de novo mais tarde.", false],
    ["promote", PLAYER, 401, "not_signed_in", "Algo deu errado. Tente de novo.", false],
    ["block", SELF, 403, "self_block", "Você não pode bloquear a sua própria conta.", false],
    ["block", OTHER_ADMIN, 409, "admin_account", "Esta conta é de um administrador. Mude o papel para Padrão antes de bloquear.", true],
    ["block", PLAYER, 409, "bad_transition", "A situação mudou enquanto esta tela estava aberta. Atualize a página e confira antes de tentar de novo.", true],
    ["block", PLAYER, 404, "not_found", "Esta conta não existe mais, ou esta ação foi desligada nesta API. A lista foi lida de novo.", true],
    ["block", PLAYER, 403, "session_blocked", "Esta conta está bloqueada pela administração. Você ainda pode ler o motivo, sair e excluir a conta.", false],
    ["unblock", BLOCKED, 409, "bad_transition", "A situação mudou enquanto esta tela estava aberta. Atualize a página e confira antes de tentar de novo.", true],
    ["unblock", BLOCKED, 404, "not_found", "Esta conta não existe mais, ou esta ação foi desligada nesta API. A lista foi lida de novo.", true],
    ["unblock", BLOCKED, 429, "too_many_requests", "Muitas tentativas seguidas. Espere um minuto e tente de novo.", false],
  ];

  it.each(REFUSALS)("shows the sentence of a refused %s (%s … %i %s)", async (action, user, status, code, sentence, stale) => {
    const route = path(user, action === "promote" || action === "demote" ? "role" : action);
    const { fetcher, sent } = fakeFetch({ [route]: [status, { error: code }] });
    expect(await sendUserAction(createApi(BASE, fetcher), action, user, SELF.id, MESSAGE)).toEqual({ ok: false, message: sentence, field: "", stale });
    expect(sent).toHaveLength(1);
  });

  it("shows the API's sentence for the message field, and a sentence when there was no answer", async () => {
    const fields = { message: BLOCK_MESSAGE_ERROR };
    const { fetcher } = fakeFetch({ [path(PLAYER, "block")]: [400, { error: "message_required", fields }] });
    expect(await sendUserAction(createApi(BASE, fetcher), "block", PLAYER, SELF.id, MESSAGE)).toEqual({ ok: false, message: "Confira os campos destacados.", field: BLOCK_MESSAGE_ERROR, stale: false });
    expect(await sendUserAction(createApi(BASE, fakeFetch({}).fetcher), "unblock", BLOCKED, SELF.id)).toEqual({ ok: false, message: "Sem conexão com a Vila. Tente de novo em instantes.", field: "", stale: false });
  });

  it("treats a 200 without the row of that account as a failure: nothing reaches the list, which is read again", async () => {
    expect(NO_ROW_TEXT).toBe("Algo deu errado. A lista foi lida de novo: confira como a conta ficou.");
    const failed = { ok: false, message: NO_ROW_TEXT, field: "", stale: true };
    const bodies: unknown[] = [{}, { user: null }, { ok: true }, { user: "bia" }, { user: {} }, { user: { ...OTHER_ADMIN } }, null, []];
    for (const body of bodies) {
      const { fetcher, sent } = fakeFetch({
        [path(PLAYER, "role")]: [200, body],
        [path(PLAYER, "block")]: [200, body],
        [path(BLOCKED, "unblock")]: [200, body],
      });
      const api = createApi(BASE, fetcher);
      const label = JSON.stringify(body);
      expect([label, await sendUserAction(api, "promote", PLAYER, SELF.id)]).toEqual([label, failed]);
      expect([label, await sendUserAction(api, "demote", PLAYER, SELF.id)]).toEqual([label, failed]);
      expect([label, await sendUserAction(api, "block", PLAYER, SELF.id, MESSAGE)]).toEqual([label, failed]);
      expect([label, await sendUserAction(api, "unblock", BLOCKED, SELF.id)]).toEqual([label, failed]);
      expect(sent).toHaveLength(4); // each one was sent once: nothing is resent
    }
    // A 204 (no body at all) is no row either.
    const { fetcher } = fakeFetch({ [path(PLAYER, "role")]: [204, null] });
    expect(await sendUserAction(createApi(BASE, fetcher), "promote", PLAYER, SELF.id)).toEqual(failed);
  });

  it("refreshes the list: the changed row at once, then every page on screen read again from the API", async () => {
    const list = [SELF, PLAYER, BLOCKED];
    const changed = { ...PLAYER, role: "admin" as const };
    expect(withUser(list, changed)).toEqual([SELF, changed, BLOCKED]);
    // The other rows are the same objects, and a row that is not on screen changes nothing.
    expect(withUser(list, changed)[0]).toBe(SELF);
    expect(withUser(list, row({ id: UNANSWERED }))).toEqual(list);

    const pages: Record<string, Page<UserSummary>> = { "": { items: [SELF], next: "p2" }, p2: { items: [changed], next: "p3" }, p3: { items: [BLOCKED], next: null } };
    const asked: string[] = [];
    const fetchPage = async (before?: string) => (asked.push(before ?? ""), pages[before ?? ""]);
    // Two pages were on screen: two are read, in order, and "more" still continues from where they end.
    expect(await readPages(fetchPage, 2)).toEqual({ items: [SELF, changed], next: "p3" });
    expect(asked).toEqual(["", "p2"]);
    // Never past the end of the list, and at least the first page.
    expect(await readPages(fetchPage, 9)).toEqual({ items: [SELF, changed, BLOCKED], next: null });
    expect(await readPages(fetchPage, 0)).toEqual({ items: [SELF], next: "p2" });
    await expect(readPages(async () => Promise.reject(new ApiError(403, "admin_only")), 2)).rejects.toMatchObject({ code: "admin_only" });
  });
});

describe("logo removal by the administration (IMPL-0021)", () => {
  const route = `POST /admin/ngos/${APP}/logo/remove`;
  const WITH_LOGO = { ...DETAIL, files: [LOGO, PDF] } as ApplicationDetail;

  it("sends the admin on screen and the revision on screen, then shows the application as it is now", async () => {
    const application = { ...WITH_LOGO.application, revision: 3 };
    const fresh = { ...WITH_LOGO, application, files: [PDF], history: [{ at: "2026-11-12T10:00:00.000Z", action: "ngo.logo_remove", detail: null, actor: "ana_lima" }] };
    const { fetcher, sent } = fakeFetch({ [route]: [200, { application }], [`GET /admin/applications/${APP}`]: [200, fresh] });
    const result = await sendLogoRemoval(createApi(BASE, fetcher), APP, WITH_LOGO, "u1");
    expect(result).toMatchObject({ ok: true, detail: { application: { revision: 3 }, files: [PDF], history: [{ action: "ngo.logo_remove" }] } });
    expect(sent.map((s) => `${s.init.method} ${s.url.slice(BASE.length)}`)).toEqual([route, `GET /admin/applications/${APP}`]);
    expect(JSON.parse(String(sent[0].init.body))).toEqual({ accountId: "u1", revision: 2 });
    // The logo is gone: the screen says so even when re-reading the application fails.
    const offline = await sendLogoRemoval(createApi(BASE, fakeFetch({ [route]: [200, { application }] }).fetcher), APP, WITH_LOGO, "u1");
    expect(offline).toMatchObject({ ok: true, detail: { application: { revision: 3 } } });
    expect(offline.detail.files).toEqual([PDF]);
  });

  /** [status, code, the sentence on screen, whether the application is read again] */
  const REFUSALS: Array<[number, string, string, boolean]> = [
    [409, "stale_revision", "A organização enviou uma nova versão enquanto esta tela estava aberta. Revise a versão atual.", true],
    [409, "account_deleting", "A exclusão desta conta está pendente. Confira o aviso de exclusão antes de continuar.", true],
    [404, "not_found", "Este logo não existe mais: pode ter sido removido ou trocado. Confira os arquivos atuais.", true],
    [503, "file_cleanup_pending", "O logo já saiu da candidatura e não é mais exibido. A limpeza do arquivo no armazenamento ainda não terminou.", true],
    [503, "files_unavailable", "O armazenamento dos arquivos está indisponível agora. O logo não foi removido; tente de novo mais tarde.", false],
    [403, "self_review", "Você é a pessoa responsável por esta organização. Outra pessoa da administração precisa remover o logo.", false],
    [403, "admin_only", "Esta ação é só para administradores. Seu papel pode ter mudado; atualize a página.", false],
    [409, "account_changed", "Você entrou ou saiu da conta em outra aba. Confira a conta e tente de novo.", false],
    [503, "schema_outdated", "As contas estão temporariamente indisponíveis durante uma atualização. Tente de novo mais tarde.", false],
    [400, "revision_required", "Algo deu errado. Tente de novo.", false],
  ];

  it.each(REFUSALS)("shows the sentence of a refusal and re-reads only when the screen is out of date (%i %s)", async (status, code, sentence, stale) => {
    const current = { ...WITH_LOGO, application: { ...WITH_LOGO.application, revision: 3 }, files: [PDF] };
    const { fetcher, sent } = fakeFetch({ [route]: [status, { error: code }], [`GET /admin/applications/${APP}`]: [200, current] });
    const result = await sendLogoRemoval(createApi(BASE, fetcher), APP, WITH_LOGO, "u1");
    expect(result).toMatchObject({ ok: false, stale, error: { code } });
    if (!result.ok) expect(logoRefusalText(result.error)).toBe(sentence);
    expect(sent.map((s) => `${s.init.method} ${s.url.slice(BASE.length)}`)).toEqual(stale ? [route, `GET /admin/applications/${APP}`] : [route]);
    // Out of date: the current version and its files; otherwise exactly what was on screen.
    if (stale) expect([result.detail.application.revision, result.detail.files]).toEqual([3, [PDF]]);
    else expect(result.detail).toBe(WITH_LOGO);
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
    for (const hash of ["", "#", "#/", "#/nope", "#login=abc", "#/audit/x", "#/users/../system", "#applications", "#/applications/"]) expect([hash, parseRoute(hash)]).toEqual([hash, { section: "applications" }]);
    expect(parseRoute("#/lots/")).toEqual({ section: "lots" });
  });

  it("opens one application from the link the game builds, with or without the slash after #", () => {
    expect(parseRoute(`#applications/${ID}`)).toEqual({ section: "applications", id: ID });
    expect(parseRoute(`#applications/${ID}/`)).toEqual({ section: "applications", id: ID });
    expect(parseRoute(`#applications/${ID}`)).toEqual(parseRoute(`#/applications/${ID}`));
    for (const { section } of SECTIONS) expect(parseRoute(`#${section}`)).toEqual({ section });
    expect([namesSection(`#applications/${ID}`), namesSection("#/users"), namesSection(""), namesSection("#"), namesSection("#login=abc"), namesSection("#nope")]).toEqual([true, true, false, false, false, false]);
  });

  it("marks a link to an application whose id is malformed as unknown, and never keeps what the address carried", () => {
    const malformed = ["abc", "<script>", "not-a-uuid/extra", ID.toUpperCase(), `${ID}/extra`, `${ID}/../users`, `${ID}%2F..`, `${ID}?x=1`, `${ID} `, ID.slice(0, -1), `${ID}0`, "../users", "javascript:alert(1)", "%3Cscript%3E", "undefined", "null"];
    for (const id of malformed)
      for (const prefix of ["#applications/", "#/applications/"]) expect([prefix + id, parseRoute(prefix + id)]).toEqual([prefix + id, { section: "applications", unknown: true }]);
  });

  it("keeps the application of a link that also carries a sign-in token, in either order", () => {
    for (const hash of [`#login=tok&applications/${ID}`, `#login=tok&/applications/${ID}`, `#applications/${ID}&login=tok`, `#/applications/${ID}&login=tok`])
      expect([hash, parseRoute(hash)]).toEqual([hash, { section: "applications", id: ID }]);
    expect(parseRoute("#login=tok&applications/zzz")).toEqual({ section: "applications", unknown: true });
    expect(parseRoute("#login=tok&/audit")).toEqual({ section: "audit" });
    // The token is never taken for an id or a section.
    expect(parseRoute(`#login=${ID}`)).toEqual({ section: "applications" });
    expect(namesSection(`#login=tok&applications/${ID}`)).toBe(true);
  });
});

describe("login fragment", () => {
  const ID = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";
  /** Fragments with a token: what is left in the address bar once the token is taken. */
  const CASES: Array<[hash: string, token: string, rest: string]> = [
    ["#login=abc123", "abc123", ""],
    ["#login=a%2Bb&x=1", "a+b", "#x=1"],
    [`#login=abc&applications/${ID}`, "abc", `#applications/${ID}`],
    [`#login=abc&/applications/${ID}`, "abc", `#/applications/${ID}`],
    [`#applications/${ID}&login=abc`, "abc", `#applications/${ID}`],
    [`#/applications/${ID}&login=abc`, "abc", `#/applications/${ID}`],
  ];

  it("takes the token out and keeps the rest of the fragment as it was written", () => {
    for (const [hash, token, rest] of CASES) expect([hash, splitLoginFragment(hash)]).toEqual([hash, { token, rest }]);
    expect(splitLoginFragment("#/audit")).toEqual({ token: null, rest: "#/audit" });
    expect(splitLoginFragment(`#applications/${ID}`)).toEqual({ token: null, rest: `#applications/${ID}` });
    expect(splitLoginFragment("#login=")).toEqual({ token: null, rest: "#login=" });
    expect(splitLoginFragment("")).toEqual({ token: null, rest: "" });
  });

  it("is stripped the same way by the script that runs before the bundle (public/login-fragment.js)", () => {
    const run = (hash: string) => {
      const window: { __vilaLoginToken?: string } = {};
      let address: string | null = null;
      const history = { replaceState: (_state: unknown, _title: string, url: string) => void (address = url) };
      new Function("window", "location", "history", loginFragmentScript)(window, { hash, pathname: "/", search: "" }, history);
      return { token: window.__vilaLoginToken ?? null, address };
    };
    for (const [hash, token, rest] of CASES) expect([hash, run(hash)]).toEqual([hash, { token, address: `/${rest}` }]);
    // Without a token nothing is touched: a link to an application stays in the address bar.
    for (const hash of ["", "#/audit", `#applications/${ID}`, "#login="]) expect([hash, run(hash)]).toEqual([hash, { token: null, address: null }]);
  });
});

describe("returning to an application after signing in (IMPL-0021)", () => {
  const ID = "3f2b8c1e-9a4d-4e6f-8b1a-0c2d3e4f5a6b";
  const NOW = Date.parse("2026-11-12T12:00:00.000Z");
  const memory = (initial: Record<string, string> = {}) => {
    const data = new Map(Object.entries(initial));
    const store: ReturnStore = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
    return { store, data };
  };

  it("remembers the application asked for while signed out and gives it back once", () => {
    const { store, data } = memory();
    rememberReturn(store, ID, NOW);
    expect(takeReturn(store, NOW + 60_000)).toBe(ID);
    expect([takeReturn(store, NOW + 60_000), data.size]).toEqual([null, 0]);
    // Only the id is kept: nothing about who asked.
    rememberReturn(store, ID, NOW);
    expect(JSON.parse(data.get(RETURN_KEY)!)).toEqual({ id: ID, at: NOW });
  });

  it("forgets it after the sign-in link would have expired, on sign-out, and when it is not an id", () => {
    const { store, data } = memory();
    rememberReturn(store, ID, NOW);
    expect([takeReturn(store, NOW + RETURN_TTL_MS + 1), data.size]).toEqual([null, 0]);
    rememberReturn(store, ID, NOW);
    forgetReturn(store);
    expect(takeReturn(store, NOW)).toBeNull();
    for (const bad of ["abc", "../users", `${ID}/x`, ID.toUpperCase()]) rememberReturn(store, bad, NOW);
    expect(data.size).toBe(0);
    // Whatever another script or an older build left under the key is never used as an address.
    for (const stored of ["not json", "null", "[]", JSON.stringify({ id: "../users", at: NOW }), JSON.stringify({ id: ID }), JSON.stringify({ id: ID, at: NOW + 60_000 }), JSON.stringify({ id: ID, at: "now" })]) {
      const left = memory({ [RETURN_KEY]: stored });
      expect([stored, takeReturn(left.store, NOW), left.data.size]).toEqual([stored, null, 0]);
    }
  });

  it("is skipped, without an error, where the browser gives no storage", () => {
    const broken: ReturnStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("denied");
      },
      removeItem: () => {
        throw new Error("denied");
      },
    };
    for (const store of [null, broken]) {
      expect(() => rememberReturn(store, ID, NOW)).not.toThrow();
      expect(() => forgetReturn(store)).not.toThrow();
      expect(takeReturn(store, NOW)).toBeNull();
    }
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

  it("labels the role and moderation events of the audit trail (IMPL-0021), and prints no id from their detail", () => {
    expect([ACTION_LABEL["user.role_change"], ACTION_LABEL["user.block"], ACTION_LABEL["user.unblock"], ACTION_LABEL["ngo.logo_remove"], ACTION_LABEL["presence.remove"]]).toEqual([
      "Papel alterado",
      "Conta bloqueada pela administração",
      "Bloqueio de conta desfeito",
      "Logo removido pela administração",
      "Remoção de visitante autorizada",
    ]);
    // A role change says which way it went, in the shared labels.
    expect(actionText("user.role_change", JSON.stringify({ from: "player", to: "admin" }))).toBe("Papel alterado (Padrão → Administrador)");
    expect(actionText("user.role_change", JSON.stringify({ from: "admin", to: "player" }))).toBe("Papel alterado (Administrador → Padrão)");
    for (const detail of [null, "", "not json", "null", '{"from":"player"}', '{"from":"constructor","to":"admin"}', '{"from":"player","to":"owner"}']) expect([detail, actionText("user.role_change", detail)]).toEqual([detail, "Papel alterado"]);
    // The other details are ids (a block, a file, a connection): none is printed in the label.
    expect(actionText("user.block", JSON.stringify({ block: USER }))).toBe("Conta bloqueada pela administração");
    expect(actionText("user.unblock", JSON.stringify({ block: USER }))).toBe("Bloqueio de conta desfeito");
    expect(actionText("ngo.logo_remove", JSON.stringify({ file: LOGO.id, revision: 3 }))).toBe("Logo removido pela administração");
    // What is recorded is that a removal was authorised, not that a connection was closed.
    expect(actionText("presence.remove", JSON.stringify({ target: 7 }))).toBe("Remoção de visitante autorizada");
    expect(ACTION_LABEL["presence.remove"]).not.toMatch(/removido|expuls|fechad|encerrad/i);
  });

  it("shows the moderation flags one per line, like the other flags (IMPL-0021)", () => {
    expect(flagRows({ accounts: true, quests: false, files: true, withdrawal: false, moderation: { presence: false, block: true }, later: "beta" })).toEqual([
      ["accounts", true],
      ["quests", false],
      ["files", true],
      ["withdrawal", false],
      ["moderation.presence", false],
      ["moderation.block", true],
      ["later", "beta"],
    ]);
    // An older API sends no group; a value that is not a group is kept as it came.
    expect(flagRows({ accounts: false })).toEqual([["accounts", false]]);
    expect(flagRows({ list: [1, 2], none: null })).toEqual([["list", [1, 2]], ["none", null]]);
    expect([FLAG_LABEL["moderation.presence"], FLAG_LABEL["moderation.block"]]).toEqual(["Remoção de visitante de uma sala do jogo (PROPOSTA)", "Bloqueio de conta (PROPOSTA)"]);
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
