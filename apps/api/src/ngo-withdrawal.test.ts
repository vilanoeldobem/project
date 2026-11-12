import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "../test/d1.mjs";
import { pdf, png } from "../test/fixtures.mjs";
import { createR2 } from "../test/r2.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";
import { publicPhotos } from "./ngo-photos";

const NGO = "a0000000-0000-4000-8000-000000000001", OTHER_NGO = "a0000000-0000-4000-8000-000000000002";
const PHOTO = "b0000000-0000-4000-8000-000000000001";
const LOGO = "c0000000-0000-4000-8000-000000000001", DOCUMENT = "c0000000-0000-4000-8000-000000000002";
const PHOTO_KEY = `ngo-photos/${NGO}/${PHOTO}`, LOGO_KEY = `ngo/${NGO}/${LOGO}`, DOCUMENT_KEY = `ngo/${NGO}/${DOCUMENT}`;
const ORIGIN = "https://dash.example", REASON = "MESSAGE to the organisation about the withdrawal";
const APPLICATION = { name: "Associação Exemplo", cnpj: "11222333000181", openedOn: "2020-01-01", city: "Recife",
  declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true }, fundsConfirmation: "Extratos e relatórios conciliáveis da organização.",
  summary: "Apoio escolar às crianças da comunidade.", description: "Atendemos crianças com atividades educativas e culturais na comunidade.", tags: ["education"], projects: [], lotId: "plaza-01" };
let db: ReturnType<typeof createD1>, env: Env, bucket: ReturnType<typeof createR2>;

const request = (method: string, path: string, user: string, origin: string | null, headers: Record<string, string>, body?: BodyInit) =>
  handleApi(new Request(`https://api.example${path}`, {
    method, headers: { ...(origin ? { Origin: origin } : {}), ...(user ? { Cookie: `__Host-vila_session=${user}` } : {}), ...headers }, body,
  }), env);
const call = (method: string, path: string, body?: unknown, user = "admin", origin: string | null = ORIGIN) =>
  request(method, path, user, origin, body === undefined ? {} : { "Content-Type": "application/json" }, body === undefined ? undefined : JSON.stringify(body));
const withdraw = (override: Record<string, unknown> = {}, user = "admin") => call("POST", `/admin/ngos/${NGO}/withdraw`, {
  accountId: user, revision: 1, reason: REASON, ...override,
}, user);
const publicGet = (path: string, method = "GET") => call(method, path, undefined, "", null);
/** Approving requires the audited read of the same photo revision first (IMPL-0018). */
const photoDecision = async (action = "approve", revision = 1) => {
  if (action === "approve") await call("GET", `/admin/ngo-photos/${PHOTO}/content`);
  return call("POST", `/admin/ngo-photos/${PHOTO}/decision`, { accountId: "admin", action, revision });
};
const uploadPhoto = (position = 1, user = "owner") => request("POST", `/ngo/photos?ngoId=${NGO}&position=${position}`, user, ORIGIN,
  { "X-Vila-Account": user, "Content-Type": "image/png", "X-Vila-Caption": "" }, png() as BodyInit);
const uploadDocument = (user = "owner") => request("POST", "/ngo/application/files?kind=document", user, ORIGIN,
  { "X-Vila-Account": user, "Content-Type": "application/pdf" }, pdf() as BodyInit);
const uploadLogo = (user = "owner") => request("POST", "/ngo/application/files?kind=logo", user, ORIGIN,
  { "X-Vila-Account": user, "Content-Type": "image/png" }, png() as BodyInit);
const deletePhoto = (id: string, user = "owner") => request("DELETE", `/ngo/photos/${id}`, user, ORIGIN, { "X-Vila-Account": user });
const deleteAccount = (user = "owner") => request("DELETE", "/me", user, ORIGIN, {});
const approve = (revision = 1) => call("POST", `/admin/applications/${NGO}/decision`, { action: "approve", revision, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true } });
const deleteFile = (id: string, user = "owner") => request("DELETE", `/ngo/application/files/${id}`, user, ORIGIN, { "X-Vila-Account": user });
const error = async (response: Response | Promise<Response>) => ((await (await response).json()) as { error: string }).error;

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
/** Pauses the conditional write of the bytes: the empty reservation and the "still active" check already happened. */
function pauseNextBytesPut() {
  const original = bucket.put.bind(bucket);
  let release!: () => void, entered!: () => void;
  const blocked = new Promise<void>((resolve) => { release = resolve; });
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  bucket.put = (async (...args: Parameters<typeof original>) => {
    if (!(args[2] as R2PutOptions | undefined)?.onlyIf) return original(...args);
    bucket.put = original; entered(); await blocked; return original(...args);
  }) as typeof bucket.put;
  return { ready, release };
}

/** Accounts, sessions and one published NGO on plaza-01; photo and files only where the schema has their tables. */
async function seed(database: ReturnType<typeof createD1>, schema = 9) {
  for (const user of ["owner", "other", "admin", "admin2"]) {
    await database.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(user, user, user, user, "Recife", `${user}@example.test`, user.startsWith("admin") ? "admin" : "player", "2026-01-01").run();
    await database.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(user), user, "2099-01-01").run();
  }
  await database.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id,review_note) VALUES(?, 'Exemplo', '11222333000181', 'published', 'owner', 'plaza-01','Original review')").bind(NGO).run();
  await database.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
  if (schema >= 7) await database.prepare("INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position,status) VALUES(?,?,?,'image/png',1,'Public caption',0,'approved')").bind(PHOTO, NGO, PHOTO_KEY).run();
  if (schema >= 6) await database.prepare("INSERT INTO ngo_files(id,ngo_id,kind,content_type,size,uploaded_by,created_at) VALUES(?,?,'logo','image/png',1,'owner','2026-01-01'),(?,?,'document','application/pdf',1,'owner','2026-01-02')").bind(LOGO, NGO, DOCUMENT, NGO).run();
  await database.prepare("INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','explore','plaza')").run();
}

beforeEach(async () => {
  db = createD1(); bucket = createR2();
  for (const key of [PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY]) await bucket.put(key, new Uint8Array([1]));
  env = { DB: db, FILES: bucket, ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: ORIGIN, NGO_WITHDRAWAL_ENABLED: "true",
    NGO_PHOTOS_ENABLED: "true", NGO_FILES_ENABLED: "true" };
  await seed(db);
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("administrative NGO withdrawal", () => {
  it("releases the lot and hides public content while preserving private evidence, review and progress", async () => {
    const progress = db.sql("SELECT * FROM progress_events"), photo = db.sql("SELECT * FROM ngo_photos"), files = db.sql("SELECT * FROM ngo_files");
    for (const path of [`/ngos/${NGO}`, `/ngos/${NGO}/logo`, `/ngos/${NGO}/photos/${PHOTO}`]) expect((await publicGet(path)).status).toBe(200);
    const response = await withdraw({ reason: `  ${REASON}  ` });
    expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = await response.json() as Record<string, unknown>;
    expect(result).toMatchObject({ application: { status: "withdrawn", revision: 2, reviewNote: "Original review", withdrawal: { reason: REASON, at: expect.any(String) } } });
    expect(db.sql("SELECT status,revision,review_note FROM ngos WHERE id=?", NGO)[0]).toEqual({ status: "published", revision: 2, review_note: "Original review" });
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")[0]).toEqual({ state: "available", ngo_id: null });
    expect(db.sql("SELECT * FROM progress_events")).toEqual(progress);
    expect(db.sql("SELECT * FROM ngo_photos")).toEqual(photo); expect(db.sql("SELECT * FROM ngo_files")).toEqual(files);
    const audit = db.sql("SELECT actor,action,detail FROM audit_events"); expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor: "admin", action: "ngo.withdraw" });
    expect(JSON.parse(audit[0].detail as string)).toEqual({ from: "published", to: "withdrawn", revision: 2, lots: ["plaza-01"], hasReason: true });
    expect(audit[0].detail).not.toContain(REASON); expect(bucket.keys()).toEqual([PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY].sort());
    expect(await (await call("GET", "/ngo/application", undefined, "owner")).json()).toMatchObject(result);
    expect(await (await call("GET", `/admin/applications/${NGO}`)).json()).toMatchObject(result);
    expect(await (await call("GET", "/admin/applications?status=withdrawn")).json()).toMatchObject({ applications: [{ id: NGO, status: "withdrawn" }] });
    expect(await (await call("GET", "/admin/applications?status=published")).json()).toEqual({ applications: [] });
    for (const path of [`/ngos/${NGO}`, `/ngos/${NGO}/logo`, `/ngos/${NGO}/photos/${PHOTO}`]) {
      for (const method of ["GET", "HEAD"]) {
        const res = await publicGet(path, method); expect(res.status).toBe(404); expect(res.headers.get("Cache-Control")).toBe("no-store");
      }
    }
    const lots = await (await publicGet("/lots")).json() as { lots: Record<string, unknown>[] };
    expect(lots.lots.find((lot) => lot.id === "plaza-01")).toMatchObject({ state: "available", ngo_id: null, ngo_name: null, ngo_summary: null, ngo_logo: null });
    expect(JSON.stringify(lots)).not.toContain(REASON);
    for (const [path, user] of [[`/ngo/photos/${PHOTO}/content`, "owner"], [`/admin/ngo-photos/${PHOTO}/content`, "admin"],
      [`/ngo/application/files/${DOCUMENT}`, "owner"], [`/admin/applications/${NGO}/files/${DOCUMENT}`, "admin"]]) expect((await call("GET", path, undefined, user)).status).toBe(200);
    expect((await call("GET", `/ngo/application/files/${DOCUMENT}`, undefined, "other")).status).toBe(404);
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
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("CREATE TRIGGER fail_withdraw BEFORE INSERT ON audit_events WHEN NEW.action='ngo.withdraw' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END");
    expect((await withdraw()).status).toBe(500);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toHaveLength(0); expect(db.sql("SELECT revision FROM ngos")[0].revision).toBe(1);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")[0]).toEqual({ state: "published", ngo_id: NGO });
    expect(logged.mock.calls.flat().join(" ")).not.toContain(REASON);
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

  it("keeps the public revocation and the private status when the flags are switched off afterwards", async () => {
    expect((await withdraw()).status).toBe(200);
    env.NGO_WITHDRAWAL_ENABLED = "false";
    expect(await (await call("GET", "/ngo/application", undefined, "owner")).json()).toMatchObject({ application: { status: "withdrawn" } });
    env.ACCOUNTS_ENABLED = "false";
    for (const path of [`/ngos/${NGO}`, `/ngos/${NGO}/logo`, `/ngos/${NGO}/photos/${PHOTO}`]) expect((await publicGet(path)).status).toBe(404);
    expect(await (await publicGet("/lots")).json()).toMatchObject({ lots: expect.arrayContaining([expect.objectContaining({ id: "plaza-01", ngo_id: null, ngo_name: null })]) });
  });

  it.each([true, false])("keeps photo approval private when withdrawal wins first: %s", async (withdrawFirst) => {
    await db.prepare("UPDATE ngo_photos SET status='pending' WHERE id=?").bind(PHOTO).run();
    const paused = pauseNextBatch(), pending = withdrawFirst ? photoDecision() : withdraw(); await paused.ready;
    expect((await (withdrawFirst ? withdraw() : photoDecision())).status).toBe(200); paused.release();
    const late = await pending;
    expect(late.status).toBe(withdrawFirst ? 409 : 200);
    if (withdrawFirst) expect(await error(late)).toBe("application_withdrawn");
    expect((await publicGet(`/ngos/${NGO}/photos/${PHOTO}`)).status).toBe(404);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.photo.approve'")).toHaveLength(withdrawFirst ? 0 : 1);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.withdraw'")).toHaveLength(1);
  });

  it("freezes new evidence and moderation but preserves existing private photo removal", async () => {
    expect((await withdraw()).status).toBe(200);
    const put = vi.spyOn(bucket, "put");
    expect(await error(uploadPhoto())).toBe("application_withdrawn");
    expect(await error(uploadDocument())).toBe("application_withdrawn");
    expect(await error(uploadLogo())).toBe("application_withdrawn");
    expect(put).not.toHaveBeenCalled();
    for (const action of ["approve", "reject"]) expect(await error(photoDecision(action))).toBe("application_withdrawn");
    expect(await error(call("POST", "/ngo/application", { ...APPLICATION, accountId: "owner" }, "owner"))).toBe("application_withdrawn");
    expect(await error(call("POST", `/admin/applications/${NGO}/decision`, { action: "reject", revision: 2, note: "Not a decision any more." }))).toBe("bad_transition");
    expect((await photoDecision("remove")).status).toBe(200);
    expect(bucket.keys()).toEqual([LOGO_KEY, DOCUMENT_KEY].sort());
  });

  it("cleans up a photo upload that loses to withdrawal after writing R2", async () => {
    const paused = pauseNextBytesPut(), pending = uploadPhoto();
    await paused.ready; expect((await withdraw()).status).toBe(200); paused.release();
    const late = await pending;
    expect(late.status).toBe(409); expect(await error(late)).toBe("photo_limit_or_owner_changed");
    expect(db.sql("SELECT status,upload_pending,cleanup_pending FROM ngo_photos WHERE id!=?", PHOTO)).toEqual([{ status: "removed", upload_pending: 0, cleanup_pending: 0 }]);
    expect(bucket.keys()).toEqual([PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY].sort());
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.photo.upload'")).toHaveLength(0);
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
    const prior = createD1({ upTo: 8 });
    await prior.exec(`INSERT INTO users(id,name,nickname,nickname_key,city,email) VALUES('owner','Owner','owner','owner','Recife','owner@example.test');
      INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id,review_note) VALUES('${NGO}','Example','11222333000181','published','owner','plaza-01','Prior review');
      UPDATE lots SET state='published',ngo_id='${NGO}' WHERE id='plaza-01';
      INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position) VALUES('${PHOTO}','${NGO}','${PHOTO_KEY}','image/png',1,'Caption',0);
      INSERT INTO ngo_files(id,ngo_id,kind,content_type,size,uploaded_by,created_at) VALUES('${DOCUMENT}','${NGO}','document','application/pdf',1,'owner','2026-01-01');
      INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','explore','plaza');
      INSERT INTO audit_events(id,actor,action,subject,detail) VALUES('previous','owner','ngo.approve','ngo:${NGO}','{}');`);
    const tables = ["users", "ngos", "lots", "ngo_photos", "ngo_files", "media_upload_intents", "progress_events", "progress_writes", "audit_events"];
    const before = tables.map((table) => prior.sql(`SELECT * FROM ${table}`));
    prior.migrate("0009_ngo_withdrawals.sql");
    expect(tables.map((table) => prior.sql(`SELECT * FROM ${table}`))).toEqual(before);
    expect(prior.sql("PRAGMA foreign_key_check")).toEqual([]); expect(prior.sql("SELECT * FROM ngo_withdrawals")).toEqual([]);
  });
});

describe("files, gallery and account deletion after a withdrawal", () => {
  // PROPOSTA (OQ-14): removing one's own data stays possible after a withdrawal; adding or changing does not.
  it("lets the applicant remove their own files and photos, and nobody else", async () => {
    expect((await withdraw()).status).toBe(200);
    expect((await deleteFile(DOCUMENT, "other")).status).toBe(404);
    expect((await deletePhoto(PHOTO, "other")).status).toBe(404);
    const removed = await deleteFile(DOCUMENT);
    expect([removed.status, await removed.json()]).toEqual([200, { revision: 3 }]);
    expect((await deleteFile(LOGO)).status).toBe(200);
    expect((await deletePhoto(PHOTO)).status).toBe(200);
    expect(bucket.keys()).toEqual([]);
    expect(db.sql("SELECT * FROM ngo_files")).toEqual([]);
    expect(db.sql("SELECT status,caption,cleanup_pending FROM ngo_photos")).toEqual([{ status: "removed", caption: "", cleanup_pending: 0 }]);
    expect(db.sql("SELECT * FROM media_upload_intents")).toEqual([]);
    expect(db.sql("SELECT actor,action FROM audit_events WHERE action IN ('ngo.file_remove','ngo.photo.remove') ORDER BY rowid")).toEqual([
      { actor: "owner", action: "ngo.file_remove" }, { actor: "owner", action: "ngo.file_remove" }, { actor: "owner", action: "ngo.photo.remove" }]);
    // Still withdrawn, with the same message; the ledger keeps the revision of the withdrawal itself.
    expect(await (await call("GET", "/ngo/application", undefined, "owner")).json()).toMatchObject({ application: { status: "withdrawn", revision: 4, withdrawal: { reason: REASON } }, files: [] });
    expect(db.sql("SELECT revision FROM ngo_withdrawals")).toEqual([{ revision: 2 }]);
    for (const refused of [uploadDocument(), uploadLogo(), uploadPhoto()]) expect(await error(refused)).toBe("application_withdrawn");
  });

  it("keeps files frozen for a published NGO that was not withdrawn", async () => {
    expect(await error(deleteFile(DOCUMENT))).toBe("application_locked");
    expect(await error(uploadDocument())).toBe("application_locked");
    expect(bucket.keys()).toEqual([PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY].sort());
  });

  it("completes the account deletion of a withdrawn NGO's owner and erases its files, logo included", async () => {
    expect((await withdraw()).status).toBe(200);
    expect((await deleteAccount()).status).toBe(204);
    expect(db.sql("SELECT id FROM users WHERE id='owner'")).toEqual([]);
    expect(bucket.keys()).toEqual([]);
    expect(db.sql("SELECT * FROM ngo_files")).toEqual([]); expect(db.sql("SELECT * FROM ngo_photos")).toEqual([]);
    // The organisation's record, the ledger and the message stay; the link to the person is gone.
    expect(db.sql("SELECT applicant_id,status,revision FROM ngos WHERE id=?", NGO)).toEqual([{ applicant_id: null, status: "published", revision: 3 }]);
    expect(db.sql("SELECT ngo_id,reason,actor FROM ngo_withdrawals")).toEqual([{ ngo_id: NGO, reason: REASON, actor: "admin" }]);
    expect(await (await call("GET", `/admin/applications/${NGO}`)).json()).toMatchObject({ application: { status: "withdrawn", withdrawal: { reason: REASON } }, applicant: null, files: [] });
    expect(await (await call("GET", "/admin/applications?status=withdrawn")).json()).toMatchObject({ applications: [{ id: NGO, status: "withdrawn" }] });
    for (const path of [`/ngos/${NGO}`, `/ngos/${NGO}/logo`, `/ngos/${NGO}/photos/${PHOTO}`]) expect((await publicGet(path)).status).toBe(404);
    // What the code does today (OQ-14): the CNPJ stays taken; another CNPJ can take the released lot.
    expect(await error(call("POST", "/ngo/application", { ...APPLICATION, accountId: "other" }, "other"))).toBe("cnpj_in_use");
    expect((await call("POST", "/ngo/application", { ...APPLICATION, accountId: "other", cnpj: "11444777000161" }, "other")).status).toBe(201);
  });

  it("keeps the public logo of a published NGO when its owner deletes the account (unchanged rule)", async () => {
    expect((await deleteAccount()).status).toBe(204);
    expect(bucket.keys()).toEqual([LOGO_KEY]);
    expect((await publicGet(`/ngos/${NGO}/logo`)).status).toBe(200);
    // Withdrawn later, with nobody left to remove it: the logo stays stored and private (retention: OQ-14).
    expect((await withdraw({ revision: 2 })).status).toBe(200);
    expect((await publicGet(`/ngos/${NGO}/logo`)).status).toBe(404);
    expect(bucket.keys()).toEqual([LOGO_KEY]);
  });

  it("blocks the owner's account and the CNPJ after a withdrawal: what the code does today (OQ-14)", async () => {
    expect((await withdraw()).status).toBe(200);
    // A different organisation, a different CNPJ, a free lot: still refused for this account.
    expect(await error(call("POST", "/ngo/application", { ...APPLICATION, accountId: "owner", cnpj: "11444777000161", lotId: "plaza-02" }, "owner"))).toBe("application_withdrawn");
    expect(await error(call("POST", "/ngo/application", { ...APPLICATION, accountId: "other", lotId: "plaza-02" }, "other"))).toBe("cnpj_in_use");
    // No decision applies and there is no undo route.
    for (const action of ["start_review", "approve", "request_changes", "reject"])
      expect(await error(call("POST", `/admin/applications/${NGO}/decision`, { action, revision: 2, note: "Synthetic note for the test.", checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true } }))).toBe("bad_transition");
    for (const method of ["DELETE", "PUT", "PATCH"]) expect((await call(method, `/admin/ngos/${NGO}/withdraw`, {})).status).toBe(404);
    expect(db.sql("SELECT status FROM ngos WHERE id=?", NGO)).toEqual([{ status: "published" }]);
    // The stored status holds the slot of the 0005 unique index for this account.
    await expect(db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id) VALUES(?,'Second','11444777000161','submitted','owner')").bind(OTHER_NGO).run()).rejects.toThrow(/UNIQUE/);
  });
});

describe("withdrawal racing other writes", () => {
  const asSubmitted = async () => {
    await db.prepare("UPDATE ngos SET status='submitted' WHERE id=?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state='application_sent' WHERE ngo_id=?").bind(NGO).run();
  };

  it("discards a file upload that was in flight when the NGO was approved and withdrawn", async () => {
    await asSubmitted();
    const paused = pauseNextBytesPut(), pending = uploadDocument();
    await paused.ready;
    expect((await approve()).status).toBe(200); expect((await withdraw()).status).toBe(200);
    paused.release();
    const late = await pending;
    expect([late.status, await error(late)]).toEqual([409, "application_changed"]);
    expect(db.sql("SELECT id FROM ngo_files ORDER BY id")).toEqual([{ id: LOGO }, { id: DOCUMENT }]);
    expect(db.sql("SELECT * FROM media_upload_intents")).toEqual([]);
    expect(bucket.keys()).toEqual([PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY].sort());
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.file_add'")).toEqual([]);
    expect(db.sql("SELECT revision FROM ngos WHERE id=?", NGO)).toEqual([{ revision: 2 }]);
  });

  it("applies an approval and a withdrawal in order, whichever request started first", async () => {
    await asSubmitted();
    // The approval is still in its batch: the NGO is not published yet, so there is nothing to withdraw.
    const paused = pauseNextBatch(), pending = approve(); await paused.ready;
    expect(await error(withdraw())).toBe("bad_transition");
    paused.release();
    expect((await pending).status).toBe(200);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toEqual([]);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")).toEqual([{ state: "published", ngo_id: NGO }]);
    expect((await withdraw()).status).toBe(200);
    expect(db.sql("SELECT action FROM audit_events WHERE action IN ('ngo.approve','ngo.withdraw') ORDER BY rowid")).toEqual([{ action: "ngo.approve" }, { action: "ngo.withdraw" }]);
  });

  it("never lets a resubmission pass a withdrawal", async () => {
    // While the withdrawal is committing the NGO is still published: the applicant already has an active application.
    const paused = pauseNextBatch(), pending = withdraw(); await paused.ready;
    expect(await error(call("POST", "/ngo/application", { ...APPLICATION, accountId: "owner" }, "owner"))).toBe("application_active");
    paused.release(); expect((await pending).status).toBe(200);
    expect(await error(call("POST", "/ngo/application", { ...APPLICATION, accountId: "owner" }, "owner"))).toBe("application_withdrawn");
    expect(db.sql("SELECT * FROM audit_events WHERE action IN ('ngo.submit','ngo.resubmit')")).toEqual([]);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")).toEqual([{ state: "available", ngo_id: null }]);
  });

  it("refuses in SQL a resubmission whose read is older than the approval and the withdrawal", async () => {
    await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state='application_sent' WHERE ngo_id=?").bind(NGO).run();
    const paused = pauseNextBatch(), pending = call("POST", "/ngo/application", { ...APPLICATION, accountId: "owner", name: "Changed name" }, "owner");
    await paused.ready;
    // No API path publishes an application awaiting changes: forced here to prove the write guards alone hold.
    await db.prepare("UPDATE ngos SET status='published' WHERE id=?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state='published' WHERE ngo_id=?").bind(NGO).run();
    expect((await withdraw()).status).toBe(200);
    paused.release();
    const late = await pending;
    expect([late.status, await error(late)]).toEqual([409, "application_changed"]);
    expect(db.sql("SELECT name,status,revision FROM ngos WHERE id=?", NGO)).toEqual([{ name: "Exemplo", status: "published", revision: 2 }]);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")).toEqual([{ state: "available", ngo_id: null }]);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.resubmit'")).toEqual([]);
  });

  it("waits for a pending account deletion, then withdraws the ownerless NGO", async () => {
    // DELETE /me froze the account and erased the R2 objects; its final batch has not committed yet.
    const paused = pauseNextBatch(), pending = deleteAccount(); await paused.ready;
    expect(db.sql("SELECT files_deleting FROM users WHERE id='owner'")).toEqual([{ files_deleting: 1 }]);
    expect(await error(withdraw())).toBe("account_deleting");
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toEqual([]);
    paused.release(); expect((await pending).status).toBe(204);
    // The logo of the still-published NGO stayed, bytes and row together: no orphan either way.
    expect(bucket.keys()).toEqual([LOGO_KEY]); expect(db.sql("SELECT id FROM ngo_files")).toEqual([{ id: LOGO }]);
    expect(await error(withdraw())).toBe("stale_revision");
    expect((await withdraw({ revision: 2 })).status).toBe(200);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")).toEqual([{ state: "available", ngo_id: null }]);
  });

  it("refuses in SQL a withdrawal whose read is older than the start of an account deletion", async () => {
    const paused = pauseNextBatch(), pending = withdraw(); await paused.ready;
    // The deletion froze the account after the withdrawal read it (its R2 cleanup is still running).
    await db.prepare("UPDATE users SET files_deleting=1 WHERE id='owner'").run();
    paused.release();
    const late = await pending;
    expect([late.status, await error(late)]).toEqual([409, "account_deleting"]);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toEqual([]); expect(db.sql("SELECT * FROM audit_events")).toEqual([]);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")).toEqual([{ state: "published", ngo_id: NGO }]);
  });

  it("refuses a withdrawal that lost to a completed account deletion, and leaves the NGO as it was", async () => {
    const paused = pauseNextBatch(), pending = withdraw(); await paused.ready;
    expect((await deleteAccount()).status).toBe(204);
    paused.release();
    const late = await pending;
    expect([late.status, await error(late)]).toEqual([409, "stale_revision"]);
    expect(db.sql("SELECT * FROM ngo_withdrawals")).toEqual([]);
    expect(db.sql("SELECT state,ngo_id FROM lots WHERE id='plaza-01'")).toEqual([{ state: "published", ngo_id: NGO }]);
    expect(db.sql("SELECT action FROM audit_events ORDER BY rowid")).toEqual([{ action: "user.delete" }]);
  });

  it("lets an account deletion finish after a withdrawal committed first", async () => {
    expect((await withdraw()).status).toBe(200);
    const paused = pauseNextBatch(), pending = deleteAccount(); await paused.ready;
    // Frozen account: the owner's own removal is refused meanwhile, the erasure itself goes on.
    expect(await error(deleteFile(DOCUMENT))).toBe("account_deleting");
    paused.release(); expect((await pending).status).toBe(204);
    expect(bucket.keys()).toEqual([]); expect(db.sql("SELECT * FROM ngo_files")).toEqual([]);
    expect(db.sql("SELECT ngo_id FROM ngo_withdrawals")).toEqual([{ ngo_id: NGO }]);
  });
});

describe("public projections of a withdrawn NGO", () => {
  const indicator = async () => ((await (await publicGet("/indicators")).json()) as { indicators: Array<{ key: string; value: number | null }> })
    .indicators.find((item) => item.key === "approved_ngos")?.value;
  const lot = async () => ((await (await publicGet("/lots")).json()) as { lots: Array<Record<string, unknown>> }).lots.find((item) => item.id === "plaza-01");
  const PUBLIC_PATHS = ["/lots", "/indicators", `/ngos/${NGO}`, `/ngos/${NGO}/logo`, `/ngos/${NGO}/photos/${PHOTO}`];

  // One assertion per public projection, each shown before and gone after: a projection that only checks
  // `status = 'published'` (the stored status never changes) fails here.
  it("stops showing the NGO in lots, indicators, profile, logo, photo list and photo bytes", async () => {
    expect(await lot()).toMatchObject({ state: "published", ngo_id: NGO, ngo_name: "Exemplo", ngo_logo: `/ngos/${NGO}/logo?v=${LOGO.slice(0, 8)}` });
    expect(await indicator()).toBe(1);
    expect(await (await publicGet(`/ngos/${NGO}`)).json()).toMatchObject({ ngo: { id: NGO, photos: [{ id: PHOTO, url: `/ngos/${NGO}/photos/${PHOTO}` }] } });
    expect(await publicPhotos(env, NGO)).toHaveLength(1);
    expect((await publicGet(`/ngos/${NGO}/logo`)).status).toBe(200);
    expect((await publicGet(`/ngos/${NGO}/photos/${PHOTO}`)).status).toBe(200);

    expect((await withdraw()).status).toBe(200);

    expect(await lot()).toEqual(expect.objectContaining({ state: "available", ngo_id: null, ngo_name: null, ngo_summary: null, ngo_logo: null }));
    expect(await indicator()).toBe(0);
    expect((await publicGet(`/ngos/${NGO}`)).status).toBe(404);
    expect(await publicPhotos(env, NGO)).toEqual([]);
    for (const method of ["GET", "HEAD"]) {
      expect((await publicGet(`/ngos/${NGO}/logo`, method)).status).toBe(404);
      expect((await publicGet(`/ngos/${NGO}/photos/${PHOTO}`, method)).status).toBe(404);
    }
    // A cached validator must not keep the bytes alive either.
    for (const [path, etag] of [[`/ngos/${NGO}/logo`, `"${LOGO}"`], [`/ngos/${NGO}/photos/${PHOTO}`, `"${PHOTO}"`]])
      expect((await request("GET", path, "", null, { "If-None-Match": etag })).status).toBe(404);
    // Nothing public names the organisation, its files or the message to it any more, with every flag on or off.
    for (const flags of [{}, { NGO_WITHDRAWAL_ENABLED: "false" }, { ACCOUNTS_ENABLED: "false", NGO_WITHDRAWAL_ENABLED: "false" }]) {
      env = { ...env, ...flags };
      for (const path of PUBLIC_PATHS) {
        const text = await (await publicGet(path)).text();
        for (const secret of [NGO, "Exemplo", LOGO, PHOTO, REASON]) expect([path, text.includes(secret)]).toEqual([path, false]);
      }
    }
    // The private copies are untouched: the withdrawal removes nothing from R2 or D1.
    expect(bucket.keys()).toEqual([PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY].sort());
  });

  it("releases the house in the same request for an NGO whose owner account is gone", async () => {
    await db.prepare("UPDATE ngos SET applicant_id=NULL WHERE id=?").bind(NGO).run();
    expect((await withdraw()).status).toBe(200);
    expect(await indicator()).toBe(0);
    for (const path of PUBLIC_PATHS.slice(2)) expect((await publicGet(path)).status).toBe(404);
  });
});

describe("database without migration 0009", () => {
  const CHECKS = { activeCnpj: true, oneYear: true, fundsConfirmable: true };

  // Signed-in and admin routes join `ngo_withdrawals`: on an older database they follow the 503 schema_outdated
  // convention (never a 500), with the withdrawal flag on or off, and write nothing.
  it.each(["true", "false"])("answers 503 schema_outdated on the routes that read the ledger (NGO_WITHDRAWAL_ENABLED=%s)", async (flag) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 8 }); await seed(db, 8);
    env = { ...env, DB: db, NGO_WITHDRAWAL_ENABLED: flag };
    const before = ["ngos", "lots", "ngo_photos", "ngo_files", "audit_events", "media_upload_intents"].map((table) => db.sql(`SELECT * FROM ${table}`));
    const outdated: Array<[string, Promise<Response>]> = [
      ["GET /ngo/application", call("GET", "/ngo/application", undefined, "owner")],
      ["POST /ngo/application", call("POST", "/ngo/application", { ...APPLICATION, accountId: "other", cnpj: "11444777000161", lotId: "plaza-02" }, "other")],
      ["GET /admin/applications", call("GET", "/admin/applications")],
      ["GET /admin/applications?status", call("GET", "/admin/applications?status=published")],
      ["GET /admin/applications/:id", call("GET", `/admin/applications/${NGO}`)],
      ["POST /ngo/photos", uploadPhoto()],
      ["POST /admin/ngo-photos/:id/decision", call("POST", `/admin/ngo-photos/${PHOTO}/decision`, { accountId: "admin", action: "remove", revision: 1 })],
      ["POST /ngo/application/files", uploadDocument()],
      ["DELETE /ngo/application/files/:id", deleteFile(DOCUMENT)],
      ["POST /ngo/application/files/recover", request("POST", "/ngo/application/files/recover", "owner", ORIGIN, { "X-Vila-Account": "owner" })],
      ...(flag === "true" ? [["POST /admin/ngos/:id/withdraw", withdraw()] as [string, Promise<Response>]] : []),
    ];
    for (const [name, pending] of outdated) {
      const response = await pending;
      expect([name, response.status, await response.json()]).toEqual([name, 503, { error: "schema_outdated" }]);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
    }
    if (flag === "false") expect((await withdraw()).status).toBe(404);
    expect(["ngos", "lots", "ngo_photos", "ngo_files", "audit_events", "media_upload_intents"].map((table) => db.sql(`SELECT * FROM ${table}`))).toEqual(before);
    expect(bucket.keys()).toEqual([PHOTO_KEY, LOGO_KEY, DOCUMENT_KEY].sort());
    expect(logged).not.toHaveBeenCalled();
  });

  it("keeps the session, progress, public reads and account deletion working without the ledger", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 8 }); await seed(db, 8); env = { ...env, DB: db };
    expect((await call("GET", "/me", undefined, "owner")).status).toBe(200);
    expect((await call("GET", "/progress", undefined, "owner")).status).toBe(200);
    for (const path of ["/lots", "/indicators", `/ngos/${NGO}`, `/ngos/${NGO}/logo`, `/ngos/${NGO}/photos/${PHOTO}`]) expect([path, (await publicGet(path)).status]).toEqual([path, 200]);
    // A decision is refused before it writes: its answer would need the ledger.
    await db.prepare("UPDATE ngos SET status='submitted' WHERE id=?").bind(NGO).run();
    await db.prepare("UPDATE lots SET state='application_sent' WHERE ngo_id=?").bind(NGO).run();
    for (const action of ["start_review", "approve", "reject"])
      expect(await error(call("POST", `/admin/applications/${NGO}/decision`, { action, revision: 1, checks: CHECKS, note: "Synthetic note for the test." }))).toBe("schema_outdated");
    expect(db.sql("SELECT status FROM ngos WHERE id=?", NGO)[0].status).toBe("submitted");
    expect(db.sql("SELECT * FROM audit_events")).toEqual([]);
    expect((await call("DELETE", "/me", undefined, "owner")).status).toBe(204);
    expect(db.sql("SELECT applicant_id FROM ngos WHERE id=?", NGO)[0].applicant_id).toBeNull();
    expect(logged).not.toHaveBeenCalled();
  });
});

