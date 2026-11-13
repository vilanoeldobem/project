/**
 * End-to-end API tests for role management and the account block (IMPL-0021), on real SQLite with the real
 * migrations (test/d1.mjs). Seeded accounts use their name as id and as session token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configuredVars, devVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { png } from "../test/fixtures.mjs";
import { createR2 } from "../test/r2.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

const DASH = "https://dash.example", GAME = "https://play.example";
const MESSAGE = "MESSAGE to the person about the block";
const UUID = "a0000000-0000-4000-8000-000000000001";
const APPLICATION = { name: "Associação Exemplo", cnpj: "11222333000181", openedOn: "2020-01-01", city: "Recife",
  declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true }, fundsConfirmation: "Extratos e relatórios conciliáveis da organização.",
  summary: "Apoio escolar às crianças da comunidade.", description: "Atendemos crianças com atividades educativas e culturais na comunidade.", tags: ["education"], projects: [], lotId: "plaza-01" };
const EVENTS = [{ missionId: "play-memory", eventId: "win" }];
let db: ReturnType<typeof createD1>, env: Env, bucket: ReturnType<typeof createR2>;

type Answer = { status: number; body: any; headers: Headers };
const request = async (method: string, path: string, session: string, origin: string | null, headers: Record<string, string>, body?: BodyInit): Promise<Answer> => {
  const res = await handleApi(new Request(`https://api.example${path}`, {
    method, headers: { ...(origin ? { Origin: origin } : {}), ...(session ? { Cookie: `__Host-vila_session=${session}` } : {}), ...headers }, body,
  }), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};
const call = (method: string, path: string, body?: unknown, session = "admin", origin: string | null = DASH) =>
  request(method, path, session, origin, body === undefined ? {} : { "Content-Type": "application/json" }, body === undefined ? undefined : JSON.stringify(body));
const setRole = (target: string, role: unknown, actor = "admin") => call("POST", `/admin/users/${target}/role`, { accountId: actor, role }, actor);
const block = (target: string, actor = "admin", message: unknown = MESSAGE) => call("POST", `/admin/users/${target}/block`, { accountId: actor, message }, actor);
const unblock = (target: string, actor = "admin") => call("POST", `/admin/users/${target}/unblock`, { accountId: actor }, actor);
const audit = () => db.sql("SELECT actor, action, subject, detail FROM audit_events ORDER BY rowid");
const user = (id: string) => db.sql("SELECT role, blocked FROM users WHERE id = ?", id)[0];
const admins = () => db.sql("SELECT id FROM users WHERE role = 'admin' ORDER BY id").map((row) => row.id);

/** Asks for a sign-in link as the game does and returns the token it carries. */
async function linkToken(email: string): Promise<string> {
  const link = await call("POST", "/auth/link", { email }, "", GAME);
  expect(link.status).toBe(202);
  return decodeURIComponent(new URLSearchParams(new URL(link.body.devLink).hash.slice(1)).get("login")!);
}
/** The whole link flow: the answer of `POST /auth/verify` and the new session token. */
async function signIn(email: string) {
  const verified = await call("POST", "/auth/verify", { token: await linkToken(email) }, "", GAME);
  return { ...verified, session: verified.headers.get("Set-Cookie")?.split(";")[0].split("=")[1] ?? "" };
}

/** Runs `competing` right before the next `db.batch`: a request that commits between another's read and its write. */
function beforeNextBatch(competing: () => Promise<unknown>) {
  const original = db.batch.bind(db);
  db.batch = (async (statements: Parameters<typeof db.batch>[0]) => {
    db.batch = original;
    await competing();
    return original(statements);
  }) as typeof db.batch;
}
/** Same, for a write that is one statement outside a batch: runs `competing` right before the first statement whose SQL matches. */
function beforeStatement(sql: RegExp, competing: () => Promise<unknown>) {
  const original = db.prepare.bind(db);
  db.prepare = ((query: string) => {
    const statement = original(query);
    if (!sql.test(query)) return statement;
    db.prepare = original;
    return { ...statement, bind: (...values: unknown[]) => {
      const bound = statement.bind(...values);
      return { ...bound, run: async () => { await competing(); return bound.run(); } };
    } };
  }) as typeof db.prepare;
}
/** Same, for the conditional write of an upload's bytes: the reservation and the "still active" check already happened. */
function beforeNextBytesPut(competing: () => Promise<unknown>) {
  const original = bucket.put.bind(bucket);
  bucket.put = (async (...args: Parameters<typeof original>) => {
    if (!(args[2] as R2PutOptions | undefined)?.onlyIf) return original(...args);
    bucket.put = original;
    await competing();
    return original(...args);
  }) as typeof bucket.put;
}

async function seed(database: ReturnType<typeof createD1>, users: Record<string, string> = { admin: "admin", admin2: "admin", admin3: "admin", ana: "player", bia: "player" }) {
  for (const [id, role] of Object.entries(users)) {
    await database.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)")
      .bind(id, `Name of ${id}`, id, id, "Recife", `${id}@example.test`, role, "2026-01-01", "2026-01-01T00:00:00.000Z").run();
    await database.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(id), id, "2099-01-01").run();
  }
}

beforeEach(async () => {
  db = createD1(); bucket = createR2();
  env = { DB: db, FILES: bucket, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: `${DASH},${GAME}`, GAME_ORIGIN: GAME, DASH_ORIGIN: DASH,
    ACCOUNT_BLOCK_ENABLED: "true", PRESENCE_MODERATION_ENABLED: "true", NGO_FILES_ENABLED: "true", NGO_PHOTOS_ENABLED: "true" };
  await seed(db);
});
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("role management (IMPL-0021)", () => {
  it("promotes and demotes from the dashboard, audited, without e-mail or name in the answer", async () => {
    const promoted = await setRole("ana", "admin");
    expect(promoted.status).toBe(200);
    expect(promoted.headers.get("Cache-Control")).toBe("no-store");
    expect(promoted.body).toEqual({ user: { id: "ana", nickname: "ana", role: "admin", city: "Recife", createdAt: "2026-01-01T00:00:00.000Z", verified: true, blocked: false } });
    expect(JSON.stringify(promoted.body)).not.toMatch(/example\.test|Name of/);
    // The new administrator's existing session reaches the admin routes at once.
    expect((await call("GET", "/admin/users", undefined, "ana")).status).toBe(200);
    expect((await call("GET", "/me", undefined, "ana")).body.user.role).toBe("admin");

    const demoted = await setRole("ana", "player", "admin2");
    expect(demoted.body.user).toMatchObject({ id: "ana", role: "player" });
    expect(audit()).toEqual([
      { actor: "admin", action: "user.role_change", subject: "user:ana", detail: JSON.stringify({ from: "player", to: "admin" }) },
      { actor: "admin2", action: "user.role_change", subject: "user:ana", detail: JSON.stringify({ from: "admin", to: "player" }) },
    ]);
  });

  it("revokes nothing else on demotion: the session stays, the next admin request answers 403 admin_only", async () => {
    expect((await setRole("admin2", "player")).status).toBe(200);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'admin2'")[0].n).toBe(1);
    expect((await call("GET", "/me", undefined, "admin2")).body.user).toMatchObject({ id: "admin2", role: "player" });
    for (const [method, path, body] of [["GET", "/admin/users"], ["GET", "/admin/audit"], ["POST", "/admin/users/ana/role", { accountId: "admin2", role: "admin" }]] as const) {
      const refused = await call(method, path, body, "admin2");
      expect([path, refused.status, refused.body]).toEqual([path, 403, { error: "admin_only" }]);
    }
    expect(user("ana").role).toBe("player");
  });

  it("is idempotent: the role an account already has answers 200 and writes no audit row", async () => {
    expect((await setRole("ana", "player")).body.user).toMatchObject({ id: "ana", role: "player" });
    expect((await setRole("admin2", "admin")).body.user).toMatchObject({ id: "admin2", role: "admin" });
    expect((await setRole("ana", "admin")).status).toBe(200);
    expect((await setRole("ana", "admin")).status).toBe(200);
    expect(audit()).toHaveLength(1);
  });

  it("refuses the signed out, the default role, another tab's account, a foreign origin and disabled accounts", async () => {
    expect([(await setRole("ana", "admin", "")).status, (await setRole("ana", "admin", "bia")).body]).toEqual([401, { error: "admin_only" }]);
    const otherTab = await call("POST", "/admin/users/ana/role", { accountId: "admin2", role: "admin" });
    expect([otherTab.status, otherTab.body.error]).toEqual([409, "account_changed"]);
    for (const origin of [null, `${DASH}.evil`, "https://www.example"])
      expect((await call("POST", "/admin/users/ana/role", { accountId: "admin", role: "admin" }, "admin", origin)).body).toEqual({ error: "forbidden_origin" });
    env.ACCOUNTS_ENABLED = "false";
    expect((await setRole("ana", "admin")).body).toEqual({ error: "accounts_disabled" });
    expect(user("ana").role).toBe("player");
    expect(audit()).toEqual([]);
  });

  it("refuses an unknown role, one's own role, an unknown account and the promotion of a blocked account", async () => {
    for (const role of ["owner", "Admin", "", null, undefined, 1, "__proto__", "constructor"]) {
      const refused = await setRole("ana", role);
      expect([String(role), refused.status, refused.body]).toEqual([String(role), 400, { error: "bad_role" }]);
    }
    for (const role of ["player", "admin"]) {
      const own = await setRole("admin", role);
      expect([own.status, own.body]).toEqual([403, { error: "self_role" }]);
    }
    const unknown = await setRole("nobody", "admin");
    expect([unknown.status, unknown.body]).toEqual([404, { error: "not_found" }]);
    expect((await block("ana")).status).toBe(200);
    const blocked = await setRole("ana", "admin");
    expect([blocked.status, blocked.body]).toEqual([409, { error: "account_blocked" }]);
    expect(user("ana")).toEqual({ role: "player", blocked: 1 });
    expect(user("admin").role).toBe("admin");
    expect(audit().map((row) => row.action)).toEqual(["user.block"]);
  });

  it("lets exactly one of the last two administrators demote the other, with one audit row", async () => {
    await db.prepare("DELETE FROM users WHERE id = 'admin3'").run();
    // admin2's demotion of admin commits between admin's read and admin's write.
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await setRole("admin", "player", "admin2"); });
    const late = await setRole("admin2", "player");
    expect(competing.status).toBe(200);
    expect([late.status, late.body]).toEqual([409, { error: "last_admin" }]);
    expect(admins()).toEqual(["admin2"]);
    expect(audit()).toEqual([{ actor: "admin2", action: "user.role_change", subject: "user:admin", detail: JSON.stringify({ from: "admin", to: "player" }) }]);
    // The loser is no longer an administrator: nothing they send changes a role.
    expect((await setRole("admin2", "player")).body).toEqual({ error: "admin_only" });
    expect(admins()).toEqual(["admin2"]);
  });

  it("refuses in SQL a role change by an administrator who was demoted after the session check", async () => {
    for (const [target, role] of [["admin3", "player"], ["ana", "admin"]] as const) {
      await db.prepare("UPDATE users SET role = 'admin' WHERE id = 'admin2'").run();
      const before = audit().length;
      beforeNextBatch(() => setRole("admin2", "player"));
      const late = await setRole(target, role, "admin2");
      expect([target, late.status, late.body]).toEqual([target, 403, { error: "admin_only" }]);
      expect(user(target).role).toBe(role === "admin" ? "player" : "admin");
      expect(audit().slice(before).map((row) => row.subject)).toEqual(["user:admin2"]);
    }
  });

  it("writes one audit row when two administrators make the same change at once", async () => {
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await setRole("ana", "admin", "admin2"); });
    const late = await setRole("ana", "admin");
    expect([competing.status, late.status, late.body.user.role]).toEqual([200, 200, "admin"]);
    expect(audit()).toEqual([{ actor: "admin2", action: "user.role_change", subject: "user:ana", detail: JSON.stringify({ from: "player", to: "admin" }) }]);
  });

  it("answers 404 when the account was deleted meanwhile, and rolls back when the audit row cannot be written", async () => {
    beforeNextBatch(() => call("DELETE", "/me", undefined, "ana", GAME));
    const late = await setRole("ana", "admin");
    expect([late.status, late.body]).toEqual([404, { error: "not_found" }]);
    expect(audit().map((row) => row.action)).toEqual(["user.delete"]);

    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("CREATE TRIGGER fail_role BEFORE INSERT ON audit_events WHEN NEW.action='user.role_change' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    expect((await setRole("bia", "admin")).status).toBe(500);
    expect(user("bia").role).toBe("player");
    expect(logged).toHaveBeenCalledWith("api_error", "/admin/users/bia/role", "Error");
  });

  it("shows role and block in the users list, never the block message", async () => {
    await block("ana");
    const list = await call("GET", "/admin/users");
    expect(list.body.users.map((row: Record<string, unknown>) => [row.id, row.role, row.blocked]).sort()).toEqual(
      [["admin", "admin", false], ["admin2", "admin", false], ["admin3", "admin", false], ["ana", "player", true], ["bia", "player", false]]);
    expect(JSON.stringify(list.body)).not.toMatch(/MESSAGE|example\.test|Name of/);
  });
});

describe("account block (PROPOSTA, IMPL-0021)", () => {
  it("records the block, ends every session at once and audits without the message", async () => {
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex("ana-phone"), "ana", "2099-01-01").run();
    expect((await call("GET", "/progress", undefined, "ana", GAME)).status).toBe(200);
    const blocked = await block("ana", "admin", `  ${MESSAGE}  `);
    expect(blocked.status).toBe(200);
    expect(blocked.headers.get("Cache-Control")).toBe("no-store");
    expect(blocked.body).toEqual({ user: { id: "ana", nickname: "ana", role: "player", city: "Recife", createdAt: "2026-01-01T00:00:00.000Z", verified: true, blocked: true } });

    const ledger = db.sql("SELECT * FROM account_blocks");
    expect(ledger).toEqual([{ id: expect.stringMatching(/^[0-9a-f-]{36}$/), user_id: "ana", message: MESSAGE, blocked_by: "admin", blocked_at: expect.stringMatching(/Z$/), lifted_at: null, lifted_by: null }]);
    expect(audit()).toEqual([{ actor: "admin", action: "user.block", subject: "user:ana", detail: JSON.stringify({ block: ledger[0].id }) }]);
    expect(JSON.stringify([audit(), blocked.body])).not.toContain("MESSAGE");

    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'ana'")[0].n).toBe(0);
    for (const session of ["ana", "ana-phone"]) {
      expect((await call("GET", "/me", undefined, session, GAME)).body).toEqual({ user: null });
      expect((await call("GET", "/progress", undefined, session, GAME)).body).toEqual({ error: "not_signed_in" });
    }
    // Nobody else lost a session.
    expect((await call("GET", "/me", undefined, "bia", GAME)).body.user.id).toBe("bia");
  });

  it("opens only a restricted session from the sign-in link: read the reason, sign out, delete the account", async () => {
    await block("ana");
    const signed = await signIn("ana@example.test");
    expect(signed.status).toBe(200);
    expect(signed.body.user).toEqual({ id: "ana", name: "Name of ana", nickname: "ana", city: "Recife", email: "ana@example.test", role: "player", deletionPending: false,
      blocked: { message: MESSAGE, at: db.sql("SELECT blocked_at FROM account_blocks")[0].blocked_at } });
    expect((await call("GET", "/me", undefined, signed.session, GAME)).body).toEqual({ user: signed.body.user });

    const refused: Array<[string, string, unknown?]> = [
      ["GET", "/progress"], ["POST", "/progress/events", { accountId: "ana", events: EVENTS }], ["POST", "/me", { nickname: "ana_again" }],
      ["GET", "/ngo/application"], ["POST", "/ngo/application", { accountId: "ana", ...APPLICATION }],
      ["POST", "/ngo/application/files?kind=logo"], ["GET", `/ngo/application/files/${UUID}`], ["DELETE", `/ngo/application/files/${UUID}`], ["POST", "/ngo/application/files/recover"],
      ["POST", `/ngo/photos?ngoId=${UUID}&position=0`], ["GET", `/ngo/photos?ngoId=${UUID}`], ["DELETE", `/ngo/photos/${UUID}`], ["GET", `/ngo/photos/${UUID}/content`],
      ["GET", "/admin/users"], ["GET", "/admin/applications"], ["POST", "/admin/users/bia/role", { accountId: "ana", role: "admin" }], ["POST", "/admin/moderation/ticket", { accountId: "ana", room: 0, target: 1 }],
    ];
    for (const [method, path, body] of refused) {
      const answer = await call(method, path, body, signed.session, GAME);
      expect([method, path, answer.status, answer.body]).toEqual([method, path, 403, { error: "session_blocked" }]);
      expect(answer.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(db.sql("SELECT nickname FROM users WHERE id = 'ana'")[0].nickname).toBe("ana");
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events")[0].n).toBe(0);
    expect(db.sql("SELECT COUNT(*) AS n FROM ngos")[0].n).toBe(0);

    expect((await call("POST", "/auth/logout", {}, signed.session, GAME)).status).toBe(204);
    expect((await call("GET", "/me", undefined, signed.session, GAME)).body).toEqual({ user: null });
  });

  it("never takes erasure away: a blocked person deletes the account, and the block ledger goes with it", async () => {
    await block("ana");
    const { session } = await signIn("ana@example.test");
    const deleted = await call("DELETE", "/me", undefined, session, GAME);
    expect(deleted.status).toBe(204);
    expect(db.sql("SELECT id FROM users WHERE id = 'ana'")).toEqual([]);
    expect(db.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(db.sql("SELECT * FROM sessions WHERE user_id = 'ana'")).toEqual([]);
    expect(audit().map((row) => [row.actor, row.action, row.subject])).toEqual([["admin", "user.block", "user:ana"], ["ana", "user.delete", "user:ana"]]);
    expect(JSON.stringify(audit())).not.toContain("MESSAGE");
    // Nothing keeps the e-mail after the erasure: the block was on the account (OQ-11).
    const again = await call("POST", "/auth/register", { name: "Ana Lima", nickname: "ana", city: "Recife", email: "ana@example.test" }, "", GAME);
    expect(again.status).toBe(202);
    expect(db.sql("SELECT blocked FROM users WHERE email = 'ana@example.test'")).toEqual([{ blocked: 0 }]);
  });

  it("answers the sign-in routes for a blocked e-mail exactly as for any other", async () => {
    await block("ana");
    const sent: Array<{ to: string[]; subject: string; text: string }> = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return Response.json({ id: "email_1" }); });
    env = { ...env, ENVIRONMENT: "production", RESEND_API_KEY: "re_test_key" };
    const seen = async (answer: Promise<Answer>) => { const { status, body, headers } = await answer; return { status, body, headers: [...headers].sort() }; };
    const link = (email: string) => seen(call("POST", "/auth/link", { email }, "", GAME));
    const blocked = await link("ana@example.test");
    expect(blocked).toEqual({ status: 202, body: { ok: true }, headers: expect.any(Array) });
    expect(await link("bia@example.test")).toEqual(blocked);
    expect(await link("nobody@example.test")).toEqual(blocked);
    expect(await link("not an e-mail")).toEqual(blocked);
    const register = (nickname: string, email: string) => seen(call("POST", "/auth/register", { name: "Nova Pessoa", nickname, city: "Natal", email }, "", GAME));
    expect(await register("nova_1", "ana@example.test")).toEqual(await register("nova_2", "bia@example.test"));
    expect(await register("nova_3", "new@example.test")).toEqual(blocked);
    // The blocked person gets the same e-mail as anyone: the reason is read after the link, never in the answer.
    const mail = (to: string) => sent.filter((message) => message.to[0] === to).map((message) => [message.subject, message.text.replace(/#login=\S+/, "#login=…").replace(/Olá, \w+!/, "Olá!")]);
    expect(mail("ana@example.test")).toEqual(mail("bia@example.test"));
    expect(mail("ana@example.test")).toHaveLength(2);
    expect(JSON.stringify(sent)).not.toContain("MESSAGE");
    expect(db.sql("SELECT COUNT(*) AS n FROM users WHERE email = 'ana@example.test'")[0].n).toBe(1);
  });

  it("keeps a blocked registration that was never verified, so its e-mail cannot register again", async () => {
    const old = "2026-01-01T00:00:00.000Z";
    for (const id of ["ghost", "spam"])
      await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,created_at) VALUES(?,?,?,?,?,?,?)").bind(id, id, id, id, "Natal", `${id}@example.test`, old).run();
    expect((await block("spam")).status).toBe(200);
    const again = await call("POST", "/auth/register", { name: "Outra Pessoa", nickname: "outra", city: "Natal", email: "spam@example.test" }, "", GAME);
    expect(again.status).toBe(202);
    // The unverified, unblocked registration expired as before; the blocked one stays, and no second account exists.
    expect(db.sql("SELECT id FROM users WHERE id IN ('ghost','spam') OR nickname = 'outra'")).toEqual([{ id: "spam" }]);
    expect(user("spam").blocked).toBe(1);
  });

  it("refuses a missing flag, self, an administrator, a repeated block and an account that is not blocked", async () => {
    const own = await block("admin");
    expect([own.status, own.body]).toEqual([403, { error: "self_block" }]);
    const other = await block("admin2");
    expect([other.status, other.body]).toEqual([409, { error: "admin_account" }]);
    const unknown = await block("nobody");
    expect([unknown.status, unknown.body]).toEqual([404, { error: "not_found" }]);
    const notBlocked = await unblock("ana");
    expect([notBlocked.status, notBlocked.body]).toEqual([409, { error: "bad_transition" }]);
    expect((await unblock("nobody")).body).toEqual({ error: "not_found" });
    expect((await block("ana")).status).toBe(200);
    const twice = await block("ana", "admin2");
    expect([twice.status, twice.body]).toEqual([409, { error: "bad_transition" }]);

    env.ACCOUNT_BLOCK_ENABLED = "false";
    const off = await block("bia");
    expect([off.status, off.body]).toEqual([404, { error: "not_found" }]);
    expect(user("bia").blocked).toBe(0);
    expect(db.sql("SELECT user_id FROM account_blocks")).toEqual([{ user_id: "ana" }]);
    expect(audit().map((row) => row.action)).toEqual(["user.block"]);
    // Admin sessions untouched by every refusal above.
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id IN ('admin','admin2','bia')")[0].n).toBe(3);
  });

  it("requires an administrator, the current account, an allowed origin and enabled accounts, for block and unblock", async () => {
    await db.prepare("UPDATE users SET blocked = 1 WHERE id = 'bia'").run();
    for (const [path, body] of [["/admin/users/ana/block", { message: MESSAGE }], ["/admin/users/bia/unblock", {}]] as const) {
      expect([path, (await call("POST", path, { accountId: "", ...body }, "")).status]).toEqual([path, 401]);
      expect([path, (await call("POST", path, { accountId: "ana", ...body }, "ana")).body]).toEqual([path, { error: "admin_only" }]);
      expect([path, (await call("POST", path, { accountId: "admin2", ...body })).body]).toEqual([path, { error: "account_changed" }]);
      for (const origin of [null, `${DASH}.evil`]) expect((await call("POST", path, { accountId: "admin", ...body }, "admin", origin)).body).toEqual({ error: "forbidden_origin" });
      env.ACCOUNTS_ENABLED = "false";
      expect([path, (await call("POST", path, { accountId: "admin", ...body })).body]).toEqual([path, { error: "accounts_disabled" }]);
      env.ACCOUNTS_ENABLED = "true";
    }
    expect([user("ana").blocked, user("bia").blocked]).toEqual([0, 1]);
    expect(audit()).toEqual([]);
  });

  it("names the message as the message to the person and validates it without writing", async () => {
    const attempts = [{}, ...[null, 42, "", "too short", " ".repeat(40), "x".repeat(1001), `${"x".repeat(12)}\0`].map((message) => ({ message }))];
    for (const attempt of attempts) {
      const refused = await call("POST", "/admin/users/ana/block", { accountId: "admin", ...attempt });
      expect([refused.status, refused.body.error, refused.body.fields]).toEqual([400, "message_required", { message: expect.stringMatching(/mensagem para a pessoa.*Ela lê este texto/) }]);
    }
    expect(user("ana").blocked).toBe(0);
    expect(db.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'ana'")[0].n).toBe(1);
  });

  it("refuses a message made of characters nobody can see, and stores the message without them", async () => {
    for (const message of ["\u200b".repeat(10), "\u202e".repeat(10), `\u2060\ufeff\u00ad\u200d curta \u200c\u061c\u2066\u2069`, "\u0007".repeat(12)]) {
      const refused = await block("ana", "admin", message);
      expect([JSON.stringify(message), refused.status, refused.body.error, refused.body.fields]).toEqual([JSON.stringify(message), 400, "message_required", { message: expect.stringMatching(/mensagem para a pessoa/) }]);
    }
    expect(user("ana").blocked).toBe(0);
    expect(db.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(audit()).toEqual([]);
    // A direction override would show the reason backwards: the person reads the text without it.
    expect((await block("ana", "admin", `\u202e${MESSAGE}\u200b`)).status).toBe(200);
    expect(db.sql("SELECT message FROM account_blocks")).toEqual([{ message: MESSAGE }]);
    expect((await signIn("ana@example.test")).body.user.blocked.message).toBe(MESSAGE);
  });

  it.each([10, 1000])("accepts a message of %i Unicode characters, consistently with the database constraint", async (count) => {
    const message = "🎄".repeat(count);
    expect((await block("ana", "admin", message)).status).toBe(200);
    expect(db.sql("SELECT message FROM account_blocks")[0].message).toBe(message);
  });

  it("keeps a recorded block in force with the flag off, and lets an administrator lift it", async () => {
    await block("ana");
    const { session } = await signIn("ana@example.test");
    env.ACCOUNT_BLOCK_ENABLED = "false";
    expect((await call("GET", "/config", undefined, "", null)).body.moderation.block).toBe(false);
    expect((await call("GET", "/progress", undefined, session, GAME)).body).toEqual({ error: "session_blocked" });
    expect((await call("GET", "/me", undefined, session, GAME)).body.user.blocked.message).toBe(MESSAGE);

    const lifted = await unblock("ana", "admin2");
    expect(lifted.status).toBe(200);
    expect(lifted.body.user).toMatchObject({ id: "ana", blocked: false });
    const ledger = db.sql("SELECT id, lifted_at, lifted_by FROM account_blocks");
    expect(ledger).toEqual([{ id: expect.any(String), lifted_at: expect.stringMatching(/Z$/), lifted_by: "admin2" }]);
    expect(audit().at(-1)).toEqual({ actor: "admin2", action: "user.unblock", subject: "user:ana", detail: JSON.stringify({ block: ledger[0].id }) });
    // The session the person opened with their own link works in full again.
    expect((await call("GET", "/progress", undefined, session, GAME)).status).toBe(200);
    expect((await call("GET", "/me", undefined, session, GAME)).body.user.blocked).toBeUndefined();
    expect((await setRole("ana", "admin")).status).toBe(200);
  });

  it("keeps the history when an account is blocked again", async () => {
    env.ACCOUNT_BLOCK_ENABLED = "true";
    await block("ana"); await unblock("ana"); await block("ana", "admin2", "A second MESSAGE to the person");
    expect(db.sql("SELECT blocked_by, lifted_at IS NULL AS active FROM account_blocks ORDER BY rowid")).toEqual([{ blocked_by: "admin", active: 0 }, { blocked_by: "admin2", active: 1 }]);
    expect((await signIn("ana@example.test")).body.user.blocked.message).toBe("A second MESSAGE to the person");
    expect(() => db.sql("INSERT INTO account_blocks(id,user_id,message,blocked_by,blocked_at) VALUES('x','ana','A third message','admin','2026-01-01')")).toThrow(/UNIQUE/);
    expect(audit().map((row) => row.action)).toEqual(["user.block", "user.unblock", "user.block"]);
  });

  it("ships switched off: production and staging say \"false\", the local dev script turns it on", () => {
    expect(configuredVars("ACCOUNT_BLOCK_ENABLED")).toEqual(["false", "false"]);
    expect(devVar("ACCOUNT_BLOCK_ENABLED")).toBe("true");
  });

  it("tells the apps in /config whether new blocks are on, and only with accounts on", async () => {
    const flag = async () => (await call("GET", "/config", undefined, "", null)).body.moderation.block;
    expect(await flag()).toBe(true);
    env.ACCOUNT_BLOCK_ENABLED = "false"; expect(await flag()).toBe(false);
    env.ACCOUNT_BLOCK_ENABLED = "true"; env.ACCOUNTS_ENABLED = "false"; expect(await flag()).toBe(false);
  });
});

describe("block racing other writes", () => {
  it("commits one of two concurrent blocks, with one ledger row and one audit row", async () => {
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await block("ana", "admin2"); });
    const late = await block("ana");
    expect([competing.status, late.status, late.body]).toEqual([200, 409, { error: "bad_transition" }]);
    expect(db.sql("SELECT blocked_by FROM account_blocks")).toEqual([{ blocked_by: "admin2" }]);
    expect(audit().map((row) => [row.actor, row.action])).toEqual([["admin2", "user.block"]]);
  });

  it("commits one of two concurrent unblocks, with one audit row", async () => {
    await block("ana");
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await unblock("ana", "admin2"); });
    const late = await unblock("ana");
    expect([competing.status, late.status, late.body]).toEqual([200, 409, { error: "bad_transition" }]);
    expect(db.sql("SELECT lifted_by FROM account_blocks")).toEqual([{ lifted_by: "admin2" }]);
    expect(audit().map((row) => [row.actor, row.action])).toEqual([["admin", "user.block"], ["admin2", "user.unblock"]]);
  });

  it("refuses in SQL a block or an unblock by an administrator who was demoted after the session check", async () => {
    beforeNextBatch(() => setRole("admin2", "player"));
    const late = await block("ana", "admin2");
    expect([late.status, late.body]).toEqual([403, { error: "admin_only" }]);
    expect(user("ana").blocked).toBe(0);
    expect(db.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'ana'")[0].n).toBe(1);

    await block("bia");
    beforeNextBatch(() => setRole("admin3", "player"));
    const lateLift = await unblock("bia", "admin3");
    expect([lateLift.status, lateLift.body]).toEqual([403, { error: "admin_only" }]);
    expect(user("bia").blocked).toBe(1);
    expect(db.sql("SELECT lifted_at FROM account_blocks WHERE user_id = 'bia'")).toEqual([{ lifted_at: null }]);
    expect(audit().map((row) => row.action)).toEqual(["user.role_change", "user.block", "user.role_change"]);
  });

  it("never leaves a blocked administrator: a block and a promotion of the same account, in either order", async () => {
    // The block commits between the promotion's read and its write.
    beforeNextBatch(() => block("ana", "admin2"));
    const promotion = await setRole("ana", "admin");
    expect([promotion.status, promotion.body]).toEqual([409, { error: "account_blocked" }]);
    expect(user("ana")).toEqual({ role: "player", blocked: 1 });

    // The promotion commits between the block's read and its write.
    beforeNextBatch(() => setRole("bia", "admin", "admin2"));
    const late = await block("bia");
    expect([late.status, late.body]).toEqual([409, { error: "admin_account" }]);
    expect(user("bia")).toEqual({ role: "admin", blocked: 0 });
    expect(db.sql("SELECT user_id FROM account_blocks")).toEqual([{ user_id: "ana" }]);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'bia'")[0].n).toBe(1);
    expect(audit().map((row) => [row.action, row.subject])).toEqual([["user.block", "user:ana"], ["user.role_change", "user:bia"]]);
    // Lifting the block makes the promotion possible again.
    expect((await unblock("ana")).status).toBe(200);
    expect((await setRole("ana", "admin")).status).toBe(200);
  });

  it("restricts a session that a sign-in opened while the block was being recorded", async () => {
    // The block commits between the claim of the link and the batch that opens the session.
    const token = await linkToken("ana@example.test");
    beforeNextBatch(() => block("ana"));
    const verified = await call("POST", "/auth/verify", { token }, "", GAME);
    expect(verified.status).toBe(200);
    expect(verified.body.user.blocked).toMatchObject({ message: MESSAGE });
    const session = verified.headers.get("Set-Cookie")!.split(";")[0].split("=")[1];
    expect((await call("GET", "/progress", undefined, session, GAME)).body).toEqual({ error: "session_blocked" });
  });

  it("ends a session that a sign-in opened between the block's read and its write", async () => {
    const token = await linkToken("ana@example.test");
    let session = "";
    beforeNextBatch(async () => {
      const verified = await call("POST", "/auth/verify", { token }, "", GAME);
      expect(verified.body.user.blocked).toBeUndefined();
      session = verified.headers.get("Set-Cookie")!.split(";")[0].split("=")[1];
    });
    expect((await block("ana")).status).toBe(200);
    expect(session).not.toBe("");
    expect((await call("GET", "/me", undefined, session, GAME)).body).toEqual({ user: null });
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions WHERE user_id = 'ana'")[0].n).toBe(0);
  });

  it("lets an account erasure finish when the block lands in the middle of it", async () => {
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await block("ana"); });
    // The erasure's own session was read before the block ended it.
    expect((await call("DELETE", "/me", undefined, "ana", GAME)).status).toBe(204);
    expect(competing.status).toBe(200);
    expect(db.sql("SELECT id FROM users WHERE id = 'ana'")).toEqual([]);
    expect(db.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(audit().map((row) => row.action)).toEqual(["user.block", "user.delete"]);
  });

  it("answers 404 and writes nothing when the account was erased between the block's read and its write", async () => {
    beforeNextBatch(() => call("DELETE", "/me", undefined, "ana", GAME));
    const late = await block("ana");
    expect([late.status, late.body]).toEqual([404, { error: "not_found" }]);
    expect(db.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(audit().map((row) => row.action)).toEqual(["user.delete"]);
  });

  it("refuses in SQL an NGO application that was being sent when the block was recorded", async () => {
    beforeNextBatch(() => block("ana"));
    const late = await call("POST", "/ngo/application", { accountId: "ana", ...APPLICATION }, "ana", GAME);
    expect([late.status, late.body]).toEqual([403, { error: "session_blocked" }]);
    expect(db.sql("SELECT * FROM ngos")).toEqual([]);
    expect(db.sql("SELECT state, ngo_id FROM lots WHERE id = 'plaza-01'")).toEqual([{ state: "available", ngo_id: null }]);
    expect(audit().map((row) => row.action)).toEqual(["user.block"]);
  });

  it("refuses in SQL a resubmission that was being sent when the block was recorded", async () => {
    expect((await call("POST", "/ngo/application", { accountId: "ana", ...APPLICATION }, "ana", GAME)).status).toBe(201);
    await db.prepare("UPDATE ngos SET status = 'changes_requested'").run();
    beforeNextBatch(() => block("ana"));
    const late = await call("POST", "/ngo/application", { accountId: "ana", ...APPLICATION, summary: "Resumo novo enviado depois do bloqueio." }, "ana", GAME);
    expect([late.status, late.body]).toEqual([403, { error: "session_blocked" }]);
    expect(db.sql("SELECT status, revision, summary FROM ngos")).toEqual([{ status: "changes_requested", revision: 1, summary: APPLICATION.summary }]);
    expect(audit().map((row) => row.action)).toEqual(["ngo.submit", "user.block"]);
  });

  it("refuses in SQL progress that was being written when the block was recorded", async () => {
    beforeNextBatch(() => block("ana"));
    const late = await call("POST", "/progress/events", { accountId: "ana", events: EVENTS }, "ana", GAME);
    expect([late.status, late.body]).toEqual([403, { error: "session_blocked" }]);
    expect(db.sql("SELECT * FROM progress_events")).toEqual([]);
  });

  it("refuses in SQL a correction of name, nickname or city that was being sent when the block was recorded", async () => {
    const before = db.sql("SELECT name, nickname, nickname_key, city FROM users WHERE id = 'ana'");
    // The block commits after this request's session check and nickname check, right before its only write.
    beforeStatement(/^UPDATE users SET name/, () => block("ana"));
    const late = await call("POST", "/me", { name: "Another Name", nickname: "ana_again", city: "Natal" }, "ana", GAME);
    expect([late.status, late.body]).toEqual([403, { error: "session_blocked" }]);
    expect(late.headers.get("Cache-Control")).toBe("no-store");
    expect(db.sql("SELECT name, nickname, nickname_key, city FROM users WHERE id = 'ana'")).toEqual(before);
    expect(user("ana").blocked).toBe(1);
    // Without a block the same correction goes through, and nobody else's account is touched by it.
    const corrected = await call("POST", "/me", { name: "Another Name", nickname: "bia_again", city: "Natal" }, "bia", GAME);
    expect([corrected.status, corrected.body.user]).toEqual([200, expect.objectContaining({ id: "bia", name: "Another Name", nickname: "bia_again", city: "Natal" })]);
    expect(db.sql("SELECT nickname_key FROM users WHERE id = 'bia'")).toEqual([{ nickname_key: "bia_again" }]);
  });

  it("refuses in SQL the first progress of an account that was blocked before its write counter was created", async () => {
    beforeStatement(/INTO progress_writes/, () => block("ana"));
    const late = await call("POST", "/progress/events", { accountId: "ana", events: EVENTS }, "ana", GAME);
    expect([late.status, late.body]).toEqual([403, { error: "session_blocked" }]);
    expect(db.sql("SELECT * FROM progress_writes")).toEqual([]);
    expect(db.sql("SELECT * FROM progress_events")).toEqual([]);
  });

  it("refuses in SQL the removal of a file or of a gallery photo that was being sent when the block was recorded", async () => {
    const created = await call("POST", "/ngo/application", { accountId: "ana", ...APPLICATION }, "ana", GAME);
    const ngoId = created.body.application.id as string;
    const media = { "X-Vila-Account": "ana", "Content-Type": "image/png", "X-Vila-Caption": "" };
    const logo = await request("POST", "/ngo/application/files?kind=logo", "ana", GAME, media, png() as BodyInit);
    const photo = await request("POST", `/ngo/photos?ngoId=${ngoId}&position=0`, "ana", GAME, media, png() as BodyInit);
    expect([logo.status, photo.status]).toEqual([201, 201]);
    const stored = () => [db.sql("SELECT id FROM ngo_files"), db.sql("SELECT id, status, cleanup_pending FROM ngo_photos"), db.sql("SELECT revision FROM ngos"), bucket.keys()];
    const before = stored();
    expect(before[3]).toHaveLength(2);

    beforeNextBatch(() => block("ana"));
    const file = await request("DELETE", `/ngo/application/files/${logo.body.file.id}`, "ana", GAME, { "X-Vila-Account": "ana" });
    expect([file.status, file.body]).toEqual([403, { error: "session_blocked" }]);
    expect(stored()).toEqual(before);

    // The same for the gallery, with the session the block ended put back.
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex("ana"), "ana", "2099-01-01").run();
    await db.prepare("UPDATE users SET blocked = 0 WHERE id = 'ana'").run();
    beforeNextBatch(() => db.prepare("UPDATE users SET blocked = 1 WHERE id = 'ana'").run());
    const removal = await request("DELETE", `/ngo/photos/${photo.body.photo.id}`, "ana", GAME, { "X-Vila-Account": "ana" });
    expect([removal.status, removal.body]).toEqual([403, { error: "session_blocked" }]);
    expect(stored()).toEqual(before);
    expect(audit().map((row) => row.action)).toEqual(["ngo.submit", "ngo.file_add", "ngo.photo.upload", "user.block"]);
    // An administrator still removes the photo of a blocked applicant.
    const byAdmin = await call("POST", `/admin/ngo-photos/${photo.body.photo.id}/decision`, { accountId: "admin", action: "remove", revision: 1 }, "admin");
    expect([byAdmin.status, byAdmin.body.photo.status]).toEqual([200, "removed"]);
  });

  it("discards a logo and a gallery photo that were being uploaded when the block was recorded", async () => {
    const created = await call("POST", "/ngo/application", { accountId: "ana", ...APPLICATION }, "ana", GAME);
    const ngoId = created.body.application.id as string;
    const upload = (path: string) => request("POST", path, "ana", GAME, { "X-Vila-Account": "ana", "Content-Type": "image/png", "X-Vila-Caption": "" }, png() as BodyInit);

    beforeNextBytesPut(() => block("ana"));
    const logo = await upload("/ngo/application/files?kind=logo");
    expect([logo.status, logo.body.error]).toEqual([409, "application_changed"]);
    expect(db.sql("SELECT * FROM ngo_files")).toEqual([]);
    expect(db.sql("SELECT * FROM media_upload_intents")).toEqual([]);

    // The same for the gallery, with the session the block ended put back.
    await db.prepare("UPDATE users SET blocked = 0 WHERE id = 'ana'").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex("ana"), "ana", "2099-01-01").run();
    beforeNextBytesPut(() => db.prepare("UPDATE users SET blocked = 1 WHERE id = 'ana'").run());
    const photo = await upload(`/ngo/photos?ngoId=${ngoId}&position=0`);
    expect([photo.status, photo.body.error]).toEqual([409, "photo_limit_or_owner_changed"]);
    expect(db.sql("SELECT status, upload_pending FROM ngo_photos")).toEqual([{ status: "removed", upload_pending: 0 }]);
    expect(bucket.keys()).toEqual([]);
    expect(db.sql("SELECT revision FROM ngos")).toEqual([{ revision: 1 }]);
    expect(audit().map((row) => row.action)).toEqual(["ngo.submit", "user.block"]);
  });
});

describe("migration 0010", () => {
  it("upgrades a populated database without changing any existing record", async () => {
    const prior = createD1({ upTo: 9 });
    await seed(prior);
    const tables = ["users", "sessions", "login_tokens", "ngos", "lots", "audit_events", "progress_events"];
    const before = tables.map((table) => prior.sql(`SELECT * FROM ${table}`));
    prior.migrate("0010_account_blocks.sql");
    const after = tables.map((table) => prior.sql(`SELECT * FROM ${table}`));
    expect(after.slice(1)).toEqual(before.slice(1));
    expect(after[0]).toEqual(before[0].map((row) => ({ ...row, blocked: 0, moderation_token: null })));
    expect(prior.sql("SELECT * FROM account_blocks")).toEqual([]);
    expect(prior.sql("SELECT * FROM moderation_tickets")).toEqual([]);
  });

  // Every session read needs `users.blocked`: on an older database the signed-in routes follow the 503
  // schema_outdated convention (never a 500, never a weaker check), whatever the flags, and write nothing.
  it.each(["true", "false"])("answers 503 schema_outdated on every signed-in route of a v9 database (flags %s)", async (flag) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 9 }); await seed(db);
    env = { ...env, DB: db, ACCOUNT_BLOCK_ENABLED: flag, PRESENCE_MODERATION_ENABLED: flag, NGO_WITHDRAWAL_ENABLED: flag };
    await db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES(?, 'Exemplo', '11222333000181', 'published', 'ana', 'plaza-01')").bind(UUID).run();
    await db.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = 'plaza-01'").bind(UUID).run();
    // A sign-in link that was issued before the code was deployed over the older database.
    const linkToken = "t".repeat(43);
    await db.prepare("INSERT INTO login_tokens(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(linkToken), "ana", "2099-01-01").run();
    const tables = ["users", "sessions", "ngos", "lots", "audit_events", "progress_events", "login_tokens"];
    const before = tables.map((table) => db.sql(`SELECT * FROM ${table}`));
    const outdated: Array<[string, string, unknown?, string?]> = [
      ["POST", "/admin/users/ana/role", { accountId: "admin", role: "admin" }], ["POST", "/admin/users/ana/unblock", { accountId: "admin" }],
      ["POST", `/admin/ngos/${UUID}/logo/remove`, { accountId: "admin", revision: 1 }],
      ["GET", "/admin/users"], ["GET", "/admin/audit"], ["GET", "/admin/applications"],
      ["GET", "/me", undefined, "ana"], ["POST", "/me", { nickname: "ana_again" }, "ana"], ["DELETE", "/me", undefined, "ana"],
      ["GET", "/progress", undefined, "ana"], ["POST", "/progress/events", { accountId: "ana", events: EVENTS }, "ana"],
      ["GET", "/ngo/application", undefined, "ana"], ["POST", "/ngo/application", { accountId: "bia", ...APPLICATION }, "bia"],
      ["POST", "/auth/register", { name: "Nova Pessoa", nickname: "nova", city: "Natal", email: "nova@example.test" }, ""],
      // The link is not claimed and no session is opened; no link is sent that could not be used, whoever asks.
      ["POST", "/auth/verify", { token: linkToken }, ""], ["POST", "/auth/verify", { token: "u".repeat(43) }, ""], ["POST", "/auth/verify", { token: linkToken }, "bia"],
      ["POST", "/auth/link", { email: "ana@example.test" }, ""], ["POST", "/auth/link", { email: "nobody@example.test" }, ""], ["POST", "/auth/link", { email: "not an e-mail" }, ""],
      ...(flag === "true" ? [
        ["POST", "/admin/users/ana/block", { accountId: "admin", message: MESSAGE }], ["POST", "/admin/moderation/ticket", { accountId: "admin", room: 0, target: 1 }],
      ] as Array<[string, string, unknown]> : []),
    ];
    for (const [method, path, body, session] of outdated) {
      const answer = await call(method, path, body, session ?? "admin", path.startsWith("/auth/") ? GAME : DASH);
      expect([method, path, answer.status, answer.body]).toEqual([method, path, 503, { error: "schema_outdated" }]);
      expect(answer.headers.get("Cache-Control")).toBe("no-store");
    }
    if (flag === "false") for (const [path, body] of [["/admin/users/ana/block", { accountId: "admin", message: MESSAGE }], ["/admin/moderation/ticket", { accountId: "admin", room: 0, target: 1 }]] as const)
      expect([path, (await call("POST", path, body)).body]).toEqual([path, { error: "not_found" }]);
    expect(tables.map((table) => db.sql(`SELECT * FROM ${table}`))).toEqual(before);
    expect(db.sql("SELECT used_at FROM login_tokens")).toEqual([{ used_at: null }]);
    // What needs no session still answers: a signed-out visitor, signing out, and every public read.
    expect((await call("GET", "/me", undefined, "", GAME)).body).toEqual({ user: null });
    expect((await call("POST", "/auth/logout", {}, "", GAME)).status).toBe(204);
    for (const path of ["/health", "/config", "/lots", "/indicators", "/environment", `/ngos/${UUID}`]) expect([path, (await call("GET", path, undefined, "", null)).status]).toEqual([path, 200]);
    expect(logged).not.toHaveBeenCalled();
  });
});
