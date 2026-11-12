/**
 * End-to-end API tests for NGO application files in R2 (IMPL-0017): real SQLite with the real migrations
 * (test/d1.mjs) and an in-memory bucket (test/r2.mjs).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { FILE_RULES } from "@vila/shared/accounts/files";

import { devVar, productionVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { jpeg, pdf, png, pngChunk, text } from "../test/fixtures.mjs";
import { createR2 } from "../test/r2.mjs";
import { type Env, handleApi } from "./api";

const ORIGIN = "https://play.example";
let db: ReturnType<typeof createD1>;
let r2: ReturnType<typeof createR2>;
let env: Env;

type Signed = { cookie: string; user: { id: string } };

const send = async (method: string, path: string, init: { body?: BodyInit; headers?: Record<string, string>; cookie?: string; origin?: string | null } = {}) => {
  const headers: Record<string, string> = { ...init.headers };
  const origin = init.origin === undefined ? ORIGIN : init.origin;
  if (origin) headers.Origin = origin;
  if (init.cookie) headers.Cookie = init.cookie;
  const res = await handleApi(new Request(`https://api.example${path}`, { method, headers, body: init.body }), env);
  return res;
};

const call = async (method: string, path: string, body?: unknown, cookie?: string, origin: string | null = ORIGIN) => {
  const res = await send(method, path, { body: body === undefined ? undefined : JSON.stringify(body), headers: body === undefined ? {} : { "Content-Type": "application/json" }, cookie, origin });
  const raw = await res.text();
  return { status: res.status, body: raw ? JSON.parse(raw) : null, headers: res.headers };
};

const tokenOf = (devLink: string) => decodeURIComponent(new URLSearchParams(new URL(devLink).hash.slice(1)).get("login")!);

async function signUp(nickname = "ana_lima", email = "ana@example.com"): Promise<Signed> {
  const r = await call("POST", "/auth/register", { name: "Ana Lima", nickname, city: "Recife", email });
  const v = await call("POST", "/auth/verify", { token: tokenOf(r.body.devLink) });
  return { cookie: v.headers.get("Set-Cookie")!.split(";")[0], user: v.body.user };
}

async function asAdmin(): Promise<Signed> {
  const a = await signUp("admin_vila", "admin@example.com");
  db.sql("UPDATE users SET role = 'admin' WHERE nickname = 'admin_vila'");
  return a;
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

/** Signs up and applies; returns the session and the application id. */
async function applicant(nickname = "ana_lima", email = "ana@example.com", app: object = APP) {
  const s = await signUp(nickname, email);
  const r = await call("POST", "/ngo/application", { accountId: s.user.id, ...app }, s.cookie);
  expect(r.status).toBe(201);
  return { ...s, ngoId: r.body.application.id as string };
}

type UploadOptions = { account?: string | null; cookie?: string; origin?: string | null; length?: number | null };
async function upload(s: Signed, kind: string, bytes: Uint8Array, type: string, o: UploadOptions = {}) {
  const headers: Record<string, string> = { "Content-Type": type };
  const account = o.account === undefined ? s.user.id : o.account;
  if (account) headers["X-Vila-Account"] = account;
  const length = o.length === undefined ? bytes.length : o.length;
  if (length !== null) headers["Content-Length"] = String(length);
  const res = await send("POST", `/ngo/application/files?kind=${kind}`, { body: bytes, headers, cookie: o.cookie ?? s.cookie, origin: o.origin });
  return { status: res.status, body: await res.json() as any, headers: res.headers };
}

const remove = (s: Signed, fileId: string, account: string | null = s.user.id) =>
  send("DELETE", `/ngo/application/files/${fileId}`, { headers: account ? { "X-Vila-Account": account } : {}, cookie: s.cookie });

const ALL_CHECKS = { activeCnpj: true, oneYear: true, fundsConfirmable: true };
const revisionOf = (ngoId: string) => db.sql("SELECT revision FROM ngos WHERE id = ?", ngoId)[0].revision as number;
const decide = (ngoId: string, action: string, admin: Signed, revision = revisionOf(ngoId)) =>
  call("POST", `/admin/applications/${ngoId}/decision`, { action, revision, checks: ALL_CHECKS, note: "Envie o estatuto atualizado." }, admin.cookie);
const rows = () => db.sql("SELECT id, ngo_id, kind, content_type, size FROM ngo_files ORDER BY created_at, id");
const audits = (action: string) => db.sql("SELECT actor, subject, detail FROM audit_events WHERE action = ?", action);
const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());

beforeEach(() => {
  db = createD1();
  r2 = createR2();
  env = { DB: db, FILES: r2, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", NGO_FILES_ENABLED: "true" };
});

describe("feature flag", () => {
  it("is off in production and on in local development, and the bucket is bound", () => {
    expect(productionVar("NGO_FILES_ENABLED")).toBe("false");
    expect(devVar("NGO_FILES_ENABLED")).toBe("true");
    expect(productionVar("bucket_name")).toBe("vilanoeldobem-files");
  });

  it("says in /config whether uploads work: accounts, the flag and the bucket are all needed", async () => {
    expect((await call("GET", "/config")).body).toMatchObject({ accounts: true, files: true });
    for (const off of [{ ACCOUNTS_ENABLED: "false" }, { NGO_FILES_ENABLED: "false" }, { NGO_FILES_ENABLED: undefined }, { FILES: undefined }]) {
      env = { ...env, ...off };
      expect((await call("GET", "/config")).body.files).toBe(false);
      env = { DB: db, FILES: r2, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", NGO_FILES_ENABLED: "true" };
    }
    expect((await call("GET", "/health")).body.files).toBe(true);
    env.FILES = undefined;
    expect((await call("GET", "/health")).body.files).toBe(false);
  });

  it("answers 404 files_disabled on every file route while the flag is off or the bucket is missing", async () => {
    const a = await applicant();
    const id = "00000000-0000-4000-8000-000000000000";
    for (const off of [{ NGO_FILES_ENABLED: "false" }, { FILES: undefined }]) {
      env = { ...env, ...off };
      expect((await upload(a, "logo", png(), "image/png")).body.error).toBe("files_disabled");
      expect((await call("GET", `/ngo/application/files/${id}`, undefined, a.cookie)).body.error).toBe("files_disabled");
      expect(((await (await remove(a, id)).json()) as any).error).toBe("files_disabled");
      expect((await call("GET", `/admin/applications/${a.ngoId}/files/${id}`, undefined, a.cookie)).body.error).toBe("files_disabled");
      expect((await call("GET", `/ngos/${a.ngoId}/logo`)).body.error).toBe("files_disabled");
      expect((await call("GET", "/ngo/application", undefined, a.cookie)).body.files).toEqual([]);
      env = { ...env, FILES: r2, NGO_FILES_ENABLED: "true" };
    }
    expect(r2.keys()).toEqual([]);
  });

  it("keeps /lots working with the flag off even where migration 0006 was not applied", async () => {
    db.sql("DROP TABLE ngo_files");
    env.NGO_FILES_ENABLED = "false";
    const r = await call("GET", "/lots");
    expect(r.status).toBe(200);
    expect(r.body.lots[0]).toMatchObject({ id: "plaza-01", ngo_logo: null });
  });

  it("lets the browser send the account header (CORS preflight)", async () => {
    const res = await send("OPTIONS", "/ngo/application/files?kind=logo", { headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-vila-account" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Vila-Account");
    expect(res.headers.get("Access-Control-Allow-Methods")).toContain("DELETE");
  });
});

describe("upload", () => {
  it("stores a logo in the bucket without metadata, bumps the revision and writes an audit row", async () => {
    const a = await applicant();
    const dirty = png(128, 128, [pngChunk("tEXt", "Author\0Ana Lima"), pngChunk("eXIf", "GPS-SECRET")]);
    const r = await upload(a, "logo", dirty, "image/png");
    expect(r.status).toBe(201);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    const clean = png(128, 128);
    expect(r.body).toMatchObject({ file: { kind: "logo", contentType: "image/png", size: clean.length }, revision: 2 });
    const key = `ngo/${a.ngoId}/${r.body.file.id}`;
    expect(r2.keys()).toEqual([key]);
    expect(r2.bytes(key)).toEqual(clean);
    expect(text(r2.bytes(key)!)).not.toMatch(/Ana Lima|GPS-SECRET/);
    expect(r2.objects.get(key)!.httpMetadata).toEqual({ contentType: "image/png" });
    expect(rows()).toEqual([{ id: r.body.file.id, ngo_id: a.ngoId, kind: "logo", content_type: "image/png", size: clean.length }]);
    expect(revisionOf(a.ngoId)).toBe(2);
    expect(audits("ngo.file_add")).toEqual([{ actor: a.user.id, subject: `ngo:${a.ngoId}`, detail: JSON.stringify({ kind: "logo", file: r.body.file.id, revision: 2 }) }]);
    // The applicant sees it with the application; no file name exists anywhere.
    const mine = (await call("GET", "/ngo/application", undefined, a.cookie)).body;
    expect(mine.application.revision).toBe(2);
    expect(mine.files).toEqual([r.body.file]);
    expect(Object.keys(r.body.file).sort()).toEqual(["contentType", "createdAt", "id", "kind", "size"]);
  });

  it("replaces the logo: one row, one object", async () => {
    const a = await applicant();
    const first = (await upload(a, "logo", png(100, 100), "image/png")).body.file;
    const second = await upload(a, "logo", jpeg(200, 200, "GPS-SECRET"), "image/jpeg");
    expect(second.status).toBe(201);
    expect(rows().map((r) => [r.id, r.content_type])).toEqual([[second.body.file.id, "image/jpeg"]]);
    expect(r2.keys()).toEqual([`ngo/${a.ngoId}/${second.body.file.id}`]);
    expect(r2.keys()).not.toContain(`ngo/${a.ngoId}/${first.id}`);
    expect(text(r2.bytes(r2.keys()[0])!)).not.toContain("GPS-SECRET");
    expect(revisionOf(a.ngoId)).toBe(3);
  });

  it("takes up to five documents, PDF stored as sent, and refuses the sixth", async () => {
    const a = await applicant();
    const sent = pdf("estatuto");
    for (let i = 0; i < FILE_RULES.document.maxCount; i++) expect((await upload(a, "document", i ? png(300, 200) : sent, i ? "image/png" : "application/pdf")).status).toBe(201);
    const sixth = await upload(a, "document", sent, "application/pdf");
    expect([sixth.status, sixth.body.error]).toEqual([409, "too_many_files"]);
    expect(sixth.body.fields.file).toMatch(/até 5 documentos/);
    expect(rows()).toHaveLength(5);
    expect(r2.keys()).toHaveLength(5);
    // Uploads in the same millisecond have no order between them, so find the PDF by its type.
    const pdfKey = `ngo/${a.ngoId}/${rows().find((r) => r.content_type === "application/pdf")!.id}`;
    expect(r2.bytes(pdfKey)).toEqual(sent);
    // Documents and the logo are counted apart.
    expect((await upload(a, "logo", png(), "image/png")).status).toBe(201);
    const files = (await call("GET", "/ngo/application", undefined, a.cookie)).body.files;
    expect(files.map((f: { kind: string }) => f.kind)).toEqual(["logo", "document", "document", "document", "document", "document"]);
  });

  it("refuses what is not an accepted, well-formed file — and stores nothing", async () => {
    const a = await applicant();
    const cases: Array<[string, Uint8Array, string, number, string]> = [
      ["logo", Uint8Array.from("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", (c) => c.charCodeAt(0)), "image/svg+xml", 415, "file_type"],
      ["logo", pdf(), "application/pdf", 415, "file_type"],
      ["document", Uint8Array.from("<html>", (c) => c.charCodeAt(0)), "text/html", 415, "file_type"],
      ["document", png(), "", 415, "file_type"],
      // Content that is not what the header claims (an HTML page or a PDF called PNG).
      ["logo", Uint8Array.from("<html><script>alert(1)</script></html>", (c) => c.charCodeAt(0)), "image/png", 400, "file_mismatch"],
      ["document", png(), "application/pdf", 400, "file_mismatch"],
      ["logo", png().subarray(0, 60), "image/png", 400, "file_invalid"],
      ["logo", png(32, 32), "image/png", 400, "image_too_small"],
      ["logo", png(1025, 64), "image/png", 400, "image_too_large"],
      ["document", new Uint8Array(), "application/pdf", 400, "file_empty"],
    ];
    for (const [kind, bytes, type, status, error] of cases) {
      const r = await upload(a, kind, bytes, type);
      expect([kind, type, r.status, r.body.error]).toEqual([kind, type, status, error]);
      expect(r.body.fields.file.length).toBeGreaterThan(10);
    }
    expect((await upload(a, "banner", png(), "image/png")).body.error).toBe("bad_kind");
    expect((await upload(a, "", png(), "image/png")).body.error).toBe("bad_kind");
    expect(rows()).toEqual([]);
    expect(r2.keys()).toEqual([]);
    expect(revisionOf(a.ngoId)).toBe(1);
  });

  it("enforces the size limit on the declared length and again on the bytes that really arrive", async () => {
    const a = await applicant();
    const big = new Uint8Array(FILE_RULES.logo.maxBytes + 1);
    big.set(png().subarray(0, 8));
    // Honest header: refused before reading.
    const declared = await upload(a, "logo", big, "image/png");
    expect([declared.status, declared.body.error]).toEqual([413, "file_too_large"]);
    expect(declared.body.fields.file).toContain("512 KB");
    // No header, or a header that lies: refused while reading.
    for (const length of [null, 100]) {
      const r = await upload(a, "logo", big, "image/png", { length });
      expect([r.status, r.body.error]).toEqual([413, "file_too_large"]);
    }
    const doc = new Uint8Array(FILE_RULES.document.maxBytes + 1);
    expect((await upload(a, "document", doc, "application/pdf", { length: null })).status).toBe(413);
    expect(r2.keys()).toEqual([]);
  });

  it("needs a signed-in, verified account that owns an application, from an allowed origin", async () => {
    const a = await applicant();
    expect((await upload(a, "logo", png(), "image/png", { cookie: "x=y" })).status).toBe(401);
    expect((await upload(a, "logo", png(), "image/png", { origin: "https://evil.example" })).status).toBe(403);
    expect((await upload(a, "logo", png(), "image/png", { origin: null })).status).toBe(403);
    // The page must name the account it believes is signed in (another tab may have switched accounts).
    for (const account of [null, "someone-else"]) expect((await upload(a, "logo", png(), "image/png", { account })).body.error).toBe("account_changed");
    const b = await signUp("bia", "bia@example.com");
    expect((await upload(b, "logo", png(), "image/png")).body.error).toBe("no_application");
    db.sql("UPDATE users SET verified_at = NULL WHERE id = ?", a.user.id);
    expect((await upload(a, "logo", png(), "image/png")).body.error).toBe("not_verified");
    expect(r2.keys()).toEqual([]);
  });

  it("limits uploads per account", async () => {
    const a = await applicant();
    const keys: string[] = [];
    env.FILE_LIMITER = { limit: async ({ key }) => (keys.push(key), { success: false }) };
    const r = await upload(a, "logo", png(), "image/png");
    expect([r.status, r.body.error]).toEqual([429, "too_many_requests"]);
    expect(keys).toEqual([a.user.id]);
    expect(r2.keys()).toEqual([]);
  });

  it("leaves nothing behind when R2 or the application fails halfway", async () => {
    const a = await applicant();
    r2.failNext("put");
    expect((await upload(a, "logo", png(), "image/png")).status).toBe(500);
    expect(rows()).toEqual([]);
    // The application moves on (here: another change bumps the revision) while the bytes are being stored.
    const put = r2.put.bind(r2);
    r2.put = async (...args: Parameters<typeof put>) => {
      db.sql("UPDATE ngos SET revision = revision + 1 WHERE id = ?", a.ngoId);
      return put(...args);
    };
    const raced = await upload(a, "logo", png(), "image/png");
    expect([raced.status, raced.body.error]).toEqual([409, "application_changed"]);
    expect(rows()).toEqual([]);
    expect(r2.keys()).toEqual([]);
    expect(audits("ngo.file_add")).toEqual([]);
    // A failed cleanup does not turn the answer into an error.
    r2.failNext("delete");
    expect((await upload(a, "logo", png(), "image/png")).status).toBe(409);
  });
});

describe("review and publication", () => {
  it("refuses an admin decision made before the files changed", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const seen = revisionOf(a.ngoId);
    await upload(a, "logo", png(), "image/png");
    const stale = await decide(a.ngoId, "approve", admin, seen);
    expect([stale.status, stale.body.error]).toEqual([409, "stale_revision"]);
    expect((await decide(a.ngoId, "approve", admin)).status).toBe(200);
  });

  it("lets the applicant change files during review and after a request for changes, never once published", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    await decide(a.ngoId, "start_review", admin);
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    await decide(a.ngoId, "request_changes", admin);
    const logo = (await upload(a, "logo", png(), "image/png")).body.file;
    await call("POST", "/ngo/application", { accountId: a.user.id, ...APP }, a.cookie);
    expect((await decide(a.ngoId, "approve", admin)).body.application.status).toBe("published");

    const locked = await upload(a, "logo", png(200, 200), "image/png");
    expect([locked.status, locked.body.error]).toEqual([409, "application_locked"]);
    expect((await upload(a, "document", pdf(), "application/pdf")).body.error).toBe("application_locked");
    for (const id of [doc.id, logo.id]) {
      const r = await remove(a, id);
      expect([r.status, ((await r.json()) as any).error]).toEqual([409, "application_locked"]);
    }
    expect(rows()).toHaveLength(2);
    expect(r2.keys()).toHaveLength(2);
  });

  it("publishes only the logo, only after approval", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const logo = (await upload(a, "logo", png(), "image/png")).body.file;
    const doc = (await upload(a, "document", pdf("estatuto"), "application/pdf")).body.file;
    // Before approval nothing is public, with or without a session.
    expect((await call("GET", `/ngos/${a.ngoId}/logo`, undefined, undefined, null)).status).toBe(404);
    expect((await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-03").ngo_logo).toBeNull();
    await decide(a.ngoId, "approve", admin);

    const res = await send("GET", `/ngos/${a.ngoId}/logo`, { origin: null });
    expect(res.status).toBe(200);
    expect(await bytesOf(res)).toEqual(png());
    expect(Object.fromEntries(res.headers)).toMatchObject({
      "content-type": "image/png",
      "content-length": String(png().length),
      "content-disposition": "inline",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "public, max-age=300",
      "cross-origin-resource-policy": "cross-origin",
      etag: `"${logo.id}"`,
    });
    const cached = await send("GET", `/ngos/${a.ngoId}/logo`, { origin: null, headers: { "If-None-Match": `"${logo.id}"` } });
    expect([cached.status, (await bytesOf(cached)).length]).toEqual([304, 0]);
    // The lot points at it; the document id leads nowhere public.
    const lot = (await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-03");
    expect(lot.ngo_logo).toBe(`/ngos/${a.ngoId}/logo?v=${logo.id.slice(0, 8)}`);
    expect((await call("GET", `/ngos/${doc.id}/logo`, undefined, undefined, null)).status).toBe(404);
    expect((await call("GET", `/ngos/${a.ngoId}/files/${doc.id}`, undefined, undefined, null)).status).toBe(404);
    expect((await call("POST", `/ngos/${a.ngoId}/logo`, {}, undefined, null)).status).toBe(405);
    // A published NGO without a logo has none.
    const b = await applicant("bia", "bia@example.com", { ...APP, cnpj: "11444777000161", lotId: "plaza-06" });
    await decide(b.ngoId, "approve", admin);
    expect((await call("GET", `/ngos/${b.ngoId}/logo`)).status).toBe(404);
    expect((await call("GET", "/lots")).body.lots.find((l: { id: string }) => l.id === "plaza-06")).toMatchObject({ ngo_name: APP.name, ngo_logo: null });
  });
});

describe("reading and removing", () => {
  it("serves a file only to its applicant and to admins, as inert bytes, and audits document reads", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const other = await signUp("bia", "bia@example.com");
    const logo = (await upload(a, "logo", png(), "image/png")).body.file;
    const doc = (await upload(a, "document", pdf("estatuto"), "application/pdf")).body.file;

    const own = await send("GET", `/ngo/application/files/${doc.id}`, { cookie: a.cookie });
    expect(own.status).toBe(200);
    expect(await bytesOf(own)).toEqual(pdf("estatuto"));
    expect(Object.fromEntries(own.headers)).toMatchObject({
      "content-type": "application/pdf",
      "content-disposition": "attachment",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      "cache-control": "no-store",
      "access-control-allow-origin": ORIGIN,
      "access-control-allow-credentials": "true",
    });
    // Someone else, signed in or not, gets nothing — through either route.
    expect((await call("GET", `/ngo/application/files/${doc.id}`, undefined, other.cookie)).status).toBe(404);
    expect((await call("GET", `/ngo/application/files/${doc.id}`)).status).toBe(401);
    expect((await call("GET", `/admin/applications/${a.ngoId}/files/${doc.id}`, undefined, other.cookie)).body.error).toBe("admin_only");
    expect((await call("GET", `/admin/applications/${a.ngoId}/files/${doc.id}`, undefined, a.cookie)).body.error).toBe("admin_only");
    expect(((await (await remove(other, doc.id)).json()) as any).error).toBe("not_found");
    expect(audits("ngo.file_read")).toEqual([]);

    const detail = (await call("GET", `/admin/applications/${a.ngoId}`, undefined, admin.cookie)).body;
    expect(detail.files.map((f: { id: string }) => f.id)).toEqual([logo.id, doc.id]);
    const read = await send("GET", `/admin/applications/${a.ngoId}/files/${doc.id}`, { cookie: admin.cookie });
    expect([read.status, read.headers.get("Cache-Control")]).toEqual([200, "no-store"]);
    expect(await bytesOf(read)).toEqual(pdf("estatuto"));
    expect((await send("GET", `/admin/applications/${a.ngoId}/files/${logo.id}`, { cookie: admin.cookie })).headers.get("Content-Disposition")).toBe("inline");
    // The document read is on record (who and which file, nothing else); looking at the logo is not.
    expect(audits("ngo.file_read")).toEqual([{ actor: admin.user.id, subject: `ngo:${a.ngoId}`, detail: JSON.stringify({ kind: "document", file: doc.id }) }]);
    // The file must belong to the application in the path.
    const b = await applicant("caio", "caio@example.com", { ...APP, cnpj: "11444777000161", lotId: "plaza-06" });
    expect((await call("GET", `/admin/applications/${b.ngoId}/files/${doc.id}`, undefined, admin.cookie)).status).toBe(404);
  });

  it("answers 404 when the row exists but the object is gone", async () => {
    const a = await applicant();
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    const admin = await asAdmin();
    r2.objects.clear();
    expect((await call("GET", `/ngo/application/files/${doc.id}`, undefined, a.cookie)).status).toBe(404);
    // Nothing was handed over, so nothing is recorded as read.
    expect((await call("GET", `/admin/applications/${a.ngoId}/files/${doc.id}`, undefined, admin.cookie)).status).toBe(404);
    expect(audits("ngo.file_read")).toEqual([]);
  });

  it("removes a file: row and object gone, revision bumped, audit row", async () => {
    const a = await applicant();
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    const keep = (await upload(a, "document", png(300, 300), "image/png")).body.file;
    expect(((await (await remove(a, doc.id, null)).json()) as any).error).toBe("account_changed");
    const r = await remove(a, doc.id);
    expect([r.status, await r.json()]).toEqual([200, { revision: 4 }]);
    expect(rows().map((x) => x.id)).toEqual([keep.id]);
    expect(r2.keys()).toEqual([`ngo/${a.ngoId}/${keep.id}`]);
    expect(audits("ngo.file_remove")).toEqual([{ actor: a.user.id, subject: `ngo:${a.ngoId}`, detail: JSON.stringify({ kind: "document", file: doc.id, revision: 4 }) }]);
    expect((await remove(a, doc.id)).status).toBe(404);
    // The row is gone even if R2 fails to delete: the object is then unreachable, not served.
    r2.failNext("delete");
    expect((await remove(a, keep.id)).status).toBe(200);
    expect(rows()).toEqual([]);
  });
});

describe("account deletion (LGPD)", () => {
  it("deletes the documents and an unpublished logo from R2 and D1 with the account", async () => {
    const a = await applicant();
    await upload(a, "logo", png(), "image/png");
    await upload(a, "document", pdf(), "application/pdf");
    await upload(a, "document", png(300, 300), "image/png");
    const b = await applicant("bia", "bia@example.com", { ...APP, cnpj: "11444777000161", lotId: "plaza-06" });
    const others = (await upload(b, "document", pdf("outra"), "application/pdf")).body.file;
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(rows().map((r) => r.id)).toEqual([others.id]);
    expect(r2.keys()).toEqual([`ngo/${b.ngoId}/${others.id}`]);
    expect(db.sql("SELECT applicant_id FROM ngos WHERE id = ?", a.ngoId)).toEqual([{ applicant_id: null }]);
  });

  it("keeps the logo of a published NGO and deletes its documents", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const logo = (await upload(a, "logo", png(), "image/png")).body.file;
    await upload(a, "document", pdf(), "application/pdf");
    await decide(a.ngoId, "approve", admin);
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(rows().map((r) => [r.id, r.kind])).toEqual([[logo.id, "logo"]]);
    expect(r2.keys()).toEqual([`ngo/${a.ngoId}/${logo.id}`]);
    expect((await send("GET", `/ngos/${a.ngoId}/logo`, { origin: null })).status).toBe(200);
  });

  it("still cleans up with the feature switched off, and keeps the account if R2 cannot delete", async () => {
    const a = await applicant();
    await upload(a, "document", pdf(), "application/pdf");
    env.NGO_FILES_ENABLED = "false";
    r2.failNext("delete");
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(500);
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(1);
    expect(rows()).toHaveLength(1);
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(rows()).toEqual([]);
    expect(r2.keys()).toEqual([]);
  });

  it("deletes an account without files exactly as before", async () => {
    const a = await applicant();
    env.FILES = undefined;
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(0);
  });
});

describe("what is recorded", () => {
  it("never puts personal data in file audit rows or object keys", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const doc = (await upload(a, "document", pdf("CPF 123.456.789-00"), "application/pdf")).body.file;
    await send("GET", `/admin/applications/${a.ngoId}/files/${doc.id}`, { cookie: admin.cookie });
    await remove(a, doc.id);
    const uuid = /^[0-9a-f-]{36}$/;
    for (const row of db.sql("SELECT actor, subject, detail FROM audit_events WHERE action LIKE 'ngo.file_%'")) {
      expect(String(row.actor)).toMatch(uuid);
      expect(String(row.detail)).not.toMatch(/@|Ana|CPF|\.pdf/);
      expect(Object.keys(JSON.parse(String(row.detail))).every((k) => ["kind", "file", "revision"].includes(k))).toBe(true);
    }
    const history = (await call("GET", `/admin/applications/${a.ngoId}`, undefined, admin.cookie)).body.history.map((h: { action: string }) => h.action);
    expect(history).toEqual(["ngo.submit", "ngo.file_add", "ngo.file_read", "ngo.file_remove"]);
  });
});
