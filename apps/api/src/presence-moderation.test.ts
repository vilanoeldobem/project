/**
 * End-to-end API tests for removing a visitor from a room (IMPL-0021, PROPOSTA): the administrator's ticket and
 * the route the realtime server calls through its service binding. Real SQLite, real migrations (test/d1.mjs).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MAX_MESSAGE_BYTES, MAX_ROOMS } from "@vila/shared/net/protocol";

import { configuredVars, devVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";
import { randomToken, sha256Hex } from "./crypto";

const GAME = "https://play.example", DASH = "https://dash.example";
const START = new Date("2026-11-12T12:00:00.000Z");
let db: ReturnType<typeof createD1>, env: Env;

type Answer = { status: number; body: any; headers: Headers };
const send = async (method: string, path: string, headers: Record<string, string>, body?: string): Promise<Answer> => {
  const res = await handleApi(new Request(`https://api.example${path}`, { method, headers, body }), env);
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};
/** The administrator's game asks for a ticket (session cookie = the seeded account's name). */
const issue = (override: Record<string, unknown> = {}, session = "admin", origin: string | null = GAME) =>
  send("POST", "/admin/moderation/ticket", { "Content-Type": "application/json", ...(origin ? { Origin: origin } : {}), ...(session ? { Cookie: `__Host-vila_session=${session}` } : {}) },
    JSON.stringify({ accountId: session, room: 3, target: 7, ...override }));
/** The realtime server hands the ticket back: no cookie, no Origin. */
const consume = (ticket: unknown, override: Record<string, unknown> = {}, headers: Record<string, string> = {}) =>
  send("POST", "/moderation/consume", { "Content-Type": "application/json", ...headers }, JSON.stringify({ ticket, room: 3, target: 7, ...override }));
/** Exactly what the room sends through its service binding: its own hostname, JSON, no Origin, no cookie, no client address. */
const bindingRequest = (ticket: string, room = 3, target = 7) => new Request("https://api.internal/moderation/consume", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticket, room, target }),
});
const ticketOf = async (override: Record<string, unknown> = {}, session = "admin") => {
  const issued = await issue(override, session);
  expect(issued.status).toBe(200);
  return issued.body.ticket as string;
};
const audit = () => db.sql("SELECT actor, action, subject, detail FROM audit_events ORDER BY rowid");

/** The rate limiting binding as production declares it for this route: `LIMIT` requests per key in its window. */
const LIMIT = 60;
function budget() {
  const keys: string[] = [];
  return { keys, limit: async ({ key }: { key: string }) => { keys.push(key); return { success: keys.filter((used) => used === key).length <= LIMIT }; } };
}

function beforeNextBatch(competing: () => Promise<unknown>) {
  const original = db.batch.bind(db);
  db.batch = (async (statements: Parameters<typeof db.batch>[0]) => {
    db.batch = original;
    await competing();
    return original(statements);
  }) as typeof db.batch;
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(START);
  db = createD1();
  env = { DB: db, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: `${GAME},${DASH}`, PRESENCE_MODERATION_ENABLED: "true" };
  for (const [id, role] of [["admin", "admin"], ["admin2", "admin"], ["ana", "player"]]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, id, id, id, "Recife", `${id}@example.test`, role, "2026-01-01").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(id), id, "2099-01-01").run();
  }
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("moderation ticket (PROPOSTA, IMPL-0021)", () => {
  it("issues a random 32-character ticket that lives 30 seconds, stored hashed, with no audit row", async () => {
    const issued = await issue();
    expect(issued.status).toBe(200);
    expect(issued.headers.get("Cache-Control")).toBe("no-store");
    expect(Object.keys(issued.body).sort()).toEqual(["expiresAt", "ticket"]);
    expect(issued.body.ticket).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(issued.body.expiresAt).toBe("2026-11-12T12:00:30.000Z");
    expect(db.sql("SELECT * FROM moderation_tickets")).toEqual([{
      ticket_hash: await sha256Hex(issued.body.ticket), admin_id: "admin", room: 3, target: 7,
      created_at: START.toISOString(), expires_at: "2026-11-12T12:00:30.000Z", used_at: null, consume_token: null,
    }]);
    expect(JSON.stringify(db.sql("SELECT * FROM moderation_tickets"))).not.toContain(issued.body.ticket);
    expect(audit()).toEqual([]);
    expect((await issue()).body.ticket).not.toBe(issued.body.ticket);
    // The message the game sends on its open connection fits the protocol limit, whatever the connection id.
    expect(JSON.stringify(["m", Number.MAX_SAFE_INTEGER, issued.body.ticket]).length).toBeLessThanOrEqual(MAX_MESSAGE_BYTES);
  });

  it("requires the flag, enabled accounts, an administrator, the current account and an allowed origin", async () => {
    env.PRESENCE_MODERATION_ENABLED = "false";
    expect([(await issue()).status, (await issue()).body]).toEqual([404, { error: "not_found" }]);
    env.PRESENCE_MODERATION_ENABLED = "true"; env.ACCOUNTS_ENABLED = "false";
    expect((await issue()).body).toEqual({ error: "accounts_disabled" });
    env.ACCOUNTS_ENABLED = "true";
    expect((await issue({}, "")).status).toBe(401);
    expect((await issue({}, "ana")).body).toEqual({ error: "admin_only" });
    expect((await issue({ accountId: "admin2" })).body).toEqual({ error: "account_changed" });
    for (const origin of [null, `${GAME}.evil`]) expect((await issue({}, "admin", origin)).body).toEqual({ error: "forbidden_origin" });
    expect(db.sql("SELECT * FROM moderation_tickets")).toEqual([]);
  });

  it("validates the room and the target", async () => {
    for (const room of [-1, MAX_ROOMS, 1.5, "0", null, undefined, Number.MAX_SAFE_INTEGER])
      expect([String(room), (await issue({ room })).status, (await issue({ room })).body]).toEqual([String(room), 400, { error: "bad_room" }]);
    for (const target of [0, -1, 1.5, "7", null, undefined, 2 ** 53])
      expect([String(target), (await issue({ target })).status, (await issue({ target })).body]).toEqual([String(target), 400, { error: "bad_target" }]);
    for (const room of [0, MAX_ROOMS - 1]) expect((await issue({ room, target: Number.MAX_SAFE_INTEGER })).status).toBe(200);
    expect(db.sql("SELECT room, target FROM moderation_tickets ORDER BY room")).toEqual([{ room: 0, target: Number.MAX_SAFE_INTEGER }, { room: MAX_ROOMS - 1, target: Number.MAX_SAFE_INTEGER }]);
  });

  it("issues at most 10 tickets per administrator per minute, even in parallel", async () => {
    const burst = await Promise.all(Array.from({ length: 15 }, () => issue()));
    expect(burst.filter((answer) => answer.status === 200)).toHaveLength(10);
    expect(burst.filter((answer) => answer.status === 429).map((answer) => answer.body)).toEqual(Array(5).fill({ error: "too_many_requests" }));
    // Used tickets count too, and another administrator has their own budget.
    expect((await consume(burst.find((answer) => answer.status === 200)!.body.ticket)).status).toBe(200);
    expect((await issue()).status).toBe(429);
    expect((await issue({}, "admin2")).status).toBe(200);
    vi.setSystemTime(START.getTime() + 59_999);
    expect((await issue()).status).toBe(429);
    vi.setSystemTime(START.getTime() + 60_000);
    expect((await issue()).status).toBe(200);
    // Issuing sweeps what is older than the window, for every administrator.
    expect(db.sql("SELECT admin_id, created_at FROM moderation_tickets")).toEqual([{ admin_id: "admin", created_at: "2026-11-12T12:01:00.000Z" }]);
  });

  it("ships switched off: production and staging say \"false\", the local dev script turns it on", () => {
    expect(configuredVars("PRESENCE_MODERATION_ENABLED")).toEqual(["false", "false"]);
    expect(devVar("PRESENCE_MODERATION_ENABLED")).toBe("true");
  });

  it("tells the apps in /config whether presence moderation is on, and only with accounts on", async () => {
    const config = async () => (await send("GET", "/config", {})).body.moderation;
    expect(await config()).toEqual({ presence: true, block: false });
    env.PRESENCE_MODERATION_ENABLED = "false"; expect(await config()).toEqual({ presence: false, block: false });
    env.PRESENCE_MODERATION_ENABLED = "true"; env.ACCOUNT_BLOCK_ENABLED = "true"; expect(await config()).toEqual({ presence: true, block: true });
    env.ACCOUNTS_ENABLED = "false"; expect(await config()).toEqual({ presence: false, block: false });
  });
});

describe("POST /moderation/consume (realtime server, service binding)", () => {
  it("accepts the ticket once, without session or Origin, and writes the audit row", async () => {
    const ticket = await ticketOf();
    const consumed = await consume(ticket);
    expect([consumed.status, consumed.body]).toEqual([200, { ok: true }]);
    expect(consumed.headers.get("Cache-Control")).toBe("no-store");
    expect(audit()).toEqual([{ actor: "admin", action: "presence.remove", subject: "room:3", detail: JSON.stringify({ target: 7 }) }]);
    expect(JSON.stringify(db.sql("SELECT * FROM audit_events"))).not.toContain(ticket);
    expect(JSON.stringify(db.sql("SELECT * FROM audit_events"))).not.toContain(await sha256Hex(ticket));
    expect(db.sql("SELECT used_at FROM moderation_tickets")).toEqual([{ used_at: START.toISOString() }]);

    const again = await consume(ticket);
    expect([again.status, again.body]).toEqual([404, { error: "not_found" }]);
    expect(audit()).toHaveLength(1);
  });

  it("answers the room's binding call with exactly {\"ok\":true} and 200, and anything else with a non-200", async () => {
    // The room compares the parsed body strictly: an extra field would read as "not removed".
    const [first, second, third] = [await ticketOf(), await ticketOf({ target: 8 }), await ticketOf({ target: 9 })];
    const call = bindingRequest(first);
    expect([...call.headers.keys()]).toEqual(["content-type"]);
    const accepted = await handleApi(call, env);
    expect(accepted.status).toBe(200);
    expect(await accepted.text()).toBe('{"ok":true}');
    // Without an Origin it is not caught by the origin rule of the signed-in routes, on any hostname.
    env.ALLOWED_ORIGINS = ""; env.ACCOUNT_ORIGINS = "";
    const again = await handleApi(bindingRequest(second, 3, 8), env);
    expect([again.status, await again.text()]).toEqual([200, '{"ok":true}']);
    for (const refused of [bindingRequest("A".repeat(32)), bindingRequest(third, 4, 9)]) {
      const answer = await handleApi(refused, env);
      expect([answer.status, await answer.json()]).toEqual([404, { error: "not_found" }]);
    }
    expect(audit().map((row) => row.detail)).toEqual(['{"target":7}', '{"target":8}']);
  });

  it("refuses an expired ticket", async () => {
    const [fresh, expired] = [await ticketOf(), await ticketOf()];
    vi.setSystemTime(START.getTime() + 29_999);
    expect((await consume(fresh)).status).toBe(200);
    vi.setSystemTime(START.getTime() + 30_000);
    expect((await consume(expired)).body).toEqual({ error: "not_found" });
    expect(audit()).toHaveLength(1);
    expect(db.sql("SELECT COUNT(*) AS n FROM moderation_tickets WHERE used_at IS NULL")[0].n).toBe(1);
  });

  it("binds the ticket to its room and its target, and answers one 404 for everything else", async () => {
    const ticket = await ticketOf();
    const wrong: Array<[unknown, Record<string, unknown>]> = [
      [ticket, { room: 4 }], [ticket, { target: 8 }], [ticket, { room: 7, target: 3 }],
      [ticket, { room: "3" }], [ticket, { target: "7" }], [ticket, { room: -1 }], [ticket, { room: MAX_ROOMS }], [ticket, { target: 0 }], [ticket, { target: 1.5 }],
      ["A".repeat(32), {}], [ticket.slice(1), {}], [`${ticket}A`, {}], [`${ticket.slice(1)}!`, {}], ["", {}], [null, {}], [42, {}], [undefined, {}],
      [await sha256Hex(ticket), {}],
    ];
    for (const [value, override] of wrong) {
      const answer = await consume(value, override);
      expect([String(value).slice(0, 8), override, answer.status, answer.body]).toEqual([String(value).slice(0, 8), override, 404, { error: "not_found" }]);
    }
    expect(audit()).toEqual([]);
    // None of that used the ticket up.
    expect((await consume(ticket)).status).toBe(200);
  });

  it("refuses the ticket of an administrator who was demoted, blocked or erased after asking for it", async () => {
    const [demoted, blocked, erased] = [await ticketOf(), await ticketOf({}, "admin2"), await ticketOf({ target: 9 }, "admin2")];
    await db.prepare("UPDATE users SET role = 'player' WHERE id = 'admin'").run();
    expect((await consume(demoted)).body).toEqual({ error: "not_found" });
    await db.prepare("UPDATE users SET blocked = 1 WHERE id = 'admin2'").run();
    expect((await consume(blocked)).body).toEqual({ error: "not_found" });
    await db.prepare("DELETE FROM users WHERE id = 'admin2'").run();
    expect((await consume(erased, { target: 9 })).body).toEqual({ error: "not_found" });
    expect(audit()).toEqual([]);
    // Being an administrator again makes a still-valid ticket usable: the check is made when it is consumed.
    await db.prepare("UPDATE users SET role = 'admin' WHERE id = 'admin'").run();
    expect((await consume(demoted)).status).toBe(200);
  });

  it("lets exactly one of two concurrent consumes win, with one audit row", async () => {
    const ticket = await ticketOf();
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await consume(ticket); });
    const late = await consume(ticket);
    expect([competing.status, late.status, late.body]).toEqual([200, 404, { error: "not_found" }]);
    expect(audit()).toEqual([{ actor: "admin", action: "presence.remove", subject: "room:3", detail: JSON.stringify({ target: 7 }) }]);
  });

  it("rolls the ticket back when the audit row cannot be written", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const ticket = await ticketOf();
    await db.exec("CREATE TRIGGER fail_remove BEFORE INSERT ON audit_events WHEN NEW.action='presence.remove' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    expect((await consume(ticket)).status).toBe(500);
    expect(db.sql("SELECT used_at FROM moderation_tickets")).toEqual([{ used_at: null }]);
    expect(logged.mock.calls.flat().join(" ")).not.toContain(ticket);
  });

  it("sends no CORS header, whatever the Origin and the answer", async () => {
    const ticket = await ticketOf();
    const origins = [GAME, DASH, "https://evil.example", "null", undefined];
    const noCors = (answer: Answer) => expect([...answer.headers.keys()].filter((name) => /^access-control-|^vary$/i.test(name))).toEqual([]);
    for (const origin of origins) {
      const headers: Record<string, string> = origin ? { Origin: origin } : {};
      const preflight = await send("OPTIONS", "/moderation/consume", { ...headers, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type" });
      expect(preflight.status).toBe(204); noCors(preflight);
      noCors(await consume("A".repeat(32), {}, headers));
      noCors(await send("GET", "/moderation/consume", headers));
      noCors(await send("POST", "/moderation/consume", { ...headers, "Content-Type": "text/plain" }, "{}"));
    }
    const consumed = await consume(ticket, {}, { Origin: GAME, Cookie: "__Host-vila_session=admin" });
    expect(consumed.status).toBe(200); noCors(consumed);
    // The same Worker still answers its browser routes with CORS for an allowed origin.
    expect((await send("GET", "/config", { Origin: GAME })).headers.get("Access-Control-Allow-Origin")).toBe(GAME);
  });

  it("answers 404 with the flag or the accounts off, and takes only a small JSON POST", async () => {
    const ticket = await ticketOf();
    env.PRESENCE_MODERATION_ENABLED = "false";
    expect([(await consume(ticket)).status, (await consume(ticket)).body]).toEqual([404, { error: "not_found" }]);
    env.PRESENCE_MODERATION_ENABLED = "true"; env.ACCOUNTS_ENABLED = "false";
    expect((await consume(ticket)).body).toEqual({ error: "not_found" });
    env.ACCOUNTS_ENABLED = "true";
    for (const method of ["GET", "HEAD", "DELETE", "PUT"]) {
      const answer = await send(method, "/moderation/consume", {});
      expect([method, answer.status, answer.headers.get("Allow")]).toEqual([method, 405, "POST"]);
    }
    expect((await send("POST", "/moderation/consume", { "Content-Type": "text/plain" }, JSON.stringify({ ticket, room: 3, target: 7 }))).body).toEqual({ error: "json_required" });
    expect((await send("POST", "/moderation/consume", { "Content-Type": "application/json" }, "[]")).body).toEqual({ error: "bad_json" });
    expect((await consume(ticket, { padding: "x".repeat(2000) })).body).toEqual({ error: "too_large" });
    env.DB = undefined;
    expect([(await consume(ticket)).status, (await consume(ticket)).body]).toEqual([503, { error: "db_unavailable" }]);
    env.DB = db;
    expect(audit()).toEqual([]);
    expect((await consume(ticket)).status).toBe(200);
  });

  it("is rate limited by caller address, or by room for a binding call that has none, and never fails for lack of one", async () => {
    const keys: string[] = [];
    let refuse = "";
    env.MODERATION_LIMITER = { limit: async ({ key }) => { keys.push(key); return { success: key !== refuse }; } };
    const ticket = await ticketOf();
    expect((await consume("A".repeat(32), {}, { "CF-Connecting-IP": "203.0.113.9" })).status).toBe(404);
    // No client address through the binding: the key is the room, so a busy room does not use up another's budget.
    refuse = "room:3";
    const limited = await handleApi(bindingRequest(ticket), env);
    expect([limited.status, await limited.json()]).toEqual([429, { error: "too_many_requests" }]);
    const other = await handleApi(bindingRequest(await ticketOf({ room: 5 }), 5), env);
    expect(other.status).toBe(200);
    // Through the binding, what is not a ticket somebody issued answers the single 404 and is charged to nobody.
    expect((await consume(ticket, { room: "x" })).body).toEqual({ error: "not_found" });
    expect((await consume("A".repeat(32))).body).toEqual({ error: "not_found" });
    expect(keys).toEqual(["203.0.113.9", "room:3", "room:5"]);
    expect(audit().map((row) => row.subject)).toEqual(["room:5"]);
    refuse = "";
    expect((await consume(ticket)).status).toBe(200);
    expect(configuredVars("namespace_id")).toEqual(["1101", "1102", "1103"]);
    // Without the binding (tests, staging) nothing is limited and nothing fails.
    env.MODERATION_LIMITER = undefined;
    expect((await handleApi(bindingRequest("A".repeat(32)), env)).status).toBe(404);
  });

  it("does not let visitors' made-up tickets use up the budget of a room: a real ticket is still consumed", async () => {
    const limiter = budget();
    env.MODERATION_LIMITER = limiter;
    // Any connection of the room can make it forward a well-formed ticket nobody issued (one per second each).
    for (let i = 0; i < LIMIT + 5; i++) {
      const junk = await handleApi(bindingRequest(randomToken(24)), env);
      expect([i, junk.status, await junk.text()]).toEqual([i, 404, '{"error":"not_found"}']);
    }
    expect(limiter.keys).toEqual([]);
    const real = await handleApi(bindingRequest(await ticketOf()), env);
    expect([real.status, await real.text()]).toEqual([200, '{"ok":true}']);
    expect(limiter.keys).toEqual(["room:3"]);
    expect(audit()).toEqual([{ actor: "admin", action: "presence.remove", subject: "room:3", detail: JSON.stringify({ target: 7 }) }]);
  });

  it("still limits a flood that names an issued ticket through the binding, room by room", async () => {
    const limiter = budget();
    env.MODERATION_LIMITER = limiter;
    const [ticket, elsewhere] = [await ticketOf(), await ticketOf({ room: 5 })];
    // The right ticket for the wrong target is never consumed, and every attempt is charged to the room that sent it.
    for (let i = 0; i < LIMIT; i++) expect([i, (await handleApi(bindingRequest(ticket, 3, 8), env)).status]).toEqual([i, 404]);
    const limited = await handleApi(bindingRequest(ticket), env);
    expect([limited.status, await limited.json()]).toEqual([429, { error: "too_many_requests" }]);
    expect(limiter.keys).toEqual(Array(LIMIT + 1).fill("room:3"));
    expect(db.sql("SELECT COUNT(*) AS n FROM moderation_tickets WHERE used_at IS NOT NULL")[0].n).toBe(0);
    expect((await handleApi(bindingRequest(elsewhere, 5), env)).status).toBe(200);
    expect(audit().map((row) => row.subject)).toEqual(["room:5"]);
  });

  it("charges a caller that has an address before looking at the ticket, whatever it sent", async () => {
    const limiter = budget();
    env.MODERATION_LIMITER = limiter;
    const address = { "CF-Connecting-IP": "203.0.113.9" };
    const ticket = await ticketOf();
    for (let i = 0; i < LIMIT; i++) expect([i, (await consume(i % 2 ? randomToken(24) : "malformed", {}, address)).status]).toEqual([i, 404]);
    const limited = await consume(ticket, {}, address);
    expect([limited.status, limited.body]).toEqual([429, { error: "too_many_requests" }]);
    expect(limiter.keys).toEqual(Array(LIMIT + 1).fill("203.0.113.9"));
    expect(audit()).toEqual([]);
    // Another address, and the room itself through the binding, are not held back by that one.
    expect((await consume(ticket, { target: 8 }, { "CF-Connecting-IP": "203.0.113.10" })).status).toBe(404);
    expect((await handleApi(bindingRequest(ticket), env)).status).toBe(200);
  });

  it("answers every miss with the same 404, charged or not", async () => {
    env.MODERATION_LIMITER = budget();
    const [ticket, used] = [await ticketOf(), await ticketOf({ target: 9 })];
    expect((await handleApi(bindingRequest(used, 3, 9), env)).status).toBe(200);
    const seen = async (request: Request) => {
      const answer = await handleApi(request, env);
      return { status: answer.status, headers: [...answer.headers].sort(), body: await answer.text() };
    };
    const unknown = await seen(bindingRequest(randomToken(24)));
    expect(unknown).toEqual({ status: 404, headers: expect.any(Array), body: '{"error":"not_found"}' });
    const misses = [bindingRequest(ticket, 4), bindingRequest(ticket, 3, 8), bindingRequest(used, 3, 9), bindingRequest("malformed"), bindingRequest(ticket, MAX_ROOMS), bindingRequest(ticket, 3, 0)];
    for (const miss of misses) expect(await seen(miss)).toEqual(unknown);
    vi.setSystemTime(START.getTime() + 30_000);
    expect(await seen(bindingRequest(ticket))).toEqual(unknown);
    expect(audit()).toHaveLength(1);
  });

  it("answers 503 schema_outdated on a database without migration 0010, never 500", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    env.DB = createD1({ upTo: 9 });
    const answer = await consume("A".repeat(32));
    expect([answer.status, answer.body]).toEqual([503, { error: "schema_outdated" }]);
    expect(answer.headers.get("Cache-Control")).toBe("no-store");
    env.PRESENCE_MODERATION_ENABLED = "false";
    expect((await consume("A".repeat(32))).status).toBe(404);
    expect(logged).not.toHaveBeenCalled();
  });
});
