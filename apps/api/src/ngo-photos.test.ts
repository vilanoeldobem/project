import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";
import { checkPhoto } from "@vila/shared/accounts/photos";
import { png, pngChunk, jpeg, text } from "../test/fixtures.mjs";

const NGO = "a0000000-0000-4000-8000-000000000001";
const UNKNOWN = "a0000000-0000-4000-8000-000000000002";
const ORIGIN = "https://play.example";
// Real 1x1 PNG, sanitized by the same pipeline as canonical application logos.
const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC";
let db: ReturnType<typeof createD1>, env: Env;
let objects: Map<string, Uint8Array>;
type PhotoPut = (key: string, value: Uint8Array, options?: R2PutOptions) => Promise<{ etag: string } | null>;
let bucket: { put: Mock<PhotoPut>; get: ReturnType<typeof vi.fn>; head: ReturnType<typeof vi.fn>; delete: ReturnType<typeof vi.fn> };
const call = (method: string, path: string, body?: unknown, user = "owner", origin: string | null = ORIGIN) => handleApi(new Request(`https://api.example${path}`, {
  method, headers: { ...(origin ? { Origin: origin } : {}), ...(user ? { Cookie: `__Host-vila_session=${user}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
  body: body === undefined ? undefined : JSON.stringify(body),
}), env);
const upload = (override: Record<string, unknown> = {}, user = "owner") => handleApi(new Request(`https://api.example/ngo/photos?ngoId=${override.ngoId ?? NGO}&position=${override.position ?? 0}`, {
  method: "POST", headers: { Origin: ORIGIN, Cookie: `__Host-vila_session=${user}`, "X-Vila-Account": String(override.accountId ?? user), "Content-Type": String(override.contentType ?? "image/png"), "X-Vila-Caption": override.encodedCaption === undefined ? encodeURIComponent(String(override.caption ?? "Projeto de leitura")) : String(override.encodedCaption) },
  body: (override.bytes ?? Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0))) as BodyInit,
}), env);
const decision = async (id: string, action = "approve", revision = 1, user = "admin") => {
  if (action === "approve") await call("GET", `/admin/ngo-photos/${id}/content`, undefined, user);
  return call("POST", `/admin/ngo-photos/${id}/decision`, { accountId: user, action, revision }, user);
};
const photo = async () => {
  const res = await upload(); expect(res.status).toBe(201);
  return (await res.json() as { photo: { id: string } }).photo.id;
};
const publicPath = (id: string) => `/ngos/${NGO}/photos/${id}`;
const gallery = async () => (await (await call("GET", `/ngos/${NGO}`, undefined, "")).json() as { ngo: { photos: Array<Record<string, unknown>> } }).ngo.photos;

beforeEach(async () => {
  db = createD1(); objects = new Map();
  const etags = new Map<string,string>(); let sequence=0;
  bucket = {
    put: vi.fn(async (key: string, value: Uint8Array, options?: R2PutOptions) => {
      const condition = options?.onlyIf as R2Conditional | undefined;
      if (condition?.etagMatches && (!objects.has(key) || etags.get(key)!==condition.etagMatches)) return null;
      objects.set(key, value.slice()); const etag=String(++sequence); etags.set(key,etag); return {etag};
    }),
    get: vi.fn(async (key: string) => { const value = objects.get(key); return value ? { body: value.slice(), size: value.length } : null; }),
    head: vi.fn(async (key: string) => objects.has(key) ? { size: objects.get(key)!.length } : null),
    delete: vi.fn(async (key: string | string[]) => { for (const item of Array.isArray(key) ? key : [key]) objects.delete(item); }),
  };
  env = { DB: db, FILES: bucket as unknown as R2Bucket, NGO_PHOTOS_ENABLED: "true", ACCOUNTS_ENABLED: "true", ALLOWED_ORIGINS: ORIGIN };
  for (const user of ["owner", "other", "admin"]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(user, user, user, user, "Recife", `${user}@example.test`, user === "admin" ? "admin" : "player", "2026-01-01").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(user), user, "2099-01-01").run();
  }
  await db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES(?, 'Exemplo', '11222333000181', 'published', 'owner', 'plaza-01')").bind(NGO).run();
  await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
});

describe("private NGO photos and public approval", () => {
  it("uploads pending, previews privately, approves, publishes only safe metadata and revokes", async () => {
    const id = await photo();
    expect(objects.size).toBe(1); expect(await gallery()).toEqual([]);
    expect((await call("GET", publicPath(id), undefined, "")).status).toBe(404);
    const owner = await call("GET", `/ngo/photos?ngoId=${NGO}`);
    expect(await owner.json()).toMatchObject({ photos: [{ id, status: "pending", revision: 1, previewUrl: `/ngo/photos/${id}/content` }] });
    expect((await call("GET", `/ngo/photos/${id}/content`)).status).toBe(200);
    expect((await call("GET", `/admin/ngos/${NGO}/photos`, undefined, "admin")).status).toBe(200);
    expect((await call("GET", `/admin/ngo-photos/${id}/content`, undefined, "admin")).status).toBe(200);
    expect((await decision(id)).status).toBe(200);
    expect(await gallery()).toEqual([{ id, url: publicPath(id), caption: "Projeto de leitura", position: 0 }]);
    env.ACCOUNTS_ENABLED = "false";
    const image = await call("GET", publicPath(id), undefined, "", null);
    expect(image.status).toBe(200); expect(image.headers.get("Cache-Control")).toBe("no-store");
    expect(image.headers.get("X-Content-Type-Options")).toBe("nosniff"); expect(image.headers.get("Content-Type")).toBe("image/png");
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)));
    expect(await (await call("HEAD", publicPath(id), undefined, "")).text()).toBe("");
    env.ACCOUNTS_ENABLED = "true";
    expect((await decision(id, "remove", 2)).status).toBe(200);
    expect(await gallery()).toEqual([]); expect(objects.size).toBe(0);
    expect((await call("GET", publicPath(id), undefined, "")).status).toBe(404);
    expect(db.sql("SELECT action FROM audit_events WHERE action IN ('ngo.photo.approve','ngo.photo.remove') ORDER BY rowid").map((r) => r.action)).toEqual(["ngo.photo.approve", "ngo.photo.remove"]);
  });

  it("enforces account, verified owner, exact origin, admin and self-review before writes", async () => {
    expect((await upload({}, "")).status).toBe(401);
    expect((await upload({}, "other")).status).toBe(404);
    expect((await upload({ accountId: "other" })).status).toBe(409);
    expect((await call("POST", "/ngo/photos", {}, "owner", `${ORIGIN}.evil`)).status).toBe(403);
    await db.prepare("UPDATE users SET verified_at=NULL WHERE id='owner'").run();
    expect((await upload()).status).toBe(403); expect(bucket.put).not.toHaveBeenCalled();
    await db.prepare("UPDATE users SET verified_at='2026-01-01' WHERE id='owner'").run();
    const id = await photo();
    expect((await call("GET", `/ngo/photos/${id}/content`, undefined, "other")).status).toBe(404);
    expect((await call("GET", `/ngo/photos?ngoId=${NGO}`, undefined, "other")).status).toBe(404);
    expect((await decision(id, "approve", 1, "owner")).status).toBe(403);
    await db.prepare("UPDATE users SET role='admin' WHERE id='owner'").run();
    for (const action of ["approve", "reject", "remove"]) {
      expect(await (await decision(id, action, 1, "owner")).json()).toEqual({ error: "self_review" });
    }
    expect(db.sql("SELECT * FROM audit_events WHERE action!='ngo.photo.upload'")).toHaveLength(0);
  });

  it.each(["pending", "rejected", "removed"])("hides %s photos like unknown ids", async (status) => {
    const id = await photo(); await db.prepare("UPDATE ngo_photos SET status=? WHERE id=?").bind(status, id).run();
    const hidden = await call("GET", publicPath(id), undefined, "");
    expect(hidden.status).toBe(404); expect(hidden.headers.get("Cache-Control")).toBe("no-store");
    expect(await hidden.json()).toEqual(await (await call("GET", publicPath(UNKNOWN), undefined, "")).json());
    expect(await gallery()).toEqual([]);
  });

  it("requires real published NGO/lot association and matching NGO/photo id", async () => {
    const id = await photo(); await decision(id);
    for (const status of ["submitted", "under_review", "changes_requested", "rejected"]) {
      await db.prepare("UPDATE ngos SET status=? WHERE id=?").bind(status, NGO).run();
      expect((await call("GET", publicPath(id))).status).toBe(404);
    }
    await db.prepare("UPDATE ngos SET status='published' WHERE id=?").bind(NGO).run();
    for (const state of ["available", "application_sent", "under_review"]) {
      await db.prepare("UPDATE lots SET state=? WHERE id='plaza-01'").bind(state).run();
      expect((await call("GET", publicPath(id))).status).toBe(404);
    }
    await db.prepare("UPDATE lots SET ngo_id=NULL WHERE id='plaza-01'").run();
    expect((await call("GET", publicPath(id))).status).toBe(404);
    await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-02'").bind(NGO).run();
    expect((await call("GET", publicPath(id))).status).toBe(200);
    expect((await call("GET", `/ngos/${UNKNOWN}/photos/${id}`)).status).toBe(404);
  });

  it("has a deterministic public order and never leaks storage/review metadata", async () => {
    const first = await photo(); const res = await upload({ position: 1, caption: "Segundo" });
    const second = (await res.json() as { photo: { id: string } }).photo.id;
    await decision(second); await decision(first);
    expect((await gallery()).map((p) => p.id)).toEqual([first, second]);
    for (const entry of await gallery()) expect(Object.keys(entry).sort()).toEqual(["caption", "id", "position", "url"]);
  });

  it("fails closed for flags, missing storage and missing approved objects", async () => {
    const id = await photo(); env.NGO_PHOTOS_ENABLED = "false";
    expect((await upload()).status).toBe(404); expect(await gallery()).toEqual([]);
    expect((await call("GET", publicPath(id))).status).toBe(404);
    env.NGO_PHOTOS_ENABLED = "true"; env.FILES = undefined;
    expect((await upload()).status).toBe(503);
    env.FILES = bucket as unknown as R2Bucket; objects.clear();
    expect(await (await decision(id)).json()).toEqual({ error: "photo_object_missing" });
    expect(db.sql("SELECT status FROM ngo_photos")[0].status).toBe("pending");
  });

  it("atomically caps competing uploads, avoids storage IO at cap, and frees a removed slot", async () => {
    for (let i = 0; i < 9; i++) await photo();
    const results = await Promise.all([upload(), upload()]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(db.sql("SELECT COUNT(*) AS n FROM ngo_photos")[0].n).toBe(10); expect(objects.size).toBe(10);
    bucket.put.mockClear(); expect((await upload()).status).toBe(409); expect(bucket.put).not.toHaveBeenCalled();
    const id = db.sql("SELECT id FROM ngo_photos LIMIT 1")[0].id as string;
    await decision(id, "remove"); expect((await upload()).status).toBe(201);
    expect(db.sql("SELECT COUNT(*) AS n FROM ngo_photos WHERE status!='removed'")[0].n).toBe(10);
  });

  it("guards audit with a unique decision token when two reviews read the same revision", async () => {
    const id = await photo();
    // Serialize actual SQLite transactions, as D1 does, while allowing both callers' reads before them.
    const batch = db.batch.bind(db); let queue = Promise.resolve();
    db.batch = ((statements: Parameters<typeof db.batch>[0]) => {
      const next = queue.then(() => batch(statements)); queue = next.then(() => {}, () => {}); return next;
    }) as typeof db.batch;
    const responses = await Promise.all([decision(id), decision(id)]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.photo.approve'")).toHaveLength(1);
    expect((await decision(id)).status).toBe(409);
    expect(db.sql("SELECT * FROM audit_events WHERE action='ngo.photo.approve'")).toHaveLength(1);
  });

  it("compensates a failed metadata insert and never exposes bytes after a failed removal cleanup", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("CREATE TRIGGER fail_photo BEFORE INSERT ON ngo_photos BEGIN SELECT RAISE(FAIL, 'test insert failure'); END");
    expect((await upload()).status).toBe(500); expect(objects.size).toBe(0);
    await db.exec("DROP TRIGGER fail_photo");
    bucket.put.mockRejectedValueOnce(new Error("storage unavailable"));
    expect((await upload()).status).toBe(500); expect(db.sql("SELECT * FROM ngo_photos WHERE status!='removed'")).toHaveLength(0);
    const id = await photo(); await decision(id);
    bucket.delete.mockRejectedValueOnce(new Error("storage unavailable"));
    expect((await decision(id, "remove", 2)).status).toBe(503); expect(objects.size).toBe(1);
    expect((await call("GET", publicPath(id))).status).toBe(404);
    expect((await call("GET", `/ngo/photos/${id}/content`)).status).toBe(404);
    expect(await gallery()).toEqual([]); log.mockRestore();
  });

  it("rejects invalid metadata, forged MIME and malformed/oversized bodies without storage writes", async () => {
    for (const data of [{ position: -1 }, { position: 1.5 }, { caption: "x".repeat(241) }, { contentType: "image/jpeg" }, { contentType: "image/svg+xml" }, { encodedCaption: "%bad" }, { bytes: new TextEncoder().encode("<html>bad</html>") }, { encodedCaption: "a".repeat(3001) }, { contentType: "image/webp" }])
      expect((await upload(data)).status).toBe(400);
    expect((await upload({ bytes: new Uint8Array(2 * 1024 * 1024 + 1) })).status).toBe(413);
    expect(bucket.put).not.toHaveBeenCalled();
  });
});


it("reuses canonical image sanitization for PNG/JPEG and bounds gallery dimensions", async () => {
  for (const [contentType, bytes] of [["image/png", png(128, 128, [pngChunk("tEXt", "private location")])], ["image/jpeg", jpeg(128, 128, "private location")]] as const) {
    const response = await upload({ contentType, bytes });
    expect(response.status).toBe(201);
    const saved = [...objects.values()].at(-1)!;
    expect(text(saved)).not.toContain("private location");
    expect(saved.length).toBeLessThan(bytes.length);
  }
  expect([...objects.keys()].every((key) => key.startsWith(`ngo-photos/${NGO}/`))).toBe(true);
  expect(checkPhoto("image/jpeg", jpeg(4096, 4096))).toEqual({ ok: false, error: "image_too_large" });
  expect(checkPhoto("image/jpeg", jpeg(4097, 1))).toEqual({ ok: false, error: "image_too_large" });
  expect(checkPhoto("image/jpeg", jpeg(4000, 4000)).ok).toBe(true);
});

it("freezes uploads and photo decisions while account deletion is pending", async () => {
  const id = await photo();
  await db.prepare("UPDATE users SET files_deleting=1 WHERE id='owner'").run();
  expect(await (await upload()).json()).toEqual({ error: "account_deleting" });
  expect((await decision(id)).status).toBe(409);
  expect(db.sql("SELECT status FROM ngo_photos")[0].status).toBe("pending");
});


it("account deletion erases all owned gallery, including approved public photos", async () => {
  const approved = await photo(); await decision(approved);
  await photo();
  const rejected = await photo(); await decision(rejected, "reject");
  const removed = await photo();
  await db.prepare("UPDATE ngo_photos SET status='removed' WHERE id=?").bind(removed).run();
  expect(objects.size).toBe(3);
  expect((await call("DELETE", "/me")).status).toBe(204);
  expect(db.sql("SELECT id FROM ngo_photos")).toEqual([]);
  expect(objects.size).toBe(0);
  expect((await call("GET", publicPath(approved), undefined, "")).status).toBe(404);
  expect(db.sql("SELECT applicant_id FROM ngos")[0].applicant_id).toBeNull();
});

it("account deletion removes even approved photos when the NGO is unpublished", async () => {
  const approved = await photo(); await decision(approved);
  await db.prepare("UPDATE ngos SET status='under_review' WHERE id=?").bind(NGO).run();
  expect((await call("DELETE", "/me")).status).toBe(204);
  expect(objects.size).toBe(0);
  expect(db.sql("SELECT id FROM ngo_photos")).toEqual([]);
});

const ownerRemove = (id: string, user = "owner") => handleApi(new Request(`https://api.example/ngo/photos/${id}`, {
  method: "DELETE", headers: { Origin: ORIGIN, Cookie: `__Host-vila_session=${user}`, "X-Vila-Account": user },
}), env);

it("keeps the public profile available when gallery storage or schema is absent", async () => {
  env.FILES = undefined; expect(await gallery()).toEqual([]);
  env.FILES = bucket as unknown as R2Bucket;
  db.sql("DROP TABLE ngo_photos"); expect(await gallery()).toEqual([]);
});

it("requires a GET receipt by the deciding admin, and HEAD never opens a body or grants review", async () => {
  const id = await photo(); bucket.get.mockClear(); bucket.head.mockClear();
  expect((await call("HEAD", `/admin/ngo-photos/${id}/content`, undefined, "admin")).status).toBe(200);
  expect(bucket.get).not.toHaveBeenCalled(); expect(bucket.head).toHaveBeenCalledTimes(1);
  const approve = () => call("POST", `/admin/ngo-photos/${id}/decision`, {accountId:"admin",action:"approve",revision:1}, "admin");
  expect(await (await approve()).json()).toEqual({error:"photo_review_required"});
  await call("GET", `/ngo/photos/${id}/content`);
  expect((await approve()).status).toBe(409);
  await call("GET", `/admin/ngo-photos/${id}/content`, undefined, "admin");
  expect((await approve()).status).toBe(200);
  expect(db.sql("SELECT action FROM audit_events ORDER BY rowid").map((r) => r.action)).toEqual(["ngo.photo.upload","ngo.photo.read","ngo.photo.approve"]);
});

it("allows owner erasure with uploads off and retries failed physical deletion without duplicate audits", async () => {
  const id = await photo(); await decision(id);
  expect((await ownerRemove(id,"other")).status).toBe(404);
  env.NGO_PHOTOS_ENABLED="false";
  bucket.delete.mockRejectedValueOnce(new Error("unavailable"));
  expect(await (await ownerRemove(id)).json()).toEqual({error:"photo_cleanup_pending"});
  expect(db.sql("SELECT status,caption,cleanup_pending FROM ngo_photos WHERE id=?",id)[0]).toEqual({status:"removed",caption:"",cleanup_pending:1});
  const queue = await call("GET","/admin/ngo-photos",undefined,"admin");
  expect(await queue.json()).toMatchObject({photos:[{id,cleanupPending:true,previewUrl:null}]});
  expect((await ownerRemove(id)).status).toBe(200); expect(objects.size).toBe(0);
  expect((await ownerRemove(id)).status).toBe(200);
  expect(db.sql("SELECT id FROM audit_events WHERE action='ngo.photo.remove'")).toHaveLength(1);
});

it("rejection erases bytes, frees the quota and can retry cleanup", async () => {
  for(let i=0;i<10;i++) await photo();
  const id=String(db.sql("SELECT id FROM ngo_photos LIMIT 1")[0].id);
  bucket.delete.mockRejectedValueOnce(new Error("unavailable"));
  expect((await decision(id,"reject")).status).toBe(503);
  expect((await upload()).status).toBe(201);
  expect((await decision(id,"reject")).status).toBe(200);
  expect(db.sql("SELECT id FROM audit_events WHERE action='ngo.photo.reject'")).toHaveLength(1);
  expect((await call("GET",`/ngo/photos/${id}/content`)).status).toBe(404);
});

it.each(["rejected","under_review"])("blocks gallery uploads in %s before reading/writing storage", async (status) => {
  await db.prepare("UPDATE ngos SET status=? WHERE id=?").bind(status,NGO).run();
  expect(await (await upload()).json()).toEqual({error:"application_locked"});
  expect(bucket.put).not.toHaveBeenCalled();
});

it("applies upload rate limiting before R2 and removes JPEG data after the first EOI", async () => {
  env.FILE_LIMITER={limit:async()=>({success:false})};
  expect((await upload()).status).toBe(429); expect(bucket.put).not.toHaveBeenCalled();
  env.FILE_LIMITER=undefined;
  const original=jpeg(), suffix=new TextEncoder().encode("private trailing metadata");
  const body=new Uint8Array(original.length+suffix.length+2); body.set(original);body.set(suffix,original.length);body.set([255,217],body.length-2);
  expect((await upload({contentType:"image/jpeg",bytes:body})).status).toBe(201);
  expect(text([...objects.values()][0])).not.toContain("private trailing metadata");
});

function photoGate() {
  let enter!:()=>void,release!:()=>void;
  const ready=new Promise<void>((resolve)=>{enter=resolve;});
  const wait=new Promise<void>((resolve)=>{release=resolve;});
  return {enter,release,ready,wait};
}

it("owner deletion cancels an in-flight conditional put without recreating personal bytes", async () => {
  const gate=photoGate(),put=bucket.put.getMockImplementation()!;
  bucket.put.mockImplementation(async (...args: Parameters<PhotoPut>) => {
    if(args[2]?.onlyIf){gate.enter();await gate.wait;}
    return put(...args);
  });
  const pending=upload();await gate.ready;
  const id=String(db.sql("SELECT id FROM ngo_photos")[0].id);
  expect([...objects.values()][0].length).toBe(0);
  expect((await ownerRemove(id)).status).toBe(200);
  gate.release();expect((await pending).status).toBe(409);
  expect(objects.size).toBe(0);
  expect(db.sql("SELECT status,cleanup_pending FROM ngo_photos")[0]).toEqual({status:"removed",cleanup_pending:0});
});

it("account erasure cancels an in-flight conditional put and leaves no personal bytes", async () => {
  const gate=photoGate(),put=bucket.put.getMockImplementation()!;
  bucket.put.mockImplementation(async (...args: Parameters<PhotoPut>) => {
    if(args[2]?.onlyIf){gate.enter();await gate.wait;}
    return put(...args);
  });
  const pending=upload();await gate.ready;
  expect((await call("DELETE","/me")).status).toBe(204);
  gate.release();expect((await pending).status).toBe(409);
  expect(objects.size).toBe(0);expect(db.sql("SELECT id FROM ngo_photos")).toEqual([]);
});

it("keeps a crashed staging upload discoverable and deletable without publishing its bytes", async () => {
  const key=`ngo-photos/${NGO}/${UNKNOWN}`;
  await db.prepare("INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position,upload_pending) VALUES(?,?,?,'image/png',100,'',0,1)").bind(UNKNOWN,NGO,key).run();
  objects.set(key,png());
  expect((await call("GET",`/ngo/photos/${UNKNOWN}/content`)).status).toBe(404);
  expect(await (await call("GET","/admin/ngo-photos",undefined,"admin")).json()).toMatchObject({photos:[{id:UNKNOWN,uploadPending:true,previewUrl:null}]});
  expect((await ownerRemove(UNKNOWN)).status).toBe(200);expect(objects.size).toBe(0);
});

it("preserves a committed photo after a lost D1 acknowledgement", async () => {
  const batch=db.batch.bind(db);
  db.batch=async (statements)=>{await batch(statements);throw new Error("lost acknowledgement");};
  expect((await upload()).status).toBe(201);
  expect(objects.size).toBe(1);
  expect(db.sql("SELECT upload_pending,status FROM ngo_photos")[0]).toEqual({upload_pending:0,status:"pending"});
  expect(db.sql("SELECT id FROM audit_events WHERE action='ngo.photo.upload'")).toHaveLength(1);
});

it("hides public gallery immediately when account erasure fails and remains retryable", async () => {
  const id=await photo();await decision(id);
  bucket.delete.mockRejectedValueOnce(new Error("unavailable"));
  const log=vi.spyOn(console,"error").mockImplementation(()=>{});
  expect((await call("DELETE","/me")).status).toBe(500);
  expect(await gallery()).toEqual([]);
  expect((await call("GET",publicPath(id),undefined,"")).status).toBe(404);
  expect((await call("DELETE","/me")).status).toBe(204);
  expect(objects.size).toBe(0);log.mockRestore();
});

it("does not let completed rejection history hide active owner photos", async () => {
  for(let i=0;i<101;i++) await db.prepare("INSERT INTO ngo_photos(id,ngo_id,object_key,content_type,byte_size,caption,position,status) VALUES(?,?,?,'image/png',10,'',0,'rejected')").bind(`history-${i}`,NGO,`history-${i}`).run();
  const id=await photo();
  expect(await (await call("GET",`/ngo/photos?ngoId=${NGO}`)).json()).toMatchObject({photos:[{id,status:"pending"}]});
  expect((await ownerRemove(id)).status).toBe(200);
});
