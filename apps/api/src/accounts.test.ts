/**
 * End-to-end API tests for accounts, magic-link sign-in, server XP, NGO applications and admin review
 * (IMPL-0011), on real SQLite with the real migrations (test/d1.mjs).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { createD1 } from "../test/d1.mjs";
import { type Env, handleApi } from "./api";
import { loginEmail } from "./mail";

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

const tokenOf = (devLink: string) => decodeURIComponent(new URL(devLink).searchParams.get("login")!);

async function signUp(nickname = "ana_lima", email = "ana@example.com") {
  const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname, city: "Recife", email });
  expect(r.status).toBe(202);
  const v = await call("POST", "/auth/verify", { token: tokenOf(r.body.devLink) });
  expect(v.status).toBe(200);
  const cookie = v.headers.get("Set-Cookie")!.split(";")[0];
  return { cookie, user: v.body.user };
}

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
  env = { DB: db, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true" };
});

describe("feature flag and origin", () => {
  it("hides every account route while accounts are disabled, and says so in /config", async () => {
    env.ACCOUNTS_ENABLED = "false";
    expect((await call("GET", "/config")).body).toEqual({ accounts: false });
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

  it("e-mails the link through the Email Service binding in production, never returning it", async () => {
    const sent: Array<{ to: string; subject: string; text: string }> = [];
    env.ENVIRONMENT = "production";
    env.EMAIL = { send: async (m: { to: string; subject: string; text: string }) => (sent.push(m), { messageId: "m1" }) };
    const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
    expect(r.status).toBe(202);
    expect(r.body.devLink).toBeUndefined();
    expect(sent[0].to).toBe("ana@example.com");
    expect(sent[0].text).toContain(`${ORIGIN}/?login=`);
    expect(sent[0].subject).toBe(loginEmail("x", "y").subject);
  });

  it("never returns the link outside development/test, whatever the environment name", async () => {
    for (const name of [undefined, "staging", "Production", ""]) {
      db = createD1();
      env = { DB: db, ENVIRONMENT: name, ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true" };
      const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" });
      expect([String(name), r.status, r.body.devLink]).toEqual([String(name), 503, undefined]);
      env.EMAIL = { send: async () => ({ messageId: "m" }) };
      const l = await call("POST", "/auth/link", { email: "ana@example.com" });
      expect(l.body.devLink).toBeUndefined();
    }
  });

  it("fails closed when production has no mail binding or the send fails", async () => {
    env.ENVIRONMENT = "production";
    expect((await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com" })).status).toBe(503);
    env.EMAIL = { send: async () => Promise.reject(Object.assign(new Error("x"), { code: "E_RATE_LIMIT_EXCEEDED" })) };
    expect((await call("POST", "/auth/register", { name: "Bia", nickname: "bia_b", city: "Natal", email: "bia@example.com" })).body.error).toBe("mail_unavailable");
    // /auth/link answers 202 even when the send fails: a 503 there would reveal that the account exists.
    expect((await call("POST", "/auth/link", { email: "bia@example.com" })).status).toBe(202);
  });

  it("logs out and deletes the account with its sessions and mission events", async () => {
    const { cookie, user } = await signUp();
    await call("POST", "/progress/events", { events: [{ missionId: "play-memory", eventId: "game-1" }] }, cookie);
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
    const { cookie } = await signUp();
    const ev = (eventId: string) => ({ missionId: "explore-gifts", eventId });
    let r = await call("POST", "/progress/events", { events: [ev("gift-bench"), ev("gift-bench")] }, cookie);
    expect(r.body.progress.xp).toBe(0);
    r = await call("POST", "/progress/events", { events: [ev("gift-palm"), ev("gift-street")] }, cookie);
    expect(r.body.progress.xp).toBe(30);
    expect(r.body.progress.completed["explore-gifts"]).toBe(true);
    r = await call("POST", "/progress/events", { events: [ev("gift-palm")] }, cookie);
    expect(r.body.progress.xp).toBe(30);
    expect((await call("GET", "/progress", undefined, cookie)).body.progress.xp).toBe(30);
  });

  it("rejects unknown missions and malformed event ids", async () => {
    const { cookie } = await signUp();
    expect((await call("POST", "/progress/events", { events: [{ missionId: "donate-1000", eventId: "x" }] }, cookie)).status).toBe(400);
    expect((await call("POST", "/progress/events", { events: [{ missionId: "play-memory", eventId: "<script>" }] }, cookie)).status).toBe(400);
    expect((await call("POST", "/progress/events", { events: [] }, cookie)).status).toBe(400);
    expect((await call("GET", "/progress")).status).toBe(401);
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
    const { cookie } = await signUp();
    const bad = await call("POST", "/ngo/application", { ...APP, cnpj: "11222333000180" }, cookie);
    expect(bad.status).toBe(400);
    expect(bad.body.fields.cnpj).toBeDefined();
    const ok = await call("POST", "/ngo/application", APP, cookie);
    expect(ok.status).toBe(201);
    expect(ok.body.application).toMatchObject({ status: "submitted", revision: 1, lotId: "plaza-03" });
    expect(lot("plaza-03").state).toBe("application_sent");
    expect((await call("POST", "/ngo/application", APP, cookie)).body.error).toBe("application_active");
    // Nothing public before approval.
    const pub = (await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-03");
    expect(pub).toMatchObject({ state: "application_sent", ngo_name: null });
  });

  it("keeps lots and CNPJs exclusive between applicants", async () => {
    const a = await signUp();
    await call("POST", "/ngo/application", APP, a.cookie);
    const b = await signUp("bia", "bia@example.com");
    expect((await call("POST", "/ngo/application", { ...APP, cnpj: "11444777000161" }, b.cookie)).body.error).toBe("lot_unavailable");
    expect((await call("POST", "/ngo/application", { ...APP, lotId: "plaza-04" }, b.cookie)).body.error).toBe("cnpj_in_use");
  });

  it("runs the review: start → changes requested → resubmit → approve, all audited", async () => {
    const applicant = await signUp();
    const admin = await asAdmin();
    const id = (await call("POST", "/ngo/application", APP, applicant.cookie)).body.application.id;
    expect((await call("GET", "/admin/applications", undefined, applicant.cookie)).status).toBe(403);

    expect((await call("GET", "/admin/applications", undefined, admin)).body.applications.map((a: { id: string }) => a.id)).toEqual([id]);
    expect((await call("POST", `/admin/applications/${id}/decision`, { action: "start_review" }, admin)).body.application.status).toBe("under_review");
    expect(lot("plaza-03").state).toBe("under_review");
    expect((await call("POST", `/admin/applications/${id}/decision`, { action: "request_changes", note: "curto" }, admin)).body.error).toBe("note_required");
    const changes = await call("POST", `/admin/applications/${id}/decision`, { action: "request_changes", note: "Envie o relatório de recursos de 2025." }, admin);
    expect(changes.body.application).toMatchObject({ status: "changes_requested", reviewNote: "Envie o relatório de recursos de 2025." });
    expect((await call("GET", "/ngo/application", undefined, applicant.cookie)).body.application.reviewNote).toMatch(/relatório/);

    const re = await call("POST", "/ngo/application", { ...APP, lotId: "plaza-05" }, applicant.cookie);
    expect(re.body.application).toMatchObject({ status: "submitted", revision: 2, lotId: "plaza-05", reviewNote: null });
    expect(lot("plaza-03").state).toBe("available");
    expect(lot("plaza-05").state).toBe("application_sent");

    expect((await call("POST", `/admin/applications/${id}/decision`, { action: "approve" }, admin)).body.application.status).toBe("published");
    expect(lot("plaza-05")).toEqual({ state: "published", ngo_id: id });
    const pub = (await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-05");
    expect(pub).toMatchObject({ state: "published", ngo_name: "Associação Exemplo" });
    expect((await call("POST", `/admin/applications/${id}/decision`, { action: "reject", note: "Motivo qualquer aqui." }, admin)).body.error).toBe("bad_transition");

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
    const id = (await call("POST", "/ngo/application", APP, applicant.cookie)).body.application.id;
    await call("POST", `/admin/applications/${id}/decision`, { action: "reject", note: "CNPJ inativo na Receita Federal." }, admin);
    expect(lot("plaza-03")).toEqual({ state: "available", ngo_id: null });
    expect((await call("POST", "/ngo/application", APP, applicant.cookie)).body.application).toMatchObject({ status: "submitted", revision: 2 });
  });

  it("keeps the application (without the applicant link) when the account is deleted", async () => {
    const applicant = await signUp();
    await call("POST", "/ngo/application", APP, applicant.cookie);
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
    const id = (await call("POST", "/ngo/application", APP, admin.cookie)).body.application.id;
    expect((await call("POST", `/admin/applications/${id}/decision`, { action: "approve" }, admin.cookie)).body.error).toBe("self_review");
    for (const action of ["toString", "constructor", "__proto__", 1])
      expect((await call("POST", `/admin/applications/${id}/decision`, { action }, admin.cookie)).status).toBe(400);
  });

  it("enforces one active application per person in the database", async () => {
    const { cookie, user } = await signUp();
    await call("POST", "/ngo/application", APP, cookie);
    expect(() =>
      db.sql("INSERT INTO ngos (id, name, cnpj, status, applicant_id) VALUES ('x', 'Outra', '11444777000161', 'submitted', ?)", user.id)
    ).toThrow(/UNIQUE/);
  });

  it("writes nothing when a resubmission loses its lot", async () => {
    const applicant = await signUp();
    const admin = await signUp("admin_vila", "admin@example.com");
    db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
    const id = (await call("POST", "/ngo/application", APP, applicant.cookie)).body.application.id;
    await call("POST", `/admin/applications/${id}/decision`, { action: "request_changes", note: "Envie o relatório anual." }, admin.cookie);
    const other = await signUp("bia", "bia@example.com");
    await call("POST", "/ngo/application", { ...APP, cnpj: "11444777000161", lotId: "plaza-06" }, other.cookie);
    const r = await call("POST", "/ngo/application", { ...APP, name: "Nome Novo", lotId: "plaza-06" }, applicant.cookie);
    expect(r.body.error).toBe("lot_unavailable");
    expect(db.sql("SELECT name, status, revision, requested_lot_id FROM ngos WHERE id = ?", id)).toEqual([
      { name: APP.name, status: "changes_requested", revision: 1, requested_lot_id: "plaza-03" },
    ]);
    expect(db.sql("SELECT state, ngo_id FROM lots WHERE id = 'plaza-03'")).toEqual([{ state: "application_sent", ngo_id: id }]);
  });

  it("caps stored mission events per account", async () => {
    const { cookie, user } = await signUp();
    for (let i = 0; i < 500; i++) db.sql("INSERT INTO progress_events (user_id, mission_id, event_id) VALUES (?, 'play-memory', ?)", user.id, `e${i}`);
    expect((await call("POST", "/progress/events", { events: [{ missionId: "play-memory", eventId: "one-more" }] }, cookie)).status).toBe(429);
  });

  it("refuses an oversized body before reading it", async () => {
    const res = await handleApi(
      new Request("https://api.example/auth/link", { method: "POST", headers: { Origin: ORIGIN, "Content-Type": "application/json", "Content-Length": "999999" }, body: "{}" }),
      env
    );
    expect(res.status).toBe(413);
  });
});
