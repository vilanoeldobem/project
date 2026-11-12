/**
 * End-to-end API tests for accounts, magic-link sign-in, server XP, NGO applications and admin review
 * (IMPL-0011), on real SQLite with the real migrations (test/d1.mjs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MISSIONS } from "@vila/shared/game/progress";
import { QUESTS } from "@vila/shared/game/quests";

import { devVar, productionVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { type Env, handleApi } from "./api";
import { loginEmail } from "./mail";
import { KNOWN_EVENTS } from "./progress";

const ORIGIN = "https://play.example";
let db: ReturnType<typeof createD1>;
let env: Env;

const call = async (method: string, path: string, body?: unknown, cookie?: string, origin: string | null = ORIGIN) => {
  const headers: Record<string, string> = {};
  if (origin) headers.Origin = origin;
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await handleApi(new Request(`https://api.example${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};

/** Links carry the token in the fragment (`/#login=…`), never in the query string. */
const tokenOf = (devLink: string) => decodeURIComponent(new URLSearchParams(new URL(devLink).hash.slice(1)).get("login")!);

async function signUp(nickname = "ana_lima", email = "ana@example.com") {
  const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname, city: "Recife", email });
  expect(r.status).toBe(202);
  const v = await call("POST", "/auth/verify", { token: tokenOf(r.body.devLink) });
  expect(v.status).toBe(200);
  const cookie = v.headers.get("Set-Cookie")!.split(";")[0];
  return { cookie, user: v.body.user };
}

type Signed = { cookie: string; user: { id: string } };
/** Writes name the account the page believes is signed in. */
const events = (s: Signed, list: Array<{ missionId: string; eventId: string }>) => call("POST", "/progress/events", { accountId: s.user.id, events: list }, s.cookie);
const apply = (s: Signed, body: object) => call("POST", "/ngo/application", { accountId: s.user.id, ...body }, s.cookie);
const ALL_CHECKS = { activeCnpj: true, oneYear: true, fundsConfirmable: true };
/** An admin decision on the version currently stored (what the admin is looking at); approve ticks the checks. */
const decide = (id: string, body: { action: unknown; note?: string; checks?: object }, cookie: string) => {
  const revision = db.sql("SELECT revision FROM ngos WHERE id = ?", id)[0]?.revision;
  return call("POST", `/admin/applications/${id}/decision`, { revision, ...(body.action === "approve" ? { checks: ALL_CHECKS } : {}), ...body }, cookie);
};

const APP = {
  name: "Associação Exemplo",
  cnpj: "11.222.333/0001-81",
  openedOn: "2020-03-10",
  city: "São Paulo",
  declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  fundsConfirmation: "Extratos mensais da conta da organização e relatório conciliável.",
  summary: "Apoio escolar para crianças do bairro.",
  description: "Atendemos crianças de 6 a 12 anos com reforço escolar, leitura e atividades culturais no contraturno.",
  tags: ["children", "education"],
  projects: [{ title: "Leitura em roda", description: "Encontros semanais." }],
  lotId: "plaza-03",
};

beforeEach(() => {
  db = createD1();
  env = { DB: db, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", QUESTS_V1_ENABLED: "true" };
});

afterEach(() => vi.unstubAllGlobals());

type ResendCall = { url: string; headers: Headers; body: { from: string; to: string[]; subject: string; text: string; html: string } };
/** Replaces the global `fetch` with a fake Resend API; returns the requests it received. */
function stubResend(respond: () => Response | Promise<Response> = () => Response.json({ id: "email_1" })) {
  const calls: ResendCall[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), headers: new Headers(init.headers), body: JSON.parse(String(init.body)) });
    return respond();
  });
  return calls;
}

describe("feature flag and origin", () => {
  it("hides every account route while accounts are disabled, and says so in /config", async () => {
    env.ACCOUNTS_ENABLED = "false";
    env.QUESTS_V1_ENABLED = "false";
    expect((await call("GET", "/config")).body).toEqual({ accounts: false, quests: false, files: false });
    env.QUESTS_V1_ENABLED = "true";
    expect((await call("GET", "/config")).body).toEqual({ accounts: false, quests: true, files: false });
    expect((await call("GET", "/me")).body.error).toBe("accounts_disabled");
    expect((await call("POST", "/auth/register", {})).status).toBe(404);
  });

  it("answers account routes only to allowed origins, with credentialed CORS", async () => {
    expect((await call("GET", "/me", undefined, undefined, "https://evil.example")).status).toBe(403);
    expect((await call("GET", "/me", undefined, undefined, null)).status).toBe(403);
    const r = await call("GET", "/me");
    expect([r.status, r.body.user]).toEqual([200, null]);
    expect(r.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("requires a JSON body on mutations", async () => {
    const res = await handleApi(new Request("https://api.example/auth/link", { method: "POST", headers: { Origin: ORIGIN }, body: "email=x" }), env);
    expect(res.status).toBe(415);
  });
});

describe("registration and magic link (P13, OQ-03)", () => {
  it("validates the four fields with pt-BR messages", async () => {
    const r = await call("POST", "/auth/register", { name: "A", nickname: "a b", city: "", email: "x" });
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.fields).sort()).toEqual(["city", "email", "name", "nickname"]);
  });

  it("signs up, verifies once, and keeps a hashed session", async () => {
    const { cookie, user } = await signUp();
    expect(user).toMatchObject({ nickname: "ana_lima", email: "ana@example.com", role: "player" });
    expect(cookie).toMatch(/^__Host-vila_session=/);
    expect((await call("GET", "/me", undefined, cookie)).body.user.nickname).toBe("ana_lima");
    const stored = db.sql("SELECT token_hash FROM sessions")[0].token_hash as string;
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(cookie).not.toContain(stored);
  });

  it("refuses a used, unknown or expired token", async () => {
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    const token = tokenOf(r.body.devLink);
    expect((await call("POST", "/auth/verify", { token })).status).toBe(200);
    expect((await call("POST", "/auth/verify", { token })).body.error).toBe("invalid_token");
    expect((await call("POST", "/auth/verify", { token: "x".repeat(43) })).body.error).toBe("invalid_token");
    const l = await call("POST", "/auth/link", { email: "ana@example.com" });
    db.sql("UPDATE login_tokens SET expires_at = '2000-01-01T00:00:00.000Z' WHERE used_at IS NULL");
    expect((await call("POST", "/auth/verify", { token: tokenOf(l.body.devLink) })).body.error).toBe("invalid_token");
  });

  it("gives the same answer for unknown e-mails and for existing ones (no enumeration)", async () => {
    await signUp();
    const unknown = await call("POST", "/auth/link", { email: "nobody@example.com" });
    const known = await call("POST", "/auth/link", { email: "ana@example.com" });
    expect([unknown.status, known.status]).toEqual([202, 202]);
    expect(unknown.body.ok).toBe(true);
    // Registering an existing e-mail also just sends a sign-in link.
    const again = await call("POST", "/auth/register", { name: "Outra", nickname: "outra", city: "Natal", email: "ana@example.com" });
    expect(again.status).toBe(202);
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(1);
  });

  it("keeps nicknames unique (case-insensitive)", async () => {
    await signUp("Noel");
    const r = await call("POST", "/auth/register", { name: "Outra", nickname: "noel", city: "Natal", email: "b@example.com" });
    expect(r.status).toBe(409);
    expect(r.body.fields.nickname).toMatch(/já está em uso/);
  });

  it("sends at most 3 links per account per 15 minutes", async () => {
    await signUp();
    const links = [];
    for (let i = 0; i < 4; i++) links.push((await call("POST", "/auth/link", { email: "ana@example.com" })).body.devLink);
    // The sign-up link counted too: 2 more fit in the window.
    expect(links.filter(Boolean).length).toBe(2);
  });

  it("e-mails the link through Resend in production, never returning it", async () => {
    const sent = stubResend();
    env.ENVIRONMENT = "production";
    env.RESEND_API_KEY = "re_test_key";
    env.MAIL_FROM = "acesso@vila.example";
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    expect(r.status).toBe(202);
    expect(r.body.devLink).toBeUndefined();
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toBe("https://api.resend.com/emails");
    expect(sent[0].headers.get("Authorization")).toBe("Bearer re_test_key");
    // Resend answers 403 to requests without a User-Agent, and Workers do not send one by default.
    expect(sent[0].headers.get("User-Agent")).toBeTruthy();
    expect(sent[0].body.from).toBe("Vila Noel do Bem <acesso@vila.example>");
    expect(sent[0].body.to).toEqual(["ana@example.com"]);
    expect(sent[0].body.text).toContain(`${ORIGIN}/#login=`);
    expect(sent[0].body.text).not.toContain("?login=");
    expect(sent[0].body.html).toContain("Entrar na Vila");
    expect(sent[0].body.subject).toBe(loginEmail("x", "y").subject);
  });

  it("does not call Resend without a key, and returns the link only in development/test", async () => {
    const sent = stubResend();
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    expect(r.body.devLink).toContain(`${ORIGIN}/#login=`);
    expect(sent).toHaveLength(0);
  });

  it("never returns the link outside development/test, whatever the environment name", async () => {
    for (const name of [undefined, "staging", "Production", ""]) {
      db = createD1();
      env = { DB: db, ENVIRONMENT: name, ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true" };
      const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
      expect([String(name), r.status, r.body.devLink]).toEqual([String(name), 503, undefined]);
      stubResend();
      env.RESEND_API_KEY = "re_test_key";
      const l = await call("POST", "/auth/link", { email: "ana@example.com" });
      expect(l.body.devLink).toBeUndefined();
    }
  });

  it("fails closed when production has no Resend key, Resend refuses the send or the network fails", async () => {
    const logged: unknown[][] = [];
    vi.spyOn(console, "error").mockImplementation((...args) => void logged.push(args));
    env.ENVIRONMENT = "production";
    expect((await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" })).status).toBe(503);
    env.RESEND_API_KEY = "re_test_key";
    stubResend(() => Response.json({ statusCode: 403, name: "validation_error", message: "The vila.example domain is not verified. bia@example.com" }, { status: 403 }));
    expect((await call("POST", "/auth/register", { name: "Bia", nickname: "bia_b", city: "Natal", email: "bia@example.com" })).body.error).toBe("mail_unavailable");
    stubResend(() => Promise.reject(new TypeError("fetch failed")));
    expect((await call("POST", "/auth/register", { name: "Caio", nickname: "caio_c", city: "Natal", email: "caio@example.com" })).body.error).toBe("mail_unavailable");
    // Logs carry the status and Resend's error name only: never the address, the link, the key or the message.
    expect(logged).toEqual([["mail_error", 403, "validation_error"], ["mail_error", "network", "TypeError"]]);
    vi.restoreAllMocks();
    stubResend(() => Response.json({ name: "rate_limit_exceeded" }, { status: 429 }));
    // /auth/link answers 202 even when the send fails: a 503 there would reveal that the account exists.
    expect((await call("POST", "/auth/link", { email: "bia@example.com" })).status).toBe(202);
  });

  it("logs out and deletes the account with its sessions and mission events", async () => {
    const a = await signUp();
    const { cookie, user } = a;
    await events(a, [{ missionId: "play-memory", eventId: "win" }]);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(1);
    expect((await call("POST", "/auth/logout", {}, cookie)).status).toBe(204);
    expect((await call("GET", "/me", undefined, cookie)).body.user).toBeNull();
    // Sign in again with a fresh link, then delete the account.
    const l = await call("POST", "/auth/link", { email: "ana@example.com" });
    const c2 = (await call("POST", "/auth/verify", { token: tokenOf(l.body.devLink) })).headers.get("Set-Cookie")!.split(";")[0];
    expect((await call("DELETE", "/me", undefined, c2)).status).toBe(204);
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(0);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions")[0].n).toBe(0);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(0);
    const audit = db.sql("SELECT actor, action, subject, detail FROM audit_events");
    expect(audit).toEqual([{ actor: user.id, action: "user.delete", subject: `user:${user.id}`, detail: null }]);
  });
});

describe("server XP (P14, DEC-042)", () => {
  it("is idempotent per event and grants a mission's XP once", async () => {
    const a = await signUp();
    const ev = (eventId: string) => ({ missionId: "explore-gifts", eventId });
    let r = await events(a, [ev("gift-bench"), ev("gift-bench")]);
    expect(r.body.progress.xp).toBe(0);
    r = await events(a, [ev("gift-palm"), ev("gift-street")]);
    expect(r.body.progress.xp).toBe(30);
    expect(r.body.progress.completed["explore-gifts"]).toBe(true);
    r = await events(a, [ev("gift-palm")]);
    expect(r.body.progress.xp).toBe(30);
    expect((await call("GET", "/progress", undefined, a.cookie)).body.progress.xp).toBe(30);
  });

  it("rejects unknown missions and event ids the game cannot produce", async () => {
    const a = await signUp();
    expect((await events(a, [{ missionId: "donate-1000", eventId: "x" }])).status).toBe(400);
    expect((await events(a, [{ missionId: "play-memory", eventId: "<script>" }])).status).toBe(400);
    // Made-up gift ids would complete the gift mission without finding anything.
    expect((await events(a, [{ missionId: "explore-gifts", eventId: "fake-1" }, { missionId: "explore-gifts", eventId: "fake-2" }])).status).toBe(400);
    expect((await events(a, [{ missionId: "causes-visit-lot", eventId: "plaza-99" }])).status).toBe(400);
    expect((await events(a, [{ missionId: "toString", eventId: "x" }])).status).toBe(400);
    expect((await events(a, [])).status).toBe(400);
    expect((await call("GET", "/progress")).status).toBe(401);
    for (const [missionId, eventId] of [["explore-gifts", "gift-bench"], ["play-memory", "win"], ["causes-visit-lot", "plaza-01"], ["causes-global-donation", "panel"]])
      expect((await events(a, [{ missionId, eventId }])).status).toBe(200);
  });

  it("knows the event ids of every mission and quest", () => {
    expect(Object.keys(KNOWN_EVENTS).sort()).toEqual([...MISSIONS, ...QUESTS].map((m) => m.id).sort());
  });

  it("accepts a full quest chain once and replays it without extra XP", async () => {
    const a = await signUp();
    const flightNight = [
      { missionId: "harness-bells", eventId: "accept" },
      { missionId: "harness-bells", eventId: "bell-pine-north" },
      { missionId: "harness-bells", eventId: "bell-pine-east" },
      { missionId: "harness-bells", eventId: "turn-in" },
      { missionId: "route-memory-game", eventId: "accept" },
      { missionId: "route-memory-game", eventId: "memory-win" },
      { missionId: "route-memory-game", eventId: "turn-in" },
      { missionId: "charm-for-the-flight", eventId: "accept" },
      { missionId: "charm-for-the-flight", eventId: "turn-in" },
    ];
    const first = await events(a, flightNight);
    expect(first.status).toBe(200);
    expect(first.body.progress.xp).toBe(100);
    expect(first.body.progress.completed["charm-for-the-flight"]).toBe(true);
    const replay = await events(a, flightNight);
    expect(replay.status).toBe(200);
    expect(replay.body.progress.xp).toBe(100);
    expect((await call("GET", "/progress", undefined, a.cookie)).body.progress.xp).toBe(100);
  });

  it("rejects an unknown quest event id", async () => {
    const a = await signUp();
    expect((await events(a, [{ missionId: "harness-bells", eventId: "bell-fake" }])).status).toBe(400);
    expect((await events(a, [{ missionId: "charm-for-the-flight", eventId: "memory-win" }])).status).toBe(400);
  });

  it("skips quest events while the flag is off and still stores the missions of the same batch", async () => {
    env.QUESTS_V1_ENABLED = "false";
    const a = await signUp();
    const alone = await events(a, [{ missionId: "harness-bells", eventId: "accept" }]);
    expect([alone.status, alone.body.progress.seen]).toEqual([200, {}]);
    const mixed = await events(a, [
      { missionId: "harness-bells", eventId: "accept" },
      { missionId: "causes-global-donation", eventId: "panel" },
      { missionId: "harness-bells", eventId: "bell-pine-north" },
    ]);
    expect(mixed.status).toBe(200);
    expect(mixed.body.progress.xp).toBe(20);
    expect(mixed.body.progress.seen).toEqual({ "causes-global-donation:panel": true });
    expect(db.sql("SELECT mission_id, event_id FROM progress_events")).toEqual([{ mission_id: "causes-global-donation", event_id: "panel" }]);
    // Ids the game cannot produce still fail the whole batch, quest or not.
    expect((await events(a, [{ missionId: "play-memory", eventId: "win" }, { missionId: "donate-1000", eventId: "x" }])).status).toBe(400);
    expect((await events(a, [{ missionId: "play-memory", eventId: "win" }, { missionId: "harness-bells", eventId: "bell-fake" }])).status).toBe(400);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(1);
    // Flag back on: the skipped quest event was never stored, so it can be sent again and applies.
    env.QUESTS_V1_ENABLED = "true";
    const again = await events(a, [{ missionId: "harness-bells", eventId: "accept" }]);
    expect(again.body.progress.seen["harness-bells:accept"]).toBe(true);
  });

  it("does not store an accept sent while another quest is active, so it applies later (stale tab)", async () => {
    const a = await signUp();
    const q = (missionId: string, eventId: string) => ({ missionId, eventId });
    await events(a, [q("harness-bells", "accept")]);
    // A stale tab still offers lake-lanterns: return the account state without starting another quest.
    const stale = await events(a, [q("lake-lanterns", "accept")]);
    expect(stale.status).toBe(200);
    expect(stale.body.progress.seen["harness-bells:accept"]).toBe(true);
    expect((await call("GET", "/progress", undefined, a.cookie)).body.progress.seen["lake-lanterns:accept"]).toBeUndefined();
    expect(db.sql("SELECT mission_id, event_id FROM progress_events")).toEqual([{ mission_id: "harness-bells", event_id: "accept" }]);
    await events(a, [q("harness-bells", "bell-pine-north"), q("harness-bells", "bell-pine-east"), q("harness-bells", "turn-in")]);
    // With harness-bells finished, the very same event id is now a valid transition.
    const later = await events(a, [q("lake-lanterns", "accept"), q("lake-lanterns", "lantern-lake-1"), q("lake-lanterns", "lantern-lake-2"), q("lake-lanterns", "turn-in")]);
    expect(later.body.progress.completed["lake-lanterns"]).toBe(true);
    expect(later.body.progress.xp).toBe(40);
    expect((await call("GET", "/progress", undefined, a.cookie)).body.progress.xp).toBe(40);
  });

  it("does not store an objective that arrives before its accept, so it can be sent again", async () => {
    const a = await signUp();
    const q = (eventId: string) => ({ missionId: "harness-bells", eventId });
    const early = await events(a, [q("bell-pine-north")]);
    expect(early.status).toBe(200);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(0);
    // Out of order inside one batch: the objective before the accept is skipped, the one after it counts.
    const mixed = await events(a, [q("bell-pine-east"), q("accept"), q("bell-pine-north")]);
    expect(mixed.status).toBe(200);
    expect((await call("GET", "/progress", undefined, a.cookie)).body.progress.counters["harness-bells"]).toBe(1);
    const done = await events(a, [q("bell-pine-east"), q("turn-in")]);
    expect(done.body.progress.completed["harness-bells"]).toBe(true);
    expect(done.body.progress.xp).toBe(20);
  });

  it("re-applies a quest event whose stored row was never a valid transition (older rows, concurrent tabs)", async () => {
    const a = await signUp();
    const q = (missionId: string, eventId: string) => ({ missionId, eventId });
    await events(a, [q("harness-bells", "accept")]);
    // What the previous rule (or two requests racing) leaves behind: a stored accept that replays as a no-op.
    db.sql("INSERT INTO progress_events (user_id, mission_id, event_id) VALUES (?, 'lake-lanterns', 'accept')", a.user.id);
    await events(a, [q("harness-bells", "bell-pine-north"), q("harness-bells", "bell-pine-east"), q("harness-bells", "turn-in")]);
    const later = await events(a, [q("lake-lanterns", "accept")]);
    expect(later.body.progress.seen["lake-lanterns:accept"]).toBe(true);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events WHERE mission_id = 'lake-lanterns'")[0].n).toBe(1);
  });

  it("keeps mission events idempotent next to quest events (same rows, same response shape)", async () => {
    const a = await signUp();
    const gift = (eventId: string) => ({ missionId: "explore-gifts", eventId });
    const r = await events(a, [gift("gift-bench"), gift("gift-palm"), gift("gift-street"), gift("gift-bench")]);
    expect(Object.keys(r.body)).toEqual(["progress"]);
    expect(Object.keys(r.body.progress).sort()).toEqual(["completed", "counters", "seen", "xp"]);
    expect(r.body.progress.xp).toBe(30);
    // Every whitelisted mission event is stored once, even past the mission's target.
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(3);
  });
});

describe("NGO application and admin review (P12, DEC-015, DEC-037)", () => {
  async function asAdmin() {
    const a = await signUp("admin_vila", "admin@example.com");
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    return a.cookie;
  }
  const lot = (id: string) => db.sql("SELECT state, ngo_id FROM lots WHERE id = ?", id)[0];

  it("validates, reserves the lot and refuses a second active application", async () => {
    const a = await signUp();
    const bad = await apply(a, { ...APP, cnpj: "11222333000180" });
    expect(bad.status).toBe(400);
    expect(bad.body.fields.cnpj).toBeDefined();
    const ok = await apply(a, APP);
    expect(ok.status).toBe(201);
    expect(ok.body.application).toMatchObject({ status: "submitted", revision: 1, lotId: "plaza-03" });
    expect(lot("plaza-03").state).toBe("application_sent");
    expect((await apply(a, APP)).body.error).toBe("application_active");
    // Nothing public before approval.
    const pub = (await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-03");
    expect(pub).toMatchObject({ state: "application_sent", ngo_name: null });
  });

  it("keeps lots and CNPJs exclusive between applicants", async () => {
    const a = await signUp();
    await apply(a, APP);
    const b = await signUp("bia", "bia@example.com");
    expect((await apply(b, { ...APP, cnpj: "11444777000161" })).body.error).toBe("lot_unavailable");
    expect((await apply(b, { ...APP, lotId: "plaza-04" })).body.error).toBe("cnpj_in_use");
  });

  it("runs the review: start → changes requested → resubmit → approve, all audited", async () => {
    const applicant = await signUp();
    const admin = await asAdmin();
    const id = (await apply(applicant, APP)).body.application.id;
    expect((await call("GET", "/admin/applications", undefined, applicant.cookie)).status).toBe(403);

    expect((await call("GET", "/admin/applications", undefined, admin)).body.applications.map((a: { id: string }) => a.id)).toEqual([id]);
    expect((await decide(id, { action: "start_review" }, admin)).body.application.status).toBe("under_review");
    expect(lot("plaza-03").state).toBe("under_review");
    expect((await decide(id, { action: "request_changes", note: "curto" }, admin)).body.error).toBe("note_required");
    const changes = await decide(id, { action: "request_changes", note: "Envie o relatório de recursos de 2025." }, admin);
    expect(changes.body.application).toMatchObject({ status: "changes_requested", reviewNote: "Envie o relatório de recursos de 2025." });
    expect((await call("GET", "/ngo/application", undefined, applicant.cookie)).body.application.reviewNote).toMatch(/relatório/);

    const re = await apply(applicant, { ...APP, lotId: "plaza-05" });
    expect(re.body.application).toMatchObject({ status: "submitted", revision: 2, lotId: "plaza-05", reviewNote: null });
    expect(lot("plaza-03").state).toBe("available");
    expect(lot("plaza-05").state).toBe("application_sent");

    expect((await decide(id, { action: "approve" }, admin)).body.application.status).toBe("published");
    expect(lot("plaza-05")).toEqual({ state: "published", ngo_id: id });
    const pub = (await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-05");
    expect(pub).toMatchObject({ state: "published", ngo_name: "Associação Exemplo" });
    expect((await decide(id, { action: "reject", note: "Motivo qualquer aqui." }, admin)).body.error).toBe("bad_transition");

    const history = (await call("GET", `/admin/applications/${id}`, undefined, admin)).body.history.map((h: { action: string }) => h.action);
    expect(history).toEqual(["ngo.submit", "ngo.start_review", "ngo.request_changes", "ngo.resubmit", "ngo.approve"]);
    // Audit rows never carry e-mails or the free-text note.
    for (const row of db.sql("SELECT actor, detail FROM audit_events")) {
      expect(String(row.detail ?? "")).not.toMatch(/@|relatório/);
      expect(String(row.actor)).toMatch(/^[0-9a-f-]{36}$/);
    }
  });

  it("releases the lot on rejection and lets the applicant try again", async () => {
    const applicant = await signUp();
    const admin = await asAdmin();
    const id = (await apply(applicant, APP)).body.application.id;
    await decide(id, { action: "reject", note: "CNPJ inativo na Receita Federal." }, admin);
    expect(lot("plaza-03")).toEqual({ state: "available", ngo_id: null });
    expect((await apply(applicant, APP)).body.application).toMatchObject({ status: "submitted", revision: 2 });
  });

  it("keeps the application (without the applicant link) when the account is deleted", async () => {
    const applicant = await signUp();
    await apply(applicant, APP);
    await call("DELETE", "/me", undefined, applicant.cookie);
    expect(db.sql("SELECT applicant_id, status FROM ngos")).toEqual([{ applicant_id: null, status: "submitted" }]);
  });
});

describe("security review fixes (2026-11-11)", () => {
  const reg = (email: string, nickname: string) => call("POST", "/auth/register", { name: "Pessoa", nickname, city: "Recife", email });

  it("answers register the same with or without an existing e-mail", async () => {
    await signUp("ana_lima", "ana@example.com");
    await signUp("taken", "taken@example.com");
    // Taken nickname: 409 whether the e-mail exists or not.
    expect([(await reg("ana@example.com", "taken")).status, (await reg("new@example.com", "taken")).status]).toEqual([409, 409]);
    // Free nickname: 202 whether the e-mail exists or not.
    expect([(await reg("ana@example.com", "free_one")).status, (await reg("other@example.com", "free_two")).status]).toEqual([202, 202]);
  });

  it("caps links per day atomically and always points them at the game", async () => {
    env.GAME_ORIGIN = "https://play.example";
    env.ALLOWED_ORIGINS = "https://play.example,https://www.example";
    env.ACCOUNT_ORIGINS = "https://play.example";
    const { user } = await signUp();
    const link = await call("POST", "/auth/link", { email: "ana@example.com" });
    expect(new URL(link.body.devLink).origin).toBe("https://play.example");
    // 10 links already today (older than 15 minutes): no more.
    db.sql("DELETE FROM login_tokens");
    for (let i = 0; i < 10; i++)
      db.sql("INSERT INTO login_tokens (token_hash, user_id, expires_at, created_at) VALUES (?, ?, '2000-01-01T00:00:00.000Z', ?)", `h${i}`, user.id, new Date(Date.now() - 3600 * 1000).toISOString());
    const capped = await call("POST", "/auth/link", { email: "ana@example.com" });
    expect([capped.status, capped.body.devLink]).toEqual([202, undefined]);
  });

  it("gives the website public CORS only: no credentials, no account routes", async () => {
    env.ALLOWED_ORIGINS = `${ORIGIN},https://www.example`;
    env.ACCOUNT_ORIGINS = ORIGIN;
    const pub = await call("GET", "/lots", undefined, undefined, "https://www.example");
    expect(pub.headers.get("Access-Control-Allow-Origin")).toBe("https://www.example");
    expect(pub.headers.get("Access-Control-Allow-Credentials")).toBeNull();
    expect((await call("GET", "/me", undefined, undefined, "https://www.example")).status).toBe(403);
  });

  it("lets people correct their data (not the e-mail) and keeps nicknames unique", async () => {
    await signUp("bia", "bia@example.com");
    const { cookie } = await signUp();
    const r = await call("POST", "/me", { name: "Ana Souza", nickname: "ana_souza", city: "Olinda", email: "x@evil.example" }, cookie);
    expect(r.body.user).toMatchObject({ name: "Ana Souza", nickname: "ana_souza", city: "Olinda", email: "ana@example.com" });
    expect((await call("POST", "/me", { name: "Ana", nickname: "BIA", city: "Olinda" }, cookie)).status).toBe(409);
  });

  it("refuses self-review and unknown actions (no prototype keys)", async () => {
    const admin = await signUp("admin_vila", "admin@example.com");
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    const id = (await apply(admin, APP)).body.application.id;
    expect((await decide(id, { action: "approve" }, admin.cookie)).body.error).toBe("self_review");
    for (const action of ["toString", "constructor", "__proto__", 1])
      expect((await decide(id, { action }, admin.cookie)).status).toBe(400);
  });

  it("enforces one active application per person in the database", async () => {
    const a = await signUp();
    const { user } = a;
    await apply(a, APP);
    expect(() =>
      db.sql("INSERT INTO ngos (id, name, cnpj, status, applicant_id) VALUES ('x', 'Outra', '11444777000161', 'submitted', ?)", user.id)
    ).toThrow(/UNIQUE/);
  });

  it("writes nothing when a resubmission loses its lot", async () => {
    const applicant = await signUp();
    const admin = await signUp("admin_vila", "admin@example.com");
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    const id = (await apply(applicant, APP)).body.application.id;
    await decide(id, { action: "request_changes", note: "Envie o relatório anual." }, admin.cookie);
    const other = await signUp("bia", "bia@example.com");
    await apply(other, { ...APP, cnpj: "11444777000161", lotId: "plaza-06" });
    const r = await apply(applicant, { ...APP, name: "Nome Novo", lotId: "plaza-06" });
    expect(r.body.error).toBe("lot_unavailable");
    expect(db.sql("SELECT name, status, revision, requested_lot_id FROM ngos WHERE id = ?", id)).toEqual([
      { name: APP.name, status: "changes_requested", revision: 1, requested_lot_id: "plaza-03" },
    ]);
    expect(db.sql("SELECT state, ngo_id FROM lots WHERE id = 'plaza-03'")).toEqual([{ state: "application_sent", ngo_id: id }]);
  });

  it("caps stored mission events per account", async () => {
    const { cookie, user } = await signUp();
    for (let i = 0; i < 500; i++) db.sql("INSERT INTO progress_events (user_id, mission_id, event_id) VALUES (?, 'play-memory', ?)", user.id, `e${i}`);
    expect((await events({ cookie, user }, [{ missionId: "play-memory", eventId: "win" }])).status).toBe(429);
  });

  it("refuses an oversized body before reading it", async () => {
    const res = await handleApi(
      new Request("https://api.example/auth/link", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": "999999" }, body: "{}" }),
      env
    );
    expect(res.status).toBe(413);
  });
});

describe("hardening ported from the parallel accounts work (#9–#12)", () => {
  it("puts the sign-in token in the URL fragment, which never reaches a server log", async () => {
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    const link = new URL(r.body.devLink);
    expect(link.search).toBe("");
    expect(link.hash).toMatch(/^#login=[A-Za-z0-9_-]{40,}$/);
  });

  it("consumes a link once even when two verifications race", async () => {
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    const token = tokenOf(r.body.devLink);
    const both = await Promise.all([call("POST", "/auth/verify", { token }), call("POST", "/auth/verify", { token })]);
    expect(both.map((x) => x.status).sort()).toEqual([200, 400]);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions")[0].n).toBe(1);
  });

  it("sets the session cookie with every attribute and clears it on logout", async () => {
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    const v = await call("POST", "/auth/verify", { token: tokenOf(r.body.devLink) });
    const set = v.headers.get("Set-Cookie")!;
    for (const attr of ["HttpOnly", "Secure", "SameSite=Lax", "Path=/", "Max-Age=2592000"]) expect(set).toContain(attr);
    expect(set).not.toMatch(/Domain=/i);
    const out = await call("POST", "/auth/logout", {}, set.split(";")[0]);
    expect(out.headers.get("Set-Cookie")).toContain("Max-Age=0");
  });

  it("ends the session the browser already had when it signs in again (one browser, one account)", async () => {
    const a = await signUp();
    await signUp("bia", "bia@example.com");
    const l = await call("POST", "/auth/link", { email: "bia@example.com" });
    const v = await call("POST", "/auth/verify", { token: tokenOf(l.body.devLink) }, a.cookie);
    expect(v.status).toBe(200);
    expect((await call("GET", "/me", undefined, a.cookie)).body.user).toBeNull();
  });

  it("treats an expired session as signed out", async () => {
    const a = await signUp();
    db.sql("UPDATE sessions SET expires_at = '2000-01-01T00:00:00.000Z'");
    expect((await call("GET", "/me", undefined, a.cookie)).body.user).toBeNull();
    expect((await call("GET", "/progress", undefined, a.cookie)).status).toBe(401);
  });

  it("never lets account responses be cached, errors included", async () => {
    const a = await signUp();
    for (const path of ["/me", "/progress", "/ngo/application", "/admin/applications"]) {
      const r = await call("GET", path, undefined, a.cookie);
      expect([path, r.headers.get("Cache-Control")]).toEqual([path, "no-store"]);
    }
    expect((await call("GET", "/progress")).headers.get("Cache-Control")).toBe("no-store");
  });

  it("keeps progress apart between accounts", async () => {
    const a = await signUp();
    const b = await signUp("bia", "bia@example.com");
    await events(a, [{ missionId: "play-memory", eventId: "win" }]);
    expect((await call("GET", "/progress", undefined, b.cookie)).body.progress.xp).toBe(0);
  });

  it("refuses writes meant for another account (a tab that switched accounts)", async () => {
    const a = await signUp();
    const b = await signUp("bia", "bia@example.com");
    // A page still showing Ana sends with Bia's cookie: refused, nothing written.
    const r = await call("POST", "/progress/events", { accountId: a.user.id, events: [{ missionId: "play-memory", eventId: "win" }] }, b.cookie);
    expect([r.status, r.body.error]).toEqual([409, "account_changed"]);
    expect((await call("POST", "/progress/events", { events: [{ missionId: "play-memory", eventId: "win" }] }, b.cookie)).status).toBe(409);
    expect((await call("POST", "/ngo/application", { ...APP, accountId: a.user.id }, b.cookie)).body.error).toBe("account_changed");
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(0);
    expect(db.sql("SELECT COUNT(*) AS n FROM ngos WHERE applicant_id IS NOT NULL")[0].n).toBe(0);
  });

  it("refuses a decision on a version the admin did not review", async () => {
    const applicant = await signUp();
    const admin = (await signUp("admin_vila", "admin@example.com")).cookie;
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    const id = (await apply(applicant, APP)).body.application.id;
    // Admin A opens revision 1; admin B asks for changes; the applicant resubmits revision 2 with another lot.
    await decide(id, { action: "request_changes", note: "Envie o relatório anual." }, admin);
    await apply(applicant, { ...APP, lotId: "plaza-07", summary: "Texto novo que ninguém revisou ainda." });
    const audits = db.sql("SELECT COUNT(*) AS n FROM audit_events")[0].n;
    const stale = await call("POST", `/admin/applications/${id}/decision`, { action: "approve", revision: 1, checks: ALL_CHECKS }, admin);
    expect([stale.status, stale.body.error]).toEqual([409, "stale_revision"]);
    expect(db.sql("SELECT status FROM ngos WHERE id = ?", id)[0].status).toBe("submitted");
    expect(db.sql("SELECT state FROM lots WHERE id = 'plaza-07'")[0].state).toBe("application_sent");
    expect(db.sql("SELECT COUNT(*) AS n FROM audit_events")[0].n).toBe(audits);
    expect((await call("POST", `/admin/applications/${id}/decision`, { action: "start_review" }, admin)).body.error).toBe("revision_required");
  });

  it("approves only with the three DEC-015 checks, and records them", async () => {
    const applicant = await signUp();
    const admin = (await signUp("admin_vila", "admin@example.com")).cookie;
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    const id = (await apply(applicant, APP)).body.application.id;
    for (const checks of [undefined, {}, { ...ALL_CHECKS, oneYear: false }, { ...ALL_CHECKS, fundsConfirmable: "true" }])
      expect((await call("POST", `/admin/applications/${id}/decision`, { action: "approve", revision: 1, checks }, admin)).body.error).toBe("checks_required");
    expect((await decide(id, { action: "approve" }, admin)).body.application.status).toBe("published");
    const detail = JSON.parse(db.sql("SELECT detail FROM audit_events WHERE action = 'ngo.approve'")[0].detail as string);
    expect(detail.checks).toEqual(ALL_CHECKS);
  });

  it("lets exactly one of two racing decisions win, with one audit row", async () => {
    const applicant = await signUp();
    const admin = (await signUp("admin_vila", "admin@example.com")).cookie;
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    const id = (await apply(applicant, APP)).body.application.id;
    const [ok, lost] = await Promise.all([decide(id, { action: "approve" }, admin), decide(id, { action: "reject", note: "Documentação incompleta." }, admin)]);
    expect([ok.status, lost.status].sort()).toEqual([200, 409]);
    const status = db.sql("SELECT status FROM ngos WHERE id = ?", id)[0].status;
    const decisions = db.sql("SELECT action FROM audit_events WHERE action IN ('ngo.approve', 'ngo.reject')");
    expect(decisions.length).toBe(1);
    expect(db.sql("SELECT state FROM lots WHERE id = 'plaza-03'")[0].state).toBe(status === "published" ? "published" : "available");
    // Replaying the winning decision changes nothing.
    expect((await decide(id, { action: "approve" }, admin)).status).toBe(409);
    expect(db.sql("SELECT COUNT(*) AS n FROM audit_events WHERE action IN ('ngo.approve', 'ngo.reject')")[0].n).toBe(1);
  });

  it("reads bodies without a length only up to the limit", async () => {
    let pulled = 0;
    const chunk = new TextEncoder().encode(" ".repeat(8_000));
    const body = new ReadableStream<Uint8Array>({
      pull(c) {
        pulled++;
        if (pulled > 100) c.close();
        else c.enqueue(chunk);
      },
    });
    const res = await handleApi(
      new Request("https://api.example/auth/link", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit),
      env
    );
    expect(res.status).toBe(413);
    expect(pulled).toBeLessThan(10);
  });

  it("rejects impossible opening dates instead of rolling them over", async () => {
    const a = await signUp();
    const r = await apply(a, { ...APP, openedOn: "2021-02-29" });
    expect(r.body.fields.openedOn).toBeDefined();
  });
});

describe("backoffice dashboard (IMPL-0015)", () => {
  const DASH = "https://dash.example";
  async function asAdmin() {
    const a = await signUp("admin_vila", "admin@example.com");
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    return a;
  }
  /** Audit rows at known instants (the default `at` is "now", too close together to page through). */
  const audit = (id: string, at: string, actor = "nobody") =>
    db.sql("INSERT INTO audit_events (id, at, actor, action, subject, detail) VALUES (?, ?, ?, 'test.event', ?, NULL)", id, at, actor, `test:${id}`);

  describe("sign-in link target", () => {
    beforeEach(() => {
      env.GAME_ORIGIN = ORIGIN;
      env.DASH_ORIGIN = DASH;
      env.ALLOWED_ORIGINS = `${ORIGIN},${DASH},https://www.example,https://dash.example.evil.example`;
      env.ACCOUNT_ORIGINS = `${ORIGIN},${DASH},https://dash.example.evil.example`;
    });
    const linkFrom = async (origin: string | null, body: object = { email: "ana@example.com" }) => {
      const r = await call("POST", "/auth/link", body, undefined, origin);
      return { status: r.status, origin: r.body?.devLink ? new URL(r.body.devLink).origin : null, link: r.body?.devLink as string | undefined };
    };

    it("opens the dashboard only for a link asked from exactly DASH_ORIGIN", async () => {
      await signUp();
      const dash = await linkFrom(DASH);
      expect([dash.status, dash.origin]).toEqual([202, DASH]);
      // Same token format as the game's link: fragment only.
      expect(new URL(dash.link!).search).toBe("");
      expect(new URL(dash.link!).hash).toMatch(/^#login=[A-Za-z0-9_-]{40,}$/);
      expect((await linkFrom(ORIGIN)).origin).toBe(ORIGIN);
      // A dashboard link signs in with the same session cookie as any other.
      const v = await call("POST", "/auth/verify", { token: tokenOf(dash.link!) }, undefined, DASH);
      expect(v.status).toBe(200);
      expect(v.headers.get("Access-Control-Allow-Origin")).toBe(DASH);
      expect(v.headers.get("Access-Control-Allow-Credentials")).toBe("true");
      expect((await call("GET", "/me", undefined, v.headers.get("Set-Cookie")!.split(";")[0], DASH)).body.user.nickname).toBe("ana_lima");
    });

    it("never lets a foreign Origin or request data redirect the link", async () => {
      await signUp();
      // Not an account origin at all: refused before any link exists.
      for (const origin of ["https://evil.example", "https://www.example", null]) {
        const r = await linkFrom(origin);
        expect([origin, r.status, r.link]).toEqual([origin, 403, undefined]);
      }
      expect(db.sql("SELECT COUNT(*) AS n FROM login_tokens WHERE used_at IS NULL")[0].n).toBe(0);
      // An allowed origin that merely looks like the dashboard still gets a link to the game.
      expect((await linkFrom("https://dash.example.evil.example")).origin).toBe(ORIGIN);
      // Nothing in the body, the query string or other headers chooses the target.
      db.sql("DELETE FROM login_tokens"); // stay under the 3 links per 15 minutes of the account
      const body ={ email: "ana@example.com", origin: "https://evil.example", base: "https://evil.example", redirect: "https://evil.example", dash: true };
      expect((await linkFrom(ORIGIN, body)).origin).toBe(ORIGIN);
      const res = await handleApi(
        new Request(`https://api.example/auth/link?origin=${encodeURIComponent(DASH)}&redirect=https://evil.example`, {
          method: "POST",
          headers: { Origin: ORIGIN, Referer: `${DASH}/`, "X-Forwarded-Host": "evil.example", "Content-Type": "application/json" },
          body: JSON.stringify({ email: "ana@example.com" }),
        }),
        env
      );
      expect(new URL(((await res.json()) as { devLink: string }).devLink).origin).toBe(ORIGIN);
    });

    it("keeps today's behaviour without DASH_ORIGIN, and never matches a near miss", async () => {
      await signUp();
      for (const configured of [undefined, "", `${DASH}/`, "https://DASH.example"]) {
        env.DASH_ORIGIN = configured;
        expect([configured, (await linkFrom(DASH)).origin]).toEqual([configured, ORIGIN]);
        db.sql("DELETE FROM login_tokens");
      }
    });

    it("keeps registration game-only: the dashboard creates no accounts", async () => {
      const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" }, undefined, DASH);
      expect([r.status, r.body.error]).toEqual([403, "forbidden_origin"]);
      expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(0);
      // From the game, a registration link always opens the game.
      const ok = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
      expect(new URL(ok.body.devLink).origin).toBe(ORIGIN);
    });

    it("is configured as an exact origin that is also an account origin (production vars and the dev script)", () => {
      // `fromDash` compares text: a DASH_ORIGIN that differs from the ACCOUNT_ORIGINS entry by a slash or a letter
      // would silently send dashboard links to the game.
      for (const [where, read] of [["wrangler.jsonc", productionVar], ["dev script", devVar]] as const) {
        const list = (name: string) => (read(name) ?? "").split(",");
        const dash = read("DASH_ORIGIN");
        expect([where, dash]).toEqual([where, expect.stringMatching(/^https?:\/\/[a-z0-9.-]+(:\d+)?$/)]);
        expect([where, list("ALLOWED_ORIGINS")]).toEqual([where, expect.arrayContaining([dash])]);
        expect([where, list("ACCOUNT_ORIGINS")]).toEqual([where, expect.arrayContaining([dash, read("GAME_ORIGIN")])]);
        expect([where, read("GAME_ORIGIN")]).not.toEqual([where, dash]);
      }
    });

    it("says in the e-mail that the link opens the dashboard", async () => {
      await signUp();
      const sent = stubResend();
      env.ENVIRONMENT = "production";
      env.RESEND_API_KEY = "re_test_key";
      expect((await call("POST", "/auth/link", { email: "ana@example.com" }, undefined, DASH)).status).toBe(202);
      expect(sent[0].body.text).toContain(`${DASH}/#login=`);
      expect(sent[0].body.text).toContain("painel administrativo");
      expect(sent[0].body.html).toContain("Entrar no painel");
      await call("POST", "/auth/link", { email: "ana@example.com" });
      expect(sent[1].body.text).toContain(`${ORIGIN}/#login=`);
      expect(sent[1].body.html).toContain("Entrar na Vila");
    });
  });

  describe("read-only lists", () => {
    it("answers admins only, never cached, and not at all while accounts are off", async () => {
      const player = await signUp();
      const admin = await asAdmin();
      for (const path of ["/admin/audit", "/admin/users"]) {
        const out = await call("GET", path);
        expect([path, out.status, out.body.error]).toEqual([path, 401, "not_signed_in"]);
        const no = await call("GET", path, undefined, player.cookie);
        expect([path, no.status, no.body.error]).toEqual([path, 403, "admin_only"]);
        const ok = await call("GET", path, undefined, admin.cookie);
        expect([path, ok.status, ok.headers.get("Cache-Control")]).toEqual([path, 200, "no-store"]);
        expect([path, no.headers.get("Cache-Control")]).toEqual([path, "no-store"]);
        // Read-only: no other method reaches a handler.
        expect([path, (await call("POST", path, {}, admin.cookie)).status]).toEqual([path, 404]);
        expect([path, (await call("DELETE", path, undefined, admin.cookie)).status]).toEqual([path, 404]);
      }
      env.ACCOUNTS_ENABLED = "false";
      for (const path of ["/admin/audit", "/admin/users"]) {
        const off = await call("GET", path, undefined, admin.cookie);
        expect([path, off.status, off.body.error]).toEqual([path, 404, "accounts_disabled"]);
      }
    });

    it("lists audit events newest first with the actor's nickname and no personal data", async () => {
      const applicant = await signUp();
      const admin = await asAdmin();
      const id = (await apply(applicant, APP)).body.application.id;
      await decide(id, { action: "request_changes", note: "Envie o relatório de recursos de 2025." }, admin.cookie);
      // Two events in the same millisecond would have no defined order: pin the instants.
      db.sql("UPDATE audit_events SET at = '2026-01-01T00:00:00.000Z' WHERE action = 'ngo.submit'");
      db.sql("UPDATE audit_events SET at = '2026-01-02T00:00:00.000Z' WHERE action = 'ngo.request_changes'");
      const before = db.sql("SELECT COUNT(*) AS n FROM audit_events")[0].n;
      const r = await call("GET", "/admin/audit", undefined, admin.cookie);
      expect(r.body.next).toBeNull();
      expect(r.body.events).toEqual([
        { at: "2026-01-02T00:00:00.000Z", action: "ngo.request_changes", subject: `ngo:${id}`, detail: expect.stringContaining('"to":"changes_requested"'), actor: "admin_vila" },
        { at: "2026-01-01T00:00:00.000Z", action: "ngo.submit", subject: `ngo:${id}`, detail: expect.any(String), actor: "ana_lima" },
      ]);
      // Never ids of people, e-mails, names or the free-text note.
      expect(JSON.stringify(r.body)).not.toMatch(/@example\.com|Ana Lima|relatório/);
      expect(JSON.stringify(r.body)).not.toContain(applicant.user.id);
      // Reading is not a mutation: nothing new in the audit trail.
      expect(db.sql("SELECT COUNT(*) AS n FROM audit_events")[0].n).toBe(before);
      // An actor whose account is gone shows as null.
      await call("DELETE", "/me", undefined, applicant.cookie);
      const after = (await call("GET", "/admin/audit", undefined, admin.cookie)).body.events;
      expect(after.map((e: { action: string; actor: string | null }) => [e.action, e.actor])).toEqual([["user.delete", null], ["ngo.request_changes", "admin_vila"], ["ngo.submit", null]]);
    });

    it("pages through the audit trail without skipping events that share an instant", async () => {
      const admin = await asAdmin();
      audit("e1", "2026-01-01T00:00:00.000Z");
      audit("e2", "2026-01-02T00:00:00.000Z");
      audit("e3", "2026-01-02T00:00:00.000Z");
      audit("e4", "2026-01-02T00:00:00.000Z");
      audit("e5", "2026-01-03T00:00:00.000Z");
      const page = async (query: string) => {
        const r = await call("GET", `/admin/audit${query}`, undefined, admin.cookie);
        return { ids: r.body.events.map((e: { subject: string }) => e.subject.slice(5)), next: r.body.next as string | null };
      };
      // The page ends inside the three events of 2 January: all three come along.
      const first = await page("?limit=2");
      expect(first).toEqual({ ids: ["e5", "e4", "e3", "e2"], next: "2026-01-02T00:00:00.000Z" });
      const second = await page(`?limit=2&before=${first.next}`);
      expect(second).toEqual({ ids: ["e1"], next: null });
      expect(await page("?limit=1")).toEqual({ ids: ["e5"], next: "2026-01-03T00:00:00.000Z" });
      expect((await page("?limit=100")).ids).toEqual(["e5", "e4", "e3", "e2", "e1"]);
      // `before` without milliseconds means the same instant as the stored form.
      expect((await page("?before=2026-01-02T00:00:00Z")).ids).toEqual(["e1"]);
      expect(await page("?before=2000-01-01T00:00:00.000Z")).toEqual({ ids: [], next: null });
    });

    it("validates the paging parameters", async () => {
      const admin = await asAdmin();
      for (const path of ["/admin/audit", "/admin/users"]) {
        for (const limit of ["0", "101", "-1", "1.5", "abc", "", "1e2", " 5"]) {
          const r = await call("GET", `${path}?limit=${encodeURIComponent(limit)}`, undefined, admin.cookie);
          expect([path, limit, r.status, r.body.error]).toEqual([path, limit, 400, "bad_limit"]);
        }
        for (const before of ["yesterday", "2026-01-01", "2026-13-01T00:00:00Z", "2026-01-01T00:00:00+03:00", "", "1' OR '1'='1"]) {
          const r = await call("GET", `${path}?before=${encodeURIComponent(before)}`, undefined, admin.cookie);
          expect([path, before, r.status, r.body.error]).toEqual([path, before, 400, "bad_before"]);
        }
        for (const limit of ["1", "100"]) expect((await call("GET", `${path}?limit=${limit}`, undefined, admin.cookie)).status).toBe(200);
      }
    });

    it("lists users by nickname without e-mail or name, and pages through them", async () => {
      await signUp("ana_lima", "ana@example.com");
      await call("POST", "/auth/register", { name: "Bia Souza", nickname: "bia_souza", city: "Natal", email: "bia@example.com" }); // never verified
      const admin = await asAdmin();
      db.sql("UPDATE users SET created_at = '2026-01-01T00:00:00.000Z' WHERE nickname = 'ana_lima'");
      db.sql("UPDATE users SET created_at = '2026-01-02T00:00:00.000Z' WHERE nickname = 'bia_souza'");
      db.sql("UPDATE users SET created_at = '2026-01-03T00:00:00.000Z' WHERE nickname = 'admin_vila'");

      const all = await call("GET", "/admin/users", undefined, admin.cookie);
      expect(all.body.next).toBeNull();
      expect(all.body.users).toEqual([
        { id: admin.user.id, nickname: "admin_vila", role: "admin", city: "Recife", createdAt: "2026-01-03T00:00:00.000Z", verified: true },
        { id: expect.stringMatching(/^[0-9a-f-]{36}$/), nickname: "bia_souza", role: "player", city: "Natal", createdAt: "2026-01-02T00:00:00.000Z", verified: false },
        { id: expect.stringMatching(/^[0-9a-f-]{36}$/), nickname: "ana_lima", role: "player", city: "Recife", createdAt: "2026-01-01T00:00:00.000Z", verified: true },
      ]);
      for (const u of all.body.users) expect(Object.keys(u).sort()).toEqual(["city", "createdAt", "id", "nickname", "role", "verified"]);
      expect(JSON.stringify(all.body)).not.toMatch(/@example\.com|Ana Lima|Bia Souza|email|"name"/);

      const first = await call("GET", "/admin/users?limit=2", undefined, admin.cookie);
      expect(first.body.users.map((u: { nickname: string }) => u.nickname)).toEqual(["admin_vila", "bia_souza"]);
      expect(first.body.next).toBe("2026-01-02T00:00:00.000Z");
      const second = await call("GET", `/admin/users?limit=2&before=${first.body.next}`, undefined, admin.cookie);
      expect(second.body.users.map((u: { nickname: string }) => u.nickname)).toEqual(["ana_lima"]);
      expect(second.body.next).toBeNull();
    });

    it("has no route that grants a role", async () => {
      const admin = await asAdmin();
      const player = await signUp();
      const body = { role: "admin", name: "Ana Lima", nickname: "ana_lima", city: "Recife" };
      for (const path of ["/admin/users", `/admin/users/${player.user.id}`, `/admin/users/${player.user.id}/role`])
        expect([path, (await call("POST", path, body, admin.cookie)).status]).toEqual([path, 404]);
      // The profile correction ignores a `role` field.
      expect((await call("POST", "/me", body, player.cookie)).body.user.role).toBe("player");
      expect(db.sql("SELECT role FROM users WHERE id = ?", player.user.id)[0].role).toBe("player");
    });
  });
});
