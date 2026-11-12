import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

const NGO = "a0000000-0000-4000-8000-000000000001", OTHER_NGO = "a0000000-0000-4000-8000-000000000002";
const PHOTO = "b0000000-0000-4000-8000-000000000001", DOCUMENT = "c0000000-0000-4000-8000-000000000001";
const ORIGIN = "https://dash.example", REASON = "PRIVATE withdrawal explanation";
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
const APPLICATION = { name: "Associação Exemplo", cnpj: "11222333000181", openedOn: "2020-01-01", city: "Recife",
  declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true }, fundsConfirmation: "Extratos e relatórios conciliáveis da organização.",
  summary: "Apoio escolar às crianças da comunidade.", description: "Atendemos crianças com atividades educativas e culturais na comunidade.", tags: ["education"], projects: [], lotId: "plaza-01" };
let db: ReturnType<typeof createD1>, env: Env, objects: Map<string, Uint8Array>;
let bucket: { put: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; head: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
const call = (method: string, path: string, body?: unknown, user = "admin", origin: string | null = ORIGIN) => handleApi(new Request(`https://api.example${path}`, {
  method, headers: { ...(origin ? { Origin: origin } : {}), ...(user ? { Cookie: `__Host-vila_session=${user}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env);
const withdraw = (override: Record<string, unknown> = {}, user = "admin") => call("POST", `/admin/ngos/${NGO}/withdraw`, {
  accountId: user, revision: 1, reason: REASON, ...override,
}, user);
const publicGet = (path: string, method = "GET") => call(method, path, undefined, "", null);
const photoDecision = (action = "approve", revision = 1) => call("POST", `/admin/ngo-photos/${PHOTO}/decision`, { accountId: "admin", action, revision });
function pauseNextBatch() {
  const original = db.batch.bind(db);
  let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  db.batch = (async (statements: Parameters<typeof db.batch>[0]) => {
    db.batch = original; entered(); await blocked; return original(statements);
  }) as typeof db.batch;
  return { ready, release };
}

beforeEach(async () => {
  db = createD1(); objects = new Map([["photo-key", new Uint8Array([1])], ["document-key", new Uint8Array([2])]]);
  bucket = {
    put: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes.slice()); }),
    get: vi.fn(async (key: string) => { const bytes = objects.get(key); return bytes ? { body: bytes.slice(), size: bytes.length } : null; }),
    head: vi.fn(async (key: string) => objects.has(key) ? { key } : null),
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
  };
  env = { DB: db, ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: ORIGIN, NGO_WITHDRAWAL_ENABLED: "true",
    NGO_PHOTOS_ENABLED: "true", NGO_DOCUMENTS_ENABLED: "true", NGO_PHOTOS: bucket as unknown as R2Bucket, NGO_DOCUMENTS: bucket as unknown as R2Bucket };
  for (const user of ["owner", "other", "admin", "admin2"]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(user, user, user, user, "Recife", `${user}@example.test`, user.startsWith("admin") ? "admin" : "player", "2026-01-01").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(user), user, "2099-01-01").run();
  }
  await db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id,review_note) VALUES(?, 'Exemplo', '11222333000181', 'published', 'owner', 'plaza-01','Original review')").bind(NGO).run();
  await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
  await db.prepare("INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position,status) VALUES(?,?,'photo-key','image/png',1,'Public caption',0,'approved')").bind(PHOTO, NGO).run();
  await db.prepare("INSERT INTO ngo_documents(id,ngo_id,object_key,label,content_type,byte_size,added_revision,created_at) VALUES(?,?,'document-key','PRIVATE evidence','application/pdf',1,1,'2026-01-01')").bind(DOCUMENT, NGO).run();
  await db.prepare("INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','explore','plaza')").run();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("administrative NGO withdrawal", () => {
  it("releases the lot and hides public content while preserving private evidence, review and progress", async () => {
    const progress = db.sql("SELECT * FROM progress_events"), photo = db.sql("SELECT * FROM ngo_photos"), document = db.sql("SELECT * FROM ngo_documents");
    expect((await publicGet(`/ngos/${NGO}`)).status).toBe(200);
    const response = await withdraw({ reason: `  ${REASON}  ` });
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = await response.json() as Record<string, unknown>;
    expect(result).toMatchObject({ application: { status: "withdrawn", revision: 2, reviewNote: "Original review", withdrawal: { reason: REASON, at: expect.any(String) } } });
    expect(db.sql("SELECT status,revision,review_note FROM ngos WHERE id=?", NGO)[0]).toEqual({ status: "published", revision: 2, review_note: "Original review" });
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")[0]).toEqual({ state: "available", ngo_id: null });
    expect(db.sql("SELECT * FROM progress_events")).toEqual(progress);
    expect(db.sql("SELECT * FROM ngo_photos")).toEqual(photo); expect(db.sql("SELECT * FROM ngo_documents")).toEqual(document);
    const audit = db.sql("SELECT actor,action,detail FROM audit_events"); expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: "admin", action: "ngo.withdraw" });
    expect(JSON.parse(audit[0].detail as string)).toEqual({ from: "published", to: "withdrawn", revision: 2, lots: ["plaza-01"], hasReason: true });
    expect(audit[0].detail).not.toContain(REASON); expect(bucket.delete).not.toHaveBeenCalled();
    expect(await (await call("GET", "/ngo/application", undefined, "owner")).json()).toMatchObject(result);
    expect(await (await call("GET", `/admin/applications/${NGO}`)).json()).toMatchObject(result);
    expect(await (await call("GET", "/admin/applications?status=withdrawn")).json()).toMatchObject({ applications: [{ id: NGO, status: "withdrawn" }] });
    expect(await (await call("GET", "/admin/applications?status=published")).json()).toEqual({ applications: [] });
    for (const path of [`/ngos/${NGO}`, `/ngos/${NGO}/photos/${PHOTO}`]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await publicGet(path, method); expect(res.status).toBe(404); expect(res.headers.get("Cache-Control")).toBe("no-store");
      }
    }
    const lots = await (await publicGet("/lots")).json() as { lots: Record<string, unknown>[] };
    expect(lots.lots.find((lot) => lot.id === "plaza-01")).toMatchObject({ state: "available", ngo_id: null, ngo_name: null, ngo_summary: null });
    const indicators = await (await publicGet("/indicators")).json() as { indicators: Record<string, unknown>[] };
    expect(indicators.indicators.find((item) => item.key === "approved_ngos")?.value).toBe(0);
    expect(JSON.stringify(lots)).not.toContain(REASON);
    for (const [path, user] of [[`/ngo/photos/${PHOTO}/content`, "owner"], [`/admin/ngo-photos/${PHOTO}/content`, "admin"],
      [`/ngo/documents/${DOCUMENT}/content`, "owner"], [`/admin/ngo-documents/${DOCUMENT}/content`, "admin"]]) expect((await call("GET", path, undefined, user)).status).toBe(200);
    expect((await call("GET", `/ngo/documents/${DOCUMENT}/content`, undefined, "other")).status).toBe(404);
  });

  it("requires enabled accounts/withdrawal, exact origin, current account and independent administrator", async () => {
    env.NGO_WITHDRAWAL_ENABLED = "false"; expect((await withdraw()).status).toBe(404); env.NGO_WITHDRAWAL_ENABLED = "true";
    env.ACCOUNTS_ENABLED = "false"; expect((await withdraw()).status).toBe(404); env.ACCOUNTS_ENABLED = "true";
    expect((await withdraw({}, "")).status).toBe(401); expect((await withdraw({}, "owner")).status).toBe(403);
    expect((await withdraw({ accountId: "admin2" })).status).toBe(409);
    for (const origin of [null, `${ORIGIN}.evil`]) expect((await call("POST", `/admin/ngos/${NGO}/withdraw`, {}, "admin", origin)).status).toBe(403);
    await db.prepare("UPDATE users SET role='admin' WHERE id='owner'").run(); expect((await withdraw({}, "owner")).status).toBe(403);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toHaveLength(0); expect(db.sql("SELECT * FROM audit_events")).toHaveLength(0);
  });

  it("validates reason, revision and identity without partial writes", async () => {
    for (const reason of [null, "", "short", "x".repeat(1001), "😀".repeat(5), "😀".repeat(1001), `\0${REASON}`]) expect((await withdraw({ reason })).status).toBe(400);
    for (const revision of [null, 0, -1, 1.5, "1", Number.MAX_SAFE_INTEGER + 1]) expect((await withdraw({ revision })).status).toBe(400);
    expect(await (await withdraw({ revision: 2 })).json()).toEqual({ error: "stale_revision" });
    expect((await call("POST", `/admin/ngos/${OTHER_NGO}/withdraw`, { accountId: "admin", revision: 1, reason: REASON })).status).toBe(404);
    expect((await call("POST", "/admin/ngos/not-an-id/withdraw", { accountId: "admin", revision: 1, reason: REASON })).status).toBe(404);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toHaveLength(0);
  });

  it.each([10, 1000])("accepts %i Unicode characters consistently with the database constraint", async (count) => {
    const reason = "😀".repeat(count);
    expect((await withdraw({ reason })).status).toBe(200);
    expect(db.sql("SELECT reason,length(reason) AS size FROM ngo_withdrawals")[0]).toEqual({ reason, size: count });
  });

  it.each(["submitted", "under_review", "changes_requested", "rejected"])("does not withdraw an application in %s", async (status) => {
    await db.prepare("UPDATE ngos SET status=? WHERE id=?").bind(status, NGO).run();
    expect(await (await withdraw()).json()).toEqual({ error: "bad_transition" });
    expect(db.sql("SELECT state FROM lots WHERE id='plaza-01'")[0].state).toBe("published");
    expect(db.sql("SELECT * FROM audit_events")).toHaveLength(0);
  });

  it("commits one same-millisecond concurrent withdrawal and one audit, and refuses retry", async () => {
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const paused = pauseNextBatch(), pending = withdraw(); await paused.ready;
    expect((await withdraw({}, "admin2")).status).toBe(200); paused.release();
    expect((await pending).status).toBe(409); expect((await withdraw()).status).toBe(409);
    expect(db.sql("SELECT actor FROM ngo_withdrawals")).toEqual([{ actor: "admin2" }]);
    expect(db.sql("SELECT actor FROM audit_events WHERE action='ngo.withdraw'")).toEqual([{ actor: "admin2" }]);
    expect(db.sql("SELECT revision FROM ngos WHERE id=?", NGO)[0].revision).toBe(2);
  });

  it("rolls back ledger, revision and lots when audit persistence fails", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("CREATE TRIGGER fail_withdraw BEFORE INSERT ON audit_events WHEN NEW.action='ngo.withdraw' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    expect((await withdraw()).status).toBe(500);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toHaveLength(0); expect(db.sql("SELECT revision FROM ngos")[0].revision).toBe(1);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")[0]).toEqual({ state: "published", ngo_id: NGO });
    expect(error.mock.calls.flat().join(" ")).not.toContain(REASON);
  });

  it("releases every actual association while preserving another NGO's requested historical lot", async () => {
    await db.prepare("INSERT INTO ngos(id,name,cnpj,status) VALUES(?,'Other','11444777000161','published')").bind(OTHER_NGO).run();
    await db.prepare("UPDATE lots SET ngo_id=? WHERE id='plaza-01'").bind(OTHER_NGO).run();
    await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id IN ('plaza-02','plaza-03')").bind(NGO).run();
    expect((await withdraw()).status).toBe(200);
    expect(db.sql("SELECT ngo_id,state FROM lots WHERE id='plaza-01'")[0]).toEqual({ ngo_id: OTHER_NGO, state: "published" });
    expect(db.sql("SELECT ngo_id,state FROM lots WHERE id IN ('plaza-02','plaza-03')")).toEqual([{ ngo_id: null, state: "available" }, { ngo_id: null, state: "available" }]);
    expect(JSON.parse(db.sql("SELECT lot_ids FROM ngo_withdrawals")[0].lot_ids as string)).toEqual(["plaza-02", "plaza-03"]);
  });

  it("supports seeded NGOs without applicant or requested lot, including lost associations", async () => {
    await db.prepare("UPDATE ngos SET applicant_id=NULL,requested_lot_id=NULL WHERE id=?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state='available',ngo_id=NULL WHERE ngo_id=?").bind(NGO).run();
    expect((await withdraw()).status).toBe(200);
    expect(db.sql("SELECT lot_ids FROM ngo_withdrawals")[0].lot_ids).toBe("[]");
    expect(await (await call("GET", "/admin/applications")).json()).toMatchObject({ applications: [{ id: NGO, status: "withdrawn" }] });
  });

  it("keeps read revocation when flags are disabled or a stale lot association is reintroduced", async () => {
    expect((await withdraw()).status).toBe(200);
    env.NGO_WITHDRAWAL_ENABLED = "false"; env.ACCOUNTS_ENABLED = "false";
    await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
    expect((await publicGet(`/ngos/${NGO}`)).status).toBe(404); expect((await publicGet(`/ngos/${NGO}/photos/${PHOTO}`)).status).toBe(404);
    expect(await (await publicGet("/lots")).json()).toMatchObject({ lots: expect.arrayContaining([expect.objectContaining({ id: "plaza-01", ngo_id: null, ngo_name: null })]) });
  });

  it.each([true, false])("keeps photo approval private when withdrawal wins first: %s", async (withdrawFirst) => {
    await db.prepare("UPDATE ngo_photos SET status='pending' WHERE id=?").bind(PHOTO).run();
    const paused = pauseNextBatch(), pending = withdrawFirst ? photoDecision() : withdraw(); await paused.ready;
    expect((await (withdrawFirst ? withdraw() : photoDecision())).status).toBe(200); paused.release();
    expect((await pending).status).toBe(withdrawFirst ? 409 : 200);
    expect((await publicGet(`/ngos/${NGO}/photos/${PHOTO}`)).status).toBe(404);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.photo.approve'")).toHaveLength(withdrawFirst ? 0 : 1);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.withdraw'")).toHaveLength(1);
  });

  it("freezes new evidence and moderation but preserves existing private photo removal", async () => {
    expect((await withdraw()).status).toBe(200);
    const upload = await call("POST", "/ngo/photos", { accountId: "owner", ngoId: NGO, caption: "", position: 0, contentType: "image/png", dataBase64: PNG }, "owner");
    expect(await upload.json()).toEqual({ error: "application_withdrawn" }); expect(bucket.put).not.toHaveBeenCalled();
    for (const action of ["approve", "reject"]) expect(await (await photoDecision(action)).json()).toEqual({ error: "application_withdrawn" });
    expect((await call("POST", "/ngo/documents", { accountId: "owner", ngoId: NGO, applicationRevision: 2 }, "owner")).status).toBe(409);
    expect((await call("POST", `/ngo/documents/${DOCUMENT}/withdraw`, { accountId: "owner", applicationRevision: 2 }, "owner")).status).toBe(409);
    expect(await (await call("POST", "/ngo/application", { ...APPLICATION, accountId: "owner" }, "owner")).json()).toEqual({ error: "application_withdrawn" });
    expect((await photoDecision("remove")).status).toBe(200); expect(objects.has("photo-key")).toBe(false); expect(objects.has("document-key")).toBe(true);
  });

  it("cleans up a photo upload that loses to withdrawal after writing R2", async () => {
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; }), blocked = new Promise<void>((resolve) => { release = resolve; });
    bucket.put.mockImplementationOnce(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes); entered(); await blocked; });
    const pending = call("POST", "/ngo/photos", { accountId: "owner", ngoId: NGO, caption: "", position: 1, contentType: "image/png", dataBase64: PNG }, "owner");
    await ready; expect((await withdraw()).status).toBe(200); release();
    expect((await pending).status).toBe(409); expect(db.sql("SELECT * FROM ngo_photos")).toHaveLength(1); expect(objects.size).toBe(2);
  });

  it("returns the effective status when withdrawal commits before an approval response is read", async () => {
    await db.prepare("UPDATE ngos SET status='submitted' WHERE id=?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state='application_sent' WHERE ngo_id=?").bind(NGO).run();
    const original = db.batch.bind(db);
    let entered!: () => void, release!: () => void;
    const ready = new Promise<void>((resolve) => { entered = resolve; }), blocked = new Promise<void>((resolve) => { release = resolve; });
    db.batch = (async (statements: Parameters<typeof db.batch>[0]) => {
      db.batch = original; const result = await original(statements); entered(); await blocked; return result;
    }) as typeof db.batch;
    const pending = call("POST", `/admin/applications/${NGO}/decision`, { revision: 1, action: "approve", checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true } });
    await ready; expect((await withdraw()).status).toBe(200); release();
    expect(await (await pending).json()).toMatchObject({ application: { status: "withdrawn", revision: 2, withdrawal: { reason: REASON } } });
  });

  it("allows a different applicant to reserve the released lot without changing withdrawal history", async () => {
    expect((await withdraw()).status).toBe(200);
    const response = await call("POST", "/ngo/application", { ...APPLICATION, accountId: "other", cnpj: "11444777000161" }, "other");
    expect(response.status).toBe(201);
    const result = await response.json() as { application: { id: string } };
    expect(result.application.id).not.toBe(NGO);
    expect(db.sql("SELECT ngo_id,state FROM lots WHERE id='plaza-01'")[0]).toEqual({ ngo_id: result.application.id, state: "application_sent" });
    expect(await (await call("GET", "/ngo/application", undefined, "owner")).json()).toMatchObject({ application: { id: NGO, status: "withdrawn" } });
    expect(JSON.parse(db.sql("SELECT lot_ids FROM ngo_withdrawals")[0].lot_ids as string)).toEqual(["plaza-01"]);
  });

  it("upgrades populated schema without rebuilding or deleting any existing record", async () => {
    const prior = createD1({ before: "0009_ngo_withdrawals.sql" });
    await prior.exec(`INSERT INTO users(id,name,nickname,nickname_key,city,email) VALUES('owner','Owner','owner','owner','Recife','owner@example.test');
      INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id,review_note) VALUES('${NGO}','Example','11222333000181','published','owner','plaza-01','Prior review');
      UPDATE lots SET state='published',ngo_id='${NGO}' WHERE id='plaza-01';
      INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position) VALUES('${PHOTO}','${NGO}','photo-key','image/png',1,'Caption',0);
      INSERT INTO ngo_documents(id,ngo_id,object_key,label,content_type,byte_size,added_revision,created_at) VALUES('${DOCUMENT}','${NGO}','document-key','Evidence','application/pdf',1,1,'2026-01-01');
      INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','explore','plaza');
      INSERT INTO audit_events(id,actor,action,subject,detail) VALUES('previous','owner','ngo.approve','ngo:${NGO}','{}');`);
    const tables = ["users", "ngos", "lots", "ngo_photos", "ngo_documents", "progress_events", "audit_events"];
    const before = tables.map((table) => prior.sql(`SELECT * FROM ${table}`));
    prior.migrate("0009_ngo_withdrawals.sql");
    expect(tables.map((table) => prior.sql(`SELECT * FROM ${table}`))).toEqual(before);
    expect(prior.sql("PRAGMA foreign_key_check")).toEqual([]); expect(prior.sql("SELECT * FROM ngo_withdrawals")).toEqual([]);
  });
});
