/**
 * End-to-end API tests for NGO application files in R2 (IMPL-0017): real SQLite with the real migrations
 * (test/d1.mjs) and an in-memory bucket (test/r2.mjs).
 */
import { beforeEach, describe, expect, it } from "vitest";

import { FILE_RULES } from "@vila/shared/accounts/files";

import { deployScript, devVar, productionVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { jpeg, pdf, png, pngChunk, text } from "../test/fixtures.mjs";
import { createR2 } from "../test/r2.mjs";
import { type Env, handleApi } from "./api";
import { MAX_FILE_CHANGES_PER_DAY } from "./files";
import { sha256Hex } from "./crypto";

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
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

/** Runs `competing` right before the next `db.batch` (a request that commits between another's read and its write). */
function beforeNextBatch(competing: () => Promise<unknown>) {
  const batch = db.batch.bind(db);
  let fired = false;
  db.batch = (async (list: D1PreparedStatement[]) => {
    if (!fired) {
      fired = true;
      await competing();
    }
    return batch(list);
  }) as typeof db.batch;
}

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

  it("deploys without automatic provisioning: a missing bucket must stop the deploy, not be created by it", () => {
    // wrangler creates a bucket named in the config when it does not exist, unless told not to.
    expect(deployScript()).toMatch(/wrangler deploy --x-provision=false$/);
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
      // The admin route needs only the bucket (an admin always sees what exists): without it, disabled.
      expect((await call("GET", `/admin/applications/${a.ngoId}/files/${id}`, undefined, a.cookie)).body.error).toBe(off.FILES === undefined && "FILES" in off ? "files_disabled" : "admin_only");
      expect((await call("GET", `/ngos/${a.ngoId}/logo`)).body.error).toBe("files_disabled");
      expect((await call("GET", "/ngo/application", undefined, a.cookie)).body.files).toEqual([]);
      env = { ...env, FILES: r2, NGO_FILES_ENABLED: "true" };
    }
    expect(r2.keys()).toEqual([]);
  });

  it("keeps the public routes working on a database behind the code (production is at migration 0003)", async () => {
    // Every flag combination, on the schema production has today and on the one before 0006.
    for (const upTo of [3, 5])
      for (const flags of [{}, { NGO_FILES_ENABLED: "false" }, { ACCOUNTS_ENABLED: "false" }, { ACCOUNTS_ENABLED: "false", NGO_FILES_ENABLED: "false" }]) {
        db = createD1({ upTo });
        env = { DB: db, FILES: r2, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", NGO_FILES_ENABLED: "true", ...flags };
        const lots = await call("GET", "/lots");
        expect([upTo, flags, lots.status]).toEqual([upTo, flags, 200]);
        expect(lots.body.lots[0]).toMatchObject({ id: "plaza-01", ngo_logo: null });
        expect((await call("GET", "/ngos/00000000-0000-4000-8000-000000000000/logo")).status).toBe(404);
        expect((await call("GET", "/health")).status).toBe(200);
      }
  });

  it("fails closed for an existing account without reconciliation columns, preserving its data", async () => {
    db = createD1({ upTo: 5 });
    env = { DB: db, FILES: r2, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", NGO_FILES_ENABLED: "false" };
    db.sql("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES('legacy','Legacy','legacy','legacy','Recife','legacy@example.test','admin','2026-01-01')");
    db.sql("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,'legacy','2099-01-01')", await sha256Hex("legacy"));
    const cookie = "__Host-vila_session=legacy";
    for (const [method, path, body] of [
      ["GET", "/me"], ["GET", "/ngo/application"], ["GET", "/admin/applications"],
      ["POST", "/ngo/application", { accountId: "legacy", ...APP }], ["DELETE", "/me"],
    ] as const) {
      const result = await call(method, path, body, cookie);
      expect([method, path, result.status, result.body]).toEqual([method, path, 503, { error: "schema_outdated" }]);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(1);
    expect(db.sql("SELECT COUNT(*) AS n FROM sessions")[0].n).toBe(1);
    expect(db.sql("SELECT COUNT(*) AS n FROM ngos")[0].n).toBe(0);
    expect(db.sql("SELECT COUNT(*) AS n FROM audit_events")[0].n).toBe(0);
    expect(r2.keys()).toEqual([]);
  });

  it("keeps missing-0006 account reads and deletion working once reconciliation columns exist", async () => {
    // Exercise the upstream missing-files fallback with our required columns, without creating ngo_files.
    // 0009 (`ngo_withdrawals`) is required by every signed-in NGO route and 0010 (`users.blocked`) by every session
    // read: without them they answer 503 schema_outdated.
    db = createD1({ upTo: 5, additionalMigrations: [7, 9, 10] });
    env = { DB: db, FILES: r2, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", NGO_FILES_ENABLED: "false" };
    const a = await applicant();
    expect((await call("GET", "/ngo/application", undefined, a.cookie)).body).toMatchObject({ application: { status: "submitted" }, files: [] });
    const admin = await asAdmin();
    expect((await call("GET", `/admin/applications/${a.ngoId}`, undefined, admin.cookie)).body.files).toEqual([]);
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(1);
  });

  it("lets the browser send account and gallery caption headers (CORS preflight)", async () => {
    const res = await send("OPTIONS", "/ngo/application/files?kind=logo", { headers: { "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,x-vila-account,x-vila-caption" } });
    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Headers")).toBe("Content-Type, X-Vila-Account, X-Vila-Caption");
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

  it("takes file changes before and after the review, locks them during it and freezes them once published", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    await decide(a.ngoId, "start_review", admin);
    // Under review: what the admin is looking at cannot change.
    const during = await upload(a, "logo", png(), "image/png");
    expect([during.status, during.body.error]).toEqual([409, "application_locked"]);
    expect(await errorOf(await remove(a, doc.id))).toBe("application_locked");
    await decide(a.ngoId, "request_changes", admin);
    const logo = (await upload(a, "logo", png(), "image/png")).body.file;
    await call("POST", "/ngo/application", { accountId: a.user.id, ...APP }, a.cookie);
    expect((await decide(a.ngoId, "approve", admin)).body.application.status).toBe("published");

    const locked = await upload(a, "logo", png(200, 200), "image/png");
    expect([locked.status, locked.body.error]).toEqual([409, "application_locked"]);
    expect((await upload(a, "document", pdf(), "application/pdf")).body.error).toBe("application_locked");
    for (const id of [doc.id, logo.id]) {
      const r = await remove(a, id);
      expect([r.status, await errorOf(r)]).toEqual([409, "application_locked"]);
    }
    expect(rows()).toHaveLength(2);
    expect(r2.keys()).toHaveLength(2);
    // After a rejection the applicant may prepare a new version, files included.
    const b = await applicant("bia", "bia@example.com", { ...APP, cnpj: "11444777000161", lotId: "plaza-06" });
    await decide(b.ngoId, "reject", admin);
    expect((await upload(b, "document", pdf(), "application/pdf")).status).toBe(201);
  });

  it("does not let an applicant keep the review away by changing files", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const seen = revisionOf(a.ngoId);
    // The applicant changes files after every look the admin takes: a decision about the content stays stale…
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    expect((await decide(a.ngoId, "reject", admin, seen)).body.error).toBe("stale_revision");
    await remove(a, doc.id);
    expect((await decide(a.ngoId, "approve", admin, seen)).body.error).toBe("stale_revision");
    // …but starting the review needs no revision: it works on whatever is current, and locks the files.
    const started = await decide(a.ngoId, "start_review", admin, seen);
    expect([started.status, started.body.application.status]).toEqual([200, "under_review"]);
    expect((await upload(a, "document", pdf(), "application/pdf")).body.error).toBe("application_locked");
    expect((await decide(a.ngoId, "reject", admin)).body.application.status).toBe("rejected");
    // The audit row of the start names the revision it really applied to.
    expect(JSON.parse(String(audits("ngo.start_review")[0].detail)).revision).toBe(revisionOf(a.ngoId));
  });

  it("shows an admin the files that exist even with the feature switched off, so nothing unseen is published", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    const logo = (await upload(a, "logo", png(), "image/png")).body.file;
    env.NGO_FILES_ENABLED = "false";
    expect((await call("GET", "/config")).body.files).toBe(false);
    const detail = (await call("GET", `/admin/applications/${a.ngoId}`, undefined, admin.cookie)).body;
    expect(detail.files.map((f: { id: string }) => f.id)).toEqual([logo.id]);
    const read = await send("GET", `/admin/applications/${a.ngoId}/files/${logo.id}`, { cookie: admin.cookie });
    expect([read.status, await bytesOf(read)]).toEqual([200, png()]);
    // Nothing is public while it is off, and the applicant cannot change anything.
    await decide(a.ngoId, "approve", admin);
    expect((await call("GET", `/ngos/${a.ngoId}/logo`)).body.error).toBe("files_disabled");
    expect((await upload(a, "logo", png(), "image/png")).body.error).toBe("files_disabled");
  });

  it("limits file changes per application per day and removals per account per minute", async () => {
    const a = await applicant();
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    env.FILE_LIMITER = { limit: async () => ({ success: false }) };
    const limited = await remove(a, doc.id);
    expect([limited.status, await errorOf(limited)]).toEqual([429, "too_many_requests"]);
    env.FILE_LIMITER = undefined;
    for (let i = 1; i < MAX_FILE_CHANGES_PER_DAY; i++) db.sql("INSERT INTO audit_events (id, actor, action, subject, detail) VALUES (?, ?, 'ngo.file_add', ?, '{}')", `budget-${i}`, a.user.id, `ngo:${a.ngoId}`);
    const up = await upload(a, "document", pdf(), "application/pdf");
    expect([up.status, up.body.error]).toEqual([429, "too_many_file_changes"]);
    expect(up.body.fields.file).toMatch(/amanhã/);
    const del = await remove(a, doc.id);
    expect([del.status, await errorOf(del)]).toEqual([429, "too_many_file_changes"]);
    expect(r2.keys()).toHaveLength(1);
    // Old changes do not count.
    db.sql("UPDATE audit_events SET at = '2020-01-01T00:00:00.000Z' WHERE id LIKE 'budget-%'");
    expect((await remove(a, doc.id)).status).toBe(200);
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
      "cache-control": "no-cache",
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
    // Metadata is hidden, but a durable cleanup intent exposes failure and permits recovery.
    r2.failNext("delete");
    expect((await remove(a, keep.id)).status).toBe(503);
    expect(rows()).toEqual([]);
    expect(db.sql("SELECT id,cleanup_pending FROM media_upload_intents")).toEqual([{id:keep.id,cleanup_pending:1}]);
  });

  it("writes one removal to the audit trail when two removals of the same file race", async () => {
    const a = await applicant();
    const doc = (await upload(a, "document", pdf(), "application/pdf")).body.file;
    beforeNextBatch(() => remove(a, doc.id));
    const loser = await remove(a, doc.id);
    expect([loser.status, await errorOf(loser)]).toEqual([409, "application_changed"]);
    expect(audits("ngo.file_remove")).toHaveLength(1);
    expect(rows()).toEqual([]);
    expect(revisionOf(a.ngoId)).toBe(3);
  });

  it("records no removal when it loses to an upload: the file is still there", async () => {
    const a = await applicant();
    const doc = (await upload(a, "document", pdf("x"), "application/pdf")).body.file;
    beforeNextBatch(() => upload(a, "document", pdf("y"), "application/pdf"));
    const loser = await remove(a, doc.id);
    expect([loser.status, await errorOf(loser)]).toEqual([409, "application_changed"]);
    expect(audits("ngo.file_remove")).toEqual([]);
    expect(rows().map((r) => r.id)).toContain(doc.id);
    expect(rows()).toHaveLength(2);
    expect(r2.keys()).toHaveLength(2);
  });

  it("answers application_changed, not 'lot taken', when a resubmission loses to a file change", async () => {
    const a = await applicant();
    const admin = await asAdmin();
    await decide(a.ngoId, "request_changes", admin);
    beforeNextBatch(() => upload(a, "document", pdf(), "application/pdf"));
    const r = await call("POST", "/ngo/application", { accountId: a.user.id, ...APP }, a.cookie);
    expect([r.status, r.body.error]).toEqual([409, "application_changed"]);
    expect(db.sql("SELECT status FROM ngos WHERE id = ?", a.ngoId)[0].status).toBe("changes_requested");
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

  it("blocks a late document while the account is being deleted (no files before)", async () => {
    const a = await applicant();
    // The persisted intent prevents an upload after cleanup looked for files and before account removal.
    beforeNextBatch(async () => {
      const late = await upload(a, "document", pdf(), "application/pdf");
      expect([late.status, late.body.error]).toEqual([409, "account_deleting"]);
    });
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(rows()).toEqual([]);
    expect(r2.keys()).toEqual([]);
    expect(db.sql("SELECT COUNT(*) AS n FROM users")[0].n).toBe(0);
  });

  it("blocks a late document while the account's other files are leaving R2", async () => {
    const a = await applicant();
    await upload(a, "document", pdf("first"), "application/pdf");
    const remove = r2.delete.bind(r2);
    let fired = false;
    r2.delete = async (keys: string | string[]) => {
      if (!fired) {
        fired = true;
        const late = await upload(a, "document", pdf("second"), "application/pdf");
        expect([late.status, late.body.error]).toEqual([409, "account_deleting"]);
      }
      return remove(keys);
    };
    expect((await call("DELETE", "/me", undefined, a.cookie)).status).toBe(204);
    expect(rows()).toEqual([]);
    expect(r2.keys()).toEqual([]);
  });

  it("refuses an upload that lands after the account is gone, and leaves no object", async () => {
    const a = await applicant();
    const put = r2.put.bind(r2);
    r2.put = async (...args: Parameters<typeof put>) => {
      // The account is deleted while the bytes are being stored.
      db.sql("DELETE FROM users WHERE id = ?", a.user.id);
      return put(...args);
    };
    expect((await upload(a, "document", pdf(), "application/pdf")).status).toBeGreaterThanOrEqual(400);
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
