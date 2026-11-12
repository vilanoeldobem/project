import { beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";
import { documentBytes } from "./ngo-document-file";

const NGO = "a0000000-0000-4000-8000-000000000001", ORIGIN = "https://play.example";
// A minimal header fixture, deliberately not a claim of a valid/sanitized PDF document.
const PDF = btoa("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n");
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
let db: ReturnType<typeof createD1>, env: Env, objects: Map<string, Uint8Array>;
let bucket: { put: ReturnType<typeof vi.fn>; get: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
const call = (method: string, path: string, body?: unknown, user = "owner", origin: string | null = ORIGIN) => handleApi(new Request(`https://api.example${path}`, {
  method, headers: { ...(origin ? { Origin: origin } : {}), ...(user ? { Cookie: `__Host-vila_session=${user}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env);
const upload = (revision = 1, override: Record<string, unknown> = {}, user = "owner") => call("POST", "/ngo/documents", {
  accountId: user, ngoId: NGO, applicationRevision: revision, label: "Comprovante privado", contentType: "application/pdf", dataBase64: PDF, ...override,
}, user);
const withdraw = (id: string, revision = 2, user = "owner") => call("POST", `/ngo/documents/${id}/withdraw`, { accountId: user, applicationRevision: revision }, user);
const approve = (revision: number) => call("POST", `/admin/applications/${NGO}/decision`, {
  revision, action: "approve", checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
}, "admin");
const content = (id: string, user = "owner") => call("GET", `/ngo/documents/${id}/content`, undefined, user);
const create = async (revision = 1) => {
  const res = await upload(revision); expect(res.status).toBe(201);
  return (await res.json() as { document: { id: string } }).document.id;
};
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
  db = createD1(); objects = new Map();
  bucket = {
    put: vi.fn(async (key: string, value: Uint8Array) => { objects.set(key, value.slice()); }),
    get: vi.fn(async (key: string) => { const bytes = objects.get(key); return bytes ? { body: bytes.slice(), size: bytes.length } : null; }),
    delete: vi.fn(async (key: string) => { objects.delete(key); }),
  };
  env = { DB: db, NGO_DOCUMENTS: bucket as unknown as R2Bucket, NGO_DOCUMENTS_ENABLED: "true", ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: ORIGIN };
  for (const user of ["owner", "other", "admin"]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(user, user, user, user, "Recife", `${user}@example.test`, user === "admin" ? "admin" : "player", "2026-01-01").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(user), user, "2099-01-01").run();
  }
  await db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES(?, 'Exemplo', '11222333000181', 'submitted', 'owner', 'plaza-01')").bind(NGO).run();
  await db.prepare("UPDATE lots SET state='application_sent',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
});

describe("private supporting documents", () => {
  it("returns a revision-bound list, private downloads and minimal audit, including after approval", async () => {
    expect(await (await call("GET", `/ngo/documents?ngoId=${NGO}`)).json()).toEqual({ applicationRevision: 1, documents: [] });
    const id = await create();
    const list = await (await call("GET", `/ngo/documents?ngoId=${NGO}`)).json() as { documents: Record<string, unknown>[] };
    expect(list).toMatchObject({ applicationRevision: 2, documents: [{ id, addedRevision: 2, contentUrl: `/ngo/documents/${id}/content` }] });
    expect(list.documents[0]).not.toHaveProperty("object_key");
    const download = await content(id);
    expect(download.status).toBe(200); expect(await download.text()).toBe(atob(PDF));
    expect(download.headers.get("Content-Disposition")).toBe(`attachment; filename="document-${id}.pdf"`);
    expect(download.headers.get("Cache-Control")).toBe("no-store");
    expect(download.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(download.headers.get("Content-Security-Policy")).toBe("default-src 'none'; sandbox");
    expect(await (await call("HEAD", `/ngo/documents/${id}/content`)).text()).toBe("");
    expect((await approve(1)).status).toBe(409); expect((await approve(2)).status).toBe(200);
    expect((await content(id)).status).toBe(200);
    expect((await call("GET", `/admin/ngo-documents/${id}/content`, undefined, "admin")).status).toBe(200);
    expect(await (await call("GET", `/admin/ngos/${NGO}/documents`, undefined, "admin")).json())
      .toMatchObject({ applicationRevision: 2, documents: [{ contentUrl: `/admin/ngo-documents/${id}/content` }] });
    const profile = await (await call("GET", `/ngos/${NGO}`, undefined, "", null)).text();
    for (const secret of [id, "Comprovante privado", "ngo-documents", "documents"]) expect(profile).not.toContain(secret);
    expect((await call("GET", `/ngos/${NGO}/documents/${id}`, undefined, "", null)).status).toBe(404);
    expect((await call("GET", `/ngos/${NGO}/photos/${id}`, undefined, "", null)).status).toBe(404);
    expect(JSON.parse(db.sql("SELECT detail FROM audit_events WHERE action='ngo.document.upload'")[0].detail as string))
      .toEqual({ documentId: id, revision: 2 });
  });

  it("checks origin, account, session, verified ownership and admin role before R2 access", async () => {
    expect((await upload(1, {}, "")).status).toBe(401);
    expect((await upload(1, {}, "other")).status).toBe(404);
    expect((await upload(1, { accountId: "other" })).status).toBe(409);
    for (const origin of [null, `${ORIGIN}.evil`]) expect((await call("POST", "/ngo/documents", {}, "owner", origin)).status).toBe(403);
    await db.prepare("UPDATE users SET verified_at=NULL WHERE id='owner'").run();
    expect((await upload()).status).toBe(403); expect(bucket.put).not.toHaveBeenCalled();
    await db.prepare("UPDATE users SET verified_at='2026-01-01' WHERE id='owner'").run();
    const id = await create();
    expect((await content(id, "other")).status).toBe(404); expect((await content(id, "")).status).toBe(401);
    expect((await call("GET", `/ngo/documents?ngoId=${NGO}`, undefined, "other")).status).toBe(404);
    expect((await call("GET", `/admin/ngo-documents/${id}/content`)).status).toBe(403);
    expect((await call("GET", `/admin/ngos/${NGO}/documents`)).status).toBe(403);
    expect((await withdraw(id, 2, "other")).status).toBe(404);
    expect(bucket.get).not.toHaveBeenCalled(); expect(bucket.delete).not.toHaveBeenCalled();
    await db.prepare("DELETE FROM users WHERE id='owner'").run();
    expect((await content(id)).status).toBe(401);
    expect((await call("GET", `/admin/ngo-documents/${id}/content`, undefined, "admin")).status).toBe(200);
  });

  it.each(["under_review", "published"])("freezes upload and withdrawal while %s", async (status) => {
    const id = await create(); await db.prepare("UPDATE ngos SET status=? WHERE id=?").bind(status, NGO).run();
    expect(await (await upload(2)).json()).toEqual({ error: "documents_locked" });
    expect(await (await withdraw(id)).json()).toEqual({ error: "documents_locked" });
    expect((await content(id)).status).toBe(200); expect(objects.size).toBe(1);
  });

  it("retains active evidence across resubmission, with immutable added revision", async () => {
    const id = await create();
    await db.prepare("UPDATE ngos SET status='changes_requested',revision=3 WHERE id=?").bind(NGO).run();
    const second = await create(3);
    await db.prepare("UPDATE ngos SET status='submitted',revision=5 WHERE id=?").bind(NGO).run();
    const list = await (await call("GET", `/ngo/documents?ngoId=${NGO}`)).json() as { applicationRevision: number; documents: unknown[] };
    expect(list.documents).toHaveLength(2);
    expect(list).toMatchObject({ applicationRevision: 5, documents: expect.arrayContaining([
      expect.objectContaining({ id, addedRevision: 2 }), expect.objectContaining({ id: second, addedRevision: 4 }),
    ]) });
    expect((await withdraw(id, 5)).status).toBe(200); expect((await content(id)).status).toBe(404);
    expect((await withdraw(id, 6)).status).toBe(404);
    expect(db.sql("SELECT action FROM audit_events WHERE action='ngo.document.withdraw'")).toHaveLength(1);
  });

  it.each(["upload", "withdraw"])("rejects %s if admin approval wins after its read", async (kind) => {
    const id = kind === "withdraw" ? await create() : "", revision = id ? 2 : 1;
    const paused = pauseNextBatch(); const pending = id ? withdraw(id, revision) : upload(revision);
    await paused.ready; expect((await approve(revision)).status).toBe(200); paused.release();
    expect((await pending).status).toBe(409);
    expect(objects.size).toBe(id ? 1 : 0);
    expect(db.sql("SELECT * FROM audit_events WHERE action=?", `ngo.document.${kind}`)).toHaveLength(0);
    expect(db.sql("SELECT revision,status FROM ngos WHERE id=?", NGO)[0]).toMatchObject({ revision, status: "published" });
  });

  it.each(["upload", "withdraw"])("rejects an approval already in flight when %s wins", async (kind) => {
    const id = kind === "withdraw" ? await create() : "", revision = id ? 2 : 1;
    const paused = pauseNextBatch(); const pending = approve(revision);
    await paused.ready; expect((await (id ? withdraw(id, revision) : upload(revision))).status).toBe(id ? 200 : 201); paused.release();
    expect(await (await pending).json()).toEqual({ error: "stale_revision" });
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.approve'")).toHaveLength(0);
    expect(db.sql("SELECT revision,status FROM ngos WHERE id=?", NGO)[0]).toMatchObject({ revision: revision + 1, status: "submitted" });
    expect(db.sql("SELECT state FROM lots WHERE id='plaza-01'")[0].state).toBe("application_sent");
  });

  it("rejects an exact-status race even when admin leaves revision unchanged", async () => {
    const paused = pauseNextBatch(); const pending = upload(); await paused.ready;
    expect((await call("POST", `/admin/applications/${NGO}/decision`, { action: "request_changes", revision: 1, note: "Favor revisar os dados" }, "admin")).status).toBe(200);
    paused.release(); expect((await pending).status).toBe(409); expect(objects.size).toBe(0);
    expect(db.sql("SELECT * FROM ngo_documents")).toHaveLength(0);
  });

  it("atomically caps competing uploads and audits only the winner, then reuses a withdrawn slot", async () => {
    for (let revision = 1; revision <= 9; revision++) await create(revision);
    const batch = db.batch.bind(db); let queue = Promise.resolve();
    db.batch = ((statements: Parameters<typeof db.batch>[0]) => {
      const next = queue.then(() => batch(statements)); queue = next.then(() => {}, () => {}); return next;
    }) as typeof db.batch;
    expect((await Promise.all([upload(10), upload(10)])).map((r) => r.status).sort()).toEqual([201, 409]);
    expect(objects.size).toBe(10); expect(db.sql("SELECT * FROM ngo_documents")).toHaveLength(10);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.document.upload'")).toHaveLength(10);
    bucket.put.mockClear(); expect(await (await upload(11)).json()).toEqual({ error: "document_limit" }); expect(bucket.put).not.toHaveBeenCalled();
    const id = db.sql("SELECT id FROM ngo_documents LIMIT 1")[0].id as string;
    expect((await withdraw(id, 11)).status).toBe(200); await create(12);
    expect(db.sql("SELECT * FROM ngo_documents WHERE removed_revision IS NULL")).toHaveLength(10);
  });

  it("rolls back revision/audit on SQL failure and denies failed-cleanup orphan bytes", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("CREATE TRIGGER fail_document BEFORE INSERT ON ngo_documents BEGIN SELECT RAISE(FAIL,'test insert failure'); END");
    expect((await upload()).status).toBe(500); expect(objects.size).toBe(0);
    bucket.delete.mockRejectedValueOnce(new Error("delete failed"));
    expect((await upload()).status).toBe(500); expect(objects.size).toBe(1);
    const orphanId = [...objects.keys()][0].split("/").at(-1)!;
    expect((await content(orphanId)).status).toBe(404);
    expect(db.sql("SELECT revision FROM ngos WHERE id=?", NGO)[0].revision).toBe(1);
    expect(db.sql("SELECT * FROM audit_events")).toHaveLength(0);
    await db.exec("DROP TRIGGER fail_document"); objects.clear();
    bucket.put.mockRejectedValueOnce(new Error("put failed")); expect((await upload()).status).toBe(500);
    expect(db.sql("SELECT * FROM ngo_documents")).toHaveLength(0);
    const id = await create(); bucket.delete.mockRejectedValueOnce(new Error("delete failed"));
    expect((await withdraw(id)).status).toBe(200); expect(objects.size).toBe(1);
    expect((await content(id)).status).toBe(404);
    expect((await call("GET", `/admin/ngo-documents/${id}/content`, undefined, "admin")).status).toBe(404);
    expect(await (await call("GET", `/ngo/documents?ngoId=${NGO}`)).json()).toEqual({ applicationRevision: 3, documents: [] });
    log.mockRestore();
  });

  it("fails closed for flags, missing storage and missing bytes", async () => {
    const id = await create(); env.NGO_DOCUMENTS_ENABLED = "false";
    expect((await content(id)).status).toBe(404); expect((await upload(2)).status).toBe(404);
    env.NGO_DOCUMENTS_ENABLED = "true"; env.NGO_DOCUMENTS = undefined;
    expect((await content(id)).status).toBe(503);
    env.NGO_DOCUMENTS = bucket as unknown as R2Bucket; objects.clear(); expect((await content(id)).status).toBe(404);
    env.ACCOUNTS_ENABLED = "false"; expect((await content(id)).status).toBe(404);
  });

  it("rejects malformed, oversized and unsupported input before storage IO", async () => {
    for (const override of [{ label: " " }, { label: "x".repeat(121) }, { applicationRevision: 0 }, { applicationRevision: 1.2 }, { contentType: "image/svg+xml" }, { contentType: "image/webp" }, { dataBase64: "!bad" }, { dataBase64: btoa("<html>bad</html>") }, { dataBase64: btoa("%PDF-1.7\ntruncated") }])
      expect((await upload(1, override)).status).toBe(400);
    expect((await upload(2)).status).toBe(409);
    expect((await upload(1, { dataBase64: "A".repeat(3 * 1024 * 1024) })).status).toBe(413);
    expect(bucket.put).not.toHaveBeenCalled();
    expect((await upload(1, { contentType: "image/png", dataBase64: PNG })).status).toBe(201);
  });
});

it("bounds PDF input without claiming PDF decoding, sanitization or malware scanning", () => {
  const limit = 2 * 1024 * 1024;
  const nearLimit = "%PDF-1.7\n" + " ".repeat(limit - 14) + "%%EOF";
  expect(documentBytes(btoa(nearLimit), "application/pdf")).toHaveLength(limit);
  expect(() => documentBytes(btoa(nearLimit + " "), "application/pdf")).toThrow("document_too_large");
  expect(() => documentBytes(PDF, "image/png")).toThrow("invalid_document");
  expect(() => documentBytes(PNG, "application/pdf")).toThrow("invalid_document");
});
