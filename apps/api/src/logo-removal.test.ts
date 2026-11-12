/**
 * End-to-end API tests for the administrator's removal of an NGO logo (IMPL-0021), on real SQLite with the real
 * migrations and an in-memory R2 stand-in. Seeded accounts use their name as id and as session token.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createD1 } from "../test/d1.mjs";
import { createR2 } from "../test/r2.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

const NGO = "a0000000-0000-4000-8000-000000000001", OTHER_NGO = "a0000000-0000-4000-8000-000000000002";
const LOGO = "c0000000-0000-4000-8000-000000000001", DOCUMENT = "c0000000-0000-4000-8000-000000000002";
const LOGO_KEY = `ngo/${NGO}/${LOGO}`, DOCUMENT_KEY = `ngo/${NGO}/${DOCUMENT}`;
const GAME = "https://play.example";
let db: ReturnType<typeof createD1>, env: Env, bucket: ReturnType<typeof createR2>;

type Answer = { status: number; body: any; headers: Headers };
const call = async (method: string, path: string, body?: unknown, session = "admin", origin: string | null = GAME, headers: Record<string, string> = {}): Promise<Answer> => {
  const res = await handleApi(new Request(`https://api.example${path}`, {
    method, body: body === undefined ? undefined : JSON.stringify(body),
    headers: { ...(origin ? { Origin: origin } : {}), ...(session ? { Cookie: `__Host-vila_session=${session}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }), ...headers },
  }), env);
  const text = res.headers.get("Content-Type")?.startsWith("application/json") ? await res.text() : "";
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
};
const removeLogo = (override: Record<string, unknown> = {}, session = "admin", ngo = NGO) =>
  call("POST", `/admin/ngos/${ngo}/logo/remove`, { accountId: session, revision: 1, ...override }, session);
const audit = () => db.sql("SELECT actor, action, subject, detail FROM audit_events ORDER BY rowid");
const files = () => db.sql("SELECT id, kind FROM ngo_files ORDER BY id");

function beforeNextBatch(competing: () => Promise<unknown>) {
  const original = db.batch.bind(db);
  db.batch = (async (statements: Parameters<typeof db.batch>[0]) => {
    db.batch = original;
    await competing();
    return original(statements);
  }) as typeof db.batch;
}

beforeEach(async () => {
  db = createD1(); bucket = createR2();
  env = { DB: db, FILES: bucket, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: GAME, NGO_FILES_ENABLED: "true", NGO_WITHDRAWAL_ENABLED: "true" };
  for (const id of ["owner", "admin", "admin2"]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, id, id, id, "Recife", `${id}@example.test`, id.startsWith("admin") ? "admin" : "player", "2026-01-01").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(id), id, "2099-01-01").run();
  }
  await db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES(?, 'Exemplo', '11222333000181', 'published', 'owner', 'plaza-01')").bind(NGO).run();
  await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
  await db.prepare("INSERT INTO ngo_files(id,ngo_id,kind,content_type,size,uploaded_by,created_at) VALUES(?,?,'logo','image/png',1,'owner','2026-01-01'),(?,?,'document','application/pdf',1,'owner','2026-01-02')").bind(LOGO, NGO, DOCUMENT, NGO).run();
  for (const key of [LOGO_KEY, DOCUMENT_KEY]) await bucket.put(key, new Uint8Array([1]));
});
afterEach(() => { vi.restoreAllMocks(); });

describe("administrator removes an NGO logo (IMPL-0021)", () => {
  it("takes a published logo out of the village: row, object and public projections, audited", async () => {
    expect((await call("GET", `/ngos/${NGO}/logo`, undefined, "", null)).status).toBe(200);
    const removed = await removeLogo();
    expect(removed.status).toBe(200);
    expect(removed.headers.get("Cache-Control")).toBe("no-store");
    expect(removed.body.application).toMatchObject({ id: NGO, status: "published", revision: 2 });
    expect(files()).toEqual([{ id: DOCUMENT, kind: "document" }]);
    expect(bucket.keys()).toEqual([DOCUMENT_KEY]);
    expect(db.sql("SELECT * FROM media_upload_intents")).toEqual([]);
    expect(audit()).toEqual([{ actor: "admin", action: "ngo.logo_remove", subject: `ngo:${NGO}`, detail: JSON.stringify({ file: LOGO, revision: 2 }) }]);
    expect((await call("GET", `/ngos/${NGO}/logo`, undefined, "", null)).status).toBe(404);
    const lots = await call("GET", "/lots", undefined, "", null);
    expect(lots.body.lots.find((lot: { id: string }) => lot.id === "plaza-01")).toMatchObject({ ngo_id: NGO, ngo_logo: null });
    // The NGO itself stays published, and the applicant sees the new revision without the logo.
    expect((await call("GET", `/ngos/${NGO}`, undefined, "", null)).status).toBe(200);
    expect((await call("GET", "/ngo/application", undefined, "owner")).body).toMatchObject({ application: { revision: 2 }, files: [{ id: DOCUMENT }] });
  });

  it.each(["submitted", "under_review", "changes_requested", "rejected", "published"])("removes the logo of an application in %s", async (status) => {
    await db.prepare("UPDATE ngos SET status = ? WHERE id = ?").bind(status, NGO).run();
    expect((await removeLogo()).body.application).toMatchObject({ status, revision: 2 });
    expect(files()).toEqual([{ id: DOCUMENT, kind: "document" }]);
    expect(bucket.keys()).toEqual([DOCUMENT_KEY]);
  });

  it("removes the logo of a withdrawn NGO, and with the upload flag off", async () => {
    expect((await call("POST", `/admin/ngos/${NGO}/withdraw`, { accountId: "admin", revision: 1, reason: "Message to the organisation." })).status).toBe(200);
    env.NGO_FILES_ENABLED = "false";
    expect((await removeLogo({ revision: 2 })).body.application).toMatchObject({ status: "withdrawn", revision: 3 });
    expect(bucket.keys()).toEqual([DOCUMENT_KEY]);
    expect(audit().map((row) => row.action)).toEqual(["ngo.withdraw", "ngo.logo_remove"]);
  });

  it("requires an administrator, the current account, an allowed origin and enabled accounts", async () => {
    expect((await removeLogo({}, "")).status).toBe(401);
    expect((await removeLogo({}, "owner")).body).toEqual({ error: "admin_only" });
    expect((await removeLogo({ accountId: "admin2" })).body).toEqual({ error: "account_changed" });
    for (const origin of [null, `${GAME}.evil`]) expect((await call("POST", `/admin/ngos/${NGO}/logo/remove`, { accountId: "admin", revision: 1 }, "admin", origin)).body).toEqual({ error: "forbidden_origin" });
    env.ACCOUNTS_ENABLED = "false";
    expect((await removeLogo()).body).toEqual({ error: "accounts_disabled" });
    expect(files()).toHaveLength(2); expect(bucket.keys()).toEqual([LOGO_KEY, DOCUMENT_KEY].sort()); expect(audit()).toEqual([]);
  });

  it("refuses a bad id, a missing logo, a missing or stale revision, one's own organisation and a pending erasure", async () => {
    for (const id of ["not-an-id", OTHER_NGO]) {
      const missing = await removeLogo({}, "admin", id);
      expect([id, missing.status, missing.body]).toEqual([id, 404, { error: "not_found" }]);
    }
    for (const revision of [undefined, null, "1", 0, 1.5]) expect([String(revision), (await removeLogo({ revision })).body]).toEqual([String(revision), { error: "revision_required" }]);
    const stale = await removeLogo({ revision: 2 });
    expect([stale.status, stale.body]).toEqual([409, { error: "stale_revision" }]);
    await db.prepare("UPDATE users SET role = 'admin' WHERE id = 'owner'").run();
    const own = await removeLogo({}, "owner");
    expect([own.status, own.body]).toEqual([403, { error: "self_review" }]);
    await db.prepare("UPDATE users SET files_deleting = 1 WHERE id = 'owner'").run();
    const erasing = await removeLogo();
    expect([erasing.status, erasing.body]).toEqual([409, { error: "account_deleting" }]);
    expect(files()).toHaveLength(2); expect(bucket.keys()).toEqual([LOGO_KEY, DOCUMENT_KEY].sort()); expect(audit()).toEqual([]);

    await db.prepare("UPDATE users SET files_deleting = 0 WHERE id = 'owner'").run();
    expect((await removeLogo()).status).toBe(200);
    const gone = await removeLogo({ revision: 2 });
    expect([gone.status, gone.body]).toEqual([404, { error: "not_found" }]);
    expect(audit()).toHaveLength(1);
  });

  it("answers 503 without the files bucket and changes nothing", async () => {
    env.FILES = undefined;
    const answer = await removeLogo();
    expect([answer.status, answer.body]).toEqual([503, { error: "files_unavailable" }]);
    expect(files()).toHaveLength(2); expect(db.sql("SELECT revision FROM ngos")[0].revision).toBe(1); expect(audit()).toEqual([]);
  });

  it("lets exactly one of two concurrent removals win, with one audit row", async () => {
    let competing!: Answer;
    beforeNextBatch(async () => { competing = await removeLogo({}, "admin2"); });
    const late = await removeLogo();
    expect([competing.status, late.status, late.body]).toEqual([200, 409, { error: "stale_revision" }]);
    expect(db.sql("SELECT revision FROM ngos")[0].revision).toBe(2);
    expect(audit().map((row) => [row.actor, row.action])).toEqual([["admin2", "ngo.logo_remove"]]);
    expect(db.sql("SELECT * FROM media_upload_intents")).toEqual([]);
  });

  it("refuses in SQL a removal whose read is older than the start of the owner's account erasure", async () => {
    beforeNextBatch(() => db.prepare("UPDATE users SET files_deleting = 1 WHERE id = 'owner'").run());
    const late = await removeLogo();
    expect([late.status, late.body]).toEqual([409, { error: "account_deleting" }]);
    expect(files()).toHaveLength(2); expect(bucket.keys()).toEqual([LOGO_KEY, DOCUMENT_KEY].sort()); expect(audit()).toEqual([]);
  });

  it("makes a review opened on the previous revision stale", async () => {
    await db.prepare("UPDATE ngos SET status = 'submitted' WHERE id = ?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state = 'application_sent' WHERE ngo_id = ?").bind(NGO).run();
    expect((await removeLogo()).status).toBe(200);
    const decision = await call("POST", `/admin/applications/${NGO}/decision`, { action: "approve", revision: 1, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true } }, "admin2");
    expect([decision.status, decision.body]).toEqual([409, { error: "stale_revision" }]);
  });

  it("keeps the removal and a retryable cleanup when R2 fails to delete the object", async () => {
    bucket.failNext("delete");
    const answer = await removeLogo();
    expect([answer.status, answer.body]).toEqual([503, { error: "file_cleanup_pending" }]);
    // The logo is already out of every projection; the bytes wait for the recovery route.
    expect(files()).toEqual([{ id: DOCUMENT, kind: "document" }]);
    expect((await call("GET", `/ngos/${NGO}/logo`, undefined, "", null)).status).toBe(404);
    expect(db.sql("SELECT id, cleanup_pending FROM media_upload_intents")).toEqual([{ id: LOGO, cleanup_pending: 1 }]);
    expect(audit().map((row) => row.action)).toEqual(["ngo.logo_remove"]);
    const recovered = await call("POST", `/admin/applications/${NGO}/files/recover`, undefined, "admin", GAME, { "X-Vila-Account": "admin" });
    expect(recovered.body).toEqual({ cleaned: 1, remaining: 0 });
    expect(bucket.keys()).toEqual([DOCUMENT_KEY]);
  });
});
