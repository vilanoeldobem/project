import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createD1 } from "../test/d1.mjs";
import { pdf, png } from "../test/fixtures.mjs";
import { createR2 } from "../test/r2.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

const NGO = "a0000000-0000-4000-8000-000000000001", ORIGIN = "https://play.example";
const APP = {
  accountId: "owner", name: "Associação Atualizada", cnpj: "11222333000181", openedOn: "2020-03-10", city: "Recife",
  declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  fundsConfirmation: "Extratos mensais e relatórios conciliáveis da organização.",
  summary: "Apoio escolar para crianças da comunidade.",
  description: "Atendemos crianças com reforço escolar, leitura e atividades culturais no contraturno.",
  tags: ["children", "education"], projects: [], lotId: "plaza-02",
};
let db: ReturnType<typeof createD1>, r2: ReturnType<typeof createR2>, env: Env;
const request = (method: string, path: string, user = "owner", body?: BodyInit, headers: Record<string, string> = {}) =>
  handleApi(new Request(`https://api.example${path}`, {
    method, headers: { Origin: ORIGIN, Cookie: `__Host-vila_session=${user}`, ...headers }, body,
  }), env);
const json = (method: string, path: string, body: unknown, user = "owner") =>
  request(method, path, user, JSON.stringify(body), { "Content-Type": "application/json" });
const revision = () => Number(db.sql("SELECT revision FROM ngos WHERE id=?", NGO)[0].revision);
const decision = (action = "approve", seen = revision()) => json("POST", `/admin/applications/${NGO}/decision`, {
  action, revision: seen, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true }, note: "Envie os ajustes necessários.",
}, "admin");
const upload = (kind = "document") => request("POST", `/ngo/application/files?kind=${kind}`, "owner",
  kind === "logo" ? png() : pdf(), { "Content-Type": kind === "logo" ? "image/png" : "application/pdf", "X-Vila-Account": "owner" });
const remove = (id: string) => request("DELETE", `/ngo/application/files/${id}`, "owner", undefined, { "X-Vila-Account": "owner" });
const deleteAccount = () => request("DELETE", "/me");
const fileRows = () => db.sql("SELECT * FROM ngo_files ORDER BY id");
const audits = (action: string) => db.sql("SELECT * FROM audit_events WHERE action=?", action);
const intent = () => db.sql("SELECT files_deleting FROM users WHERE id='owner'")[0]?.files_deleting;
async function file(kind = "document") {
  const response = await upload(kind); expect(response.status).toBe(201);
  return (await response.json() as { file: { id: string } }).file.id;
}
function gate() {
  let entered!: () => void, release!: () => void;
  const ready = new Promise<void>((resolve) => { entered = resolve; });
  const wait = new Promise<void>((resolve) => { release = resolve; });
  return { ready, wait, entered, release };
}
function pauseBatch() {
  const original = db.batch.bind(db), hold = gate();
  db.batch = (async (statements: D1PreparedStatement[]) => {
    db.batch = original; hold.entered(); await hold.wait; return original(statements);
  }) as typeof db.batch;
  return hold;
}
function pauseDelete() {
  const original = r2.delete.bind(r2), hold = gate();
  vi.spyOn(r2, "delete").mockImplementationOnce(async (keys) => { hold.entered(); await hold.wait; return original(keys); });
  return hold;
}

beforeEach(async () => {
  db = createD1(); r2 = createR2();
  env = { DB: db, FILES: r2, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "true", NGO_FILES_ENABLED: "true", ALLOWED_ORIGINS: ORIGIN };
  for (const user of ["owner", "admin"]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(user, user, user, user, "Recife", `${user}@example.test`, user === "admin" ? "admin" : "player", "2026-01-01").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(user), user, "2099-01-01").run();
  }
  await db.prepare(`INSERT INTO ngos(id,name,cnpj,cnpj_opened_on,city,summary,description,funds_confirmation,declarations,tags,projects,status,applicant_id,requested_lot_id)
    VALUES(?,'Associação Original','11222333000181','2020-03-10','Recife','Resumo','Descrição','Extratos','{}','[]','[]','submitted','owner','plaza-01')`).bind(NGO).run();
  await db.prepare("UPDATE lots SET ngo_id=?,state='application_sent' WHERE id='plaza-01'").bind(NGO).run();
  await db.prepare("INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','play-memory','win')").run();
});
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

describe("canonical file reconciliation concurrency", () => {
  it("audits only the winning same-revision file deletion", async () => {
    const id = await file(), before = revision();
    vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-12T12:00:00Z"));
    const paused = pauseBatch(), pending = remove(id); await paused.ready;
    expect((await remove(id)).status).toBe(200); paused.release();
    expect((await pending).status).toBe(409);
    expect(audits("ngo.file_remove")).toHaveLength(1); expect(revision()).toBe(before + 1);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]);
  });

  it("refuses an upload after an exact-state change even when the revision did not change", async () => {
    const original = r2.put.bind(r2), paused = gate();
    vi.spyOn(r2, "put").mockImplementationOnce(async (...args) => { const result = await original(...args); paused.entered(); await paused.wait; return result; });
    const pending = upload(); await paused.ready;
    expect((await decision("start_review")).status).toBe(200); expect(revision()).toBe(1);
    paused.release(); expect((await pending).status).toBe(409);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]); expect(audits("ngo.file_add")).toEqual([]);
    // Editing during review remains the canonical PR32 contract after reloading that exact state.
    expect((await upload()).status).toBe(201);
  });

  it("keeps the administrator's reviewed revision stale after a file update", async () => {
    const first = await file();
    const detail = await (await request("GET", `/admin/applications/${NGO}`, "admin")).json() as {
      application: { revision: number }; files: Array<{ id: string }>;
    };
    expect(detail.files.map((row) => row.id)).toEqual([first]);
    const second = await file();
    expect((await decision("approve", detail.application.revision)).status).toBe(409);
    const current = await (await request("GET", `/admin/applications/${NGO}`, "admin")).json() as {
      application: { revision: number }; files: Array<{ id: string }>;
    };
    expect(current.application.revision).toBe(detail.application.revision + 1);
    expect(current.files.map((row) => row.id).sort()).toEqual([first, second].sort());
  });

  it("returns files from the same snapshot as the revision when an upload finishes during the read", async () => {
    const first = await file(), before = revision(), paused = gate();
    const prepare = db.prepare.bind(db);
    db.prepare = ((sql: string) => {
      const statement = prepare(sql);
      if (!sql.includes("FROM ngos")) return statement;
      db.prepare = prepare;
      return { ...statement, bind: (...values: unknown[]) => {
        const bound = statement.bind(...values);
        return { ...bound, first: (async () => {
          const result = await bound.first(); paused.entered(); await paused.wait; return result;
        }) as typeof bound.first };
      } };
    }) as typeof db.prepare;
    const reading = request("GET", `/admin/applications/${NGO}`, "admin"); await paused.ready;
    await file(); paused.release();
    const detail = await (await reading).json() as { application: { revision: number }; files: Array<{ id: string }> };
    expect(detail.application.revision).toBe(before);
    expect(detail.files.map((row) => row.id)).toEqual([first]);
    expect((await decision("approve", detail.application.revision)).status).toBe(409);
  });
});

describe("account file-deletion intent", () => {
  it("freezes approval and file writes while cleanup is in progress but leaves reads available", async () => {
    const logo = await file("logo"), doc = await file(), before = revision();
    const paused = pauseDelete(), pending = deleteAccount(); await paused.ready;
    expect(intent()).toBe(1);
    expect((await decision("approve", before)).status).toBe(409);
    expect((await upload()).status).toBe(409); expect((await remove(doc)).status).toBe(409);
    expect((await request("GET", "/me")).status).toBe(200);
    expect((await request("GET", "/progress")).status).toBe(200);
    paused.release(); expect((await pending).status).toBe(204);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]); expect(audits("ngo.approve")).toEqual([]);
    expect((await request("GET", `/ngos/${NGO}/logo`, "admin")).status).toBe(404);
    expect(db.sql("SELECT id FROM ngo_files WHERE id=?", logo)).toEqual([]);
  });

  it("blocks resubmission after deletion intent without moving its reserved lot", async () => {
    await file(); await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    const paused = pauseDelete(), pending = deleteAccount(); await paused.ready;
    expect((await json("POST", "/ngo/application", APP)).status).toBe(409);
    expect(db.sql("SELECT name,requested_lot_id FROM ngos WHERE id=?", NGO)[0])
      .toEqual({ name: "Associação Original", requested_lot_id: "plaza-01" });
    expect(db.sql("SELECT ngo_id FROM lots WHERE id='plaza-02'")[0].ngo_id).toBe(null);
    paused.release(); expect((await pending).status).toBe(204);
  });

  it("stops an already-read approval if deletion intent wins before its batch", async () => {
    await file("logo"); await file();
    const approvalGate = pauseBatch(), approval = decision(); await approvalGate.ready;
    const cleanupGate = pauseDelete(), deletion = deleteAccount(); await cleanupGate.ready;
    approvalGate.release(); expect((await approval).status).toBe(409); expect(audits("ngo.approve")).toEqual([]);
    cleanupGate.release(); expect((await deletion).status).toBe(204);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]);
  });

  it("retains the published logo when approval wins before account deletion", async () => {
    const logo = await file("logo"); await file();
    expect((await decision()).status).toBe(200);
    expect((await deleteAccount()).status).toBe(204);
    expect(fileRows().map((row) => row.id)).toEqual([logo]); expect(r2.keys()).toEqual([`ngo/${NGO}/${logo}`]);
    expect((await request("GET", `/ngos/${NGO}/logo`, "admin")).status).toBe(200);
  });

  it("invalidates a cached review when account deletion removes its evidence and owner", async () => {
    await file(); const reviewed = revision();
    expect((await deleteAccount()).status).toBe(204);
    expect(revision()).toBeGreaterThan(reviewed);
    expect((await decision("approve", reviewed)).status).toBe(409);
    expect(audits("ngo.approve")).toEqual([]);
  });

  it("does not resume a pre-read approval after the deleting user row is gone", async () => {
    await file();
    const paused = pauseBatch(), pending = decision(); await paused.ready;
    expect((await deleteAccount()).status).toBe(204); expect(intent()).toBeUndefined();
    paused.release(); expect((await pending).status).toBe(409);
    expect(audits("ngo.approve")).toEqual([]);
    expect(db.sql("SELECT status FROM ngos WHERE id=?", NGO)[0].status).toBe("submitted");
  });

  it("cleans an upload that wrote R2 before deletion intent won its final claim", async () => {
    await file();
    const original = r2.put.bind(r2), uploadGate = gate();
    vi.spyOn(r2, "put").mockImplementationOnce(async (...args) => { const result = await original(...args); uploadGate.entered(); await uploadGate.wait; return result; });
    const pendingUpload = upload(); await uploadGate.ready;
    const cleanupGate = pauseDelete(), deletion = deleteAccount(); await cleanupGate.ready;
    uploadGate.release(); expect((await pendingUpload).status).toBe(409);
    cleanupGate.release(); expect((await deletion).status).toBe(204);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]); expect(audits("ngo.file_add")).toHaveLength(1);
  });

  it("stops a previously read resubmission when deletion intent wins its batch", async () => {
    await file(); await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    const submissionGate = pauseBatch(), submission = json("POST", "/ngo/application", APP); await submissionGate.ready;
    const cleanupGate = pauseDelete(), deletion = deleteAccount(); await cleanupGate.ready;
    submissionGate.release(); expect((await submission).status).toBe(409);
    expect(db.sql("SELECT ngo_id FROM lots WHERE id='plaza-02'")[0].ngo_id).toBe(null);
    cleanupGate.release(); expect((await deletion).status).toBe(204);
    expect(audits("ngo.resubmit")).toEqual([]);
  });

  it("does not resume an old owner's resubmission after account deletion completes", async () => {
    await file(); await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    const paused = pauseBatch(), pending = json("POST", "/ngo/application", APP); await paused.ready;
    expect((await deleteAccount()).status).toBe(204); paused.release();
    expect((await pending).status).toBe(409);
    expect(db.sql("SELECT name,requested_lot_id FROM ngos WHERE id=?", NGO)[0])
      .toEqual({ name: "Associação Original", requested_lot_id: "plaza-01" });
    expect(db.sql("SELECT ngo_id FROM lots WHERE id='plaza-02'")[0].ngo_id).toBe(null);
    expect(audits("ngo.resubmit")).toEqual([]);
  });

  it("retains failed deletion intent and resumes cleanup on the same DELETE request", async () => {
    await file(); vi.spyOn(console, "error").mockImplementation(() => {}); r2.failNext("delete");
    expect((await deleteAccount()).status).toBe(500); expect(intent()).toBe(1);
    expect(fileRows()).toHaveLength(1); expect(r2.keys()).toHaveLength(1);
    expect((await upload()).status).toBe(409); expect((await decision()).status).toBe(409);
    expect((await request("GET", "/me")).status).toBe(200);
    expect((await deleteAccount()).status).toBe(204);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]); expect(audits("user.delete")).toHaveLength(1);
  });

  it("fails closed without the files binding and can retry after the binding returns", async () => {
    await file(); env.FILES = undefined;
    expect((await deleteAccount()).status).toBe(503); expect(intent()).toBe(1);
    expect(fileRows()).toHaveLength(1); expect(r2.keys()).toHaveLength(1); expect(audits("user.delete")).toEqual([]);
    env.FILES = r2; expect((await deleteAccount()).status).toBe(204);
    expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]);
  });

  it("records one account deletion when a second retry completes the same cleanup", async () => {
    await file();
    const paused = pauseDelete(), first = deleteAccount(); await paused.ready;
    expect((await deleteAccount()).status).toBe(204); paused.release();
    expect((await first).status).toBe(204);
    expect(audits("user.delete")).toHaveLength(1); expect(fileRows()).toEqual([]); expect(r2.keys()).toEqual([]);
  });
});
