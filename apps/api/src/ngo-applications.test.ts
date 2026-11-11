import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { database } from "./test-database";
import { handleApi, type Env } from "./api";

interface Application { id: string; ngoId: string; lotId: string; status: string; revision: number; feedback: string; }
const origin = "http://localhost:8787", page = "http://localhost:8799";
function cnpj(n: number) {
  let value = `20000000000${n}`;
  for (const weights of [[5,4,3,2,9,8,7,6,5,4,3,2], [6,5,4,3,2,9,8,7,6,5,4,3,2]]) {
    const remainder = [...value].reduce((sum, digit, i) => sum + Number(digit) * weights[i], 0) % 11;
    value += remainder < 2 ? "0" : String(11 - remainder);
  }
  return value;
}
const eligibility = { activeCnpj: true, minimumAge: true, fundsVerification: true };
describe("local-only NGO application and authorized publication", () => {
  let store: ReturnType<typeof database>, env: Env;
  let identities: { id: string; cookie: string }[];
  beforeEach(async () => {
    store = database(); identities = [];
    env = { DB: store.db, ENVIRONMENT: "development", AUTH_MODE: "local", AUTH_API_ORIGIN: origin, AUTH_PAGE_ORIGIN: page, ALLOWED_ORIGINS: page };
    for (let n = 0; n < 3; n++) {
      const id = crypto.randomUUID(), token = String(n + 1).repeat(64);
      const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
      const hash = [...new Uint8Array(bytes)].map((v) => v.toString(16).padStart(2, "0")).join("");
      store.sqlite.prepare("INSERT INTO auth_users (id,email,name,nickname,city,verified_at) VALUES (?,?,?,?,?,?)").run(id, `test${n}@example.test`, "Test Person", `test_${n}`, "Test City", 1);
      store.sqlite.prepare("INSERT INTO auth_sessions VALUES (?,?,?)").run(hash, id, Math.floor(Date.now() / 1000) + 3600);
      identities.push({ id, cookie: `vila_session=${token}` });
    }
    env.ADMIN_USER_IDS = identities[2].id;
  });
  afterEach(() => store.sqlite.close());
  const fields = (n = 1, lotId = "plaza-01") => ({ name: `Test NGO ${n}`, cnpj: cnpj(n), openedOn: "2020-01-01", summary: "Synthetic local review application.\nA second paragraph describes the project.", lotId });
  const call = (path = "/ngo-applications", body?: unknown, who = 0, method = body === undefined ? "GET" : "POST", headers: Record<string, string> = {}) => handleApi(new Request(origin + path, {
    method, headers: { Origin: page, Cookie: identities[who]?.cookie ?? "", "X-Account-ID": identities[who]?.id ?? "", "Content-Type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const applicationOf = async (response: Response) => (await response.json() as { application: Application }).application;
  const submit = async (n = 1, who = 0, lot = "plaza-01") => {
    const response = await call("/ngo-applications", fields(n, lot), who);
    expect(response.status).toBe(201);
    return applicationOf(response);
  };
  const review = (application: Application, action: string, extra: object = {}) => call(`/admin/ngo-applications/${application.id}/review`, { expectedRevision: application.revision, action, ...extra }, 2);
  const auditing = () => Number(store.sqlite.prepare("SELECT COUNT(*) AS n FROM audit_events").get()!.n);
  const get = (application: Application, who = 0) => call(`/ngo-applications/${application.id}`, undefined, who).then(applicationOf);

  it("keeps submission private and unpublished; requires valid sessions and owner isolation", async () => {
    expect((await call("/ngo-applications", undefined, 9)).status).toBe(401);
    const application = await submit();
    expect(application.status).toBe("submitted");
    expect((await call(`/ngo-applications/${application.id}`, undefined, 1)).status).toBe(404);
    const ownList = await call();
    expect(ownList.headers.get("Cache-Control")).toBe("no-store");
    expect((await ownList.json() as { applications: Application[] }).applications).toHaveLength(1);
    expect((await (await call("/ngo-applications", undefined, 1)).json() as { applications: Application[] }).applications).toEqual([]);
    const lots = await (await handleApi(new Request(origin + "/lots"), env)).json() as { lots: { state: string; ngo_name: string | null }[] };
    expect(lots.lots.every((lot) => lot.ngo_name === null && lot.state === "available")).toBe(true);
    expect(auditing()).toBe(0);
    store.sqlite.exec("UPDATE auth_sessions SET expires_at = 0");
    expect((await call()).status).toBe(401);
  });

  it("requires a server allowlist and rejects role spoofing, account mismatch and cross-origin writes", async () => {
    const application = await submit();
    expect((await call("/admin/ngo-applications", undefined, 0)).status).toBe(403);
    expect((await call(`/admin/ngo-applications/${application.id}/review`, { expectedRevision: 1, action: "start_review", role: "admin" }, 0)).status).toBe(403);
    expect((await call("/ngo-applications", fields(2), 0, "POST", { "X-Account-ID": identities[1].id })).status).toBe(409);
    expect((await call("/ngo-applications", fields(2), 0, "POST", { Origin: "https://evil.test" })).status).toBe(403);
    env.ADMIN_USER_IDS = "";
    expect((await review(application, "start_review")).status).toBe(403);
    expect(auditing()).toBe(0);
  });

  it("audits review changes and resubmits only owner applications requested for changes", async () => {
    const initial = await submit();
    expect((await call(`/ngo-applications/${initial.id}`, { ...fields(), expectedRevision: 1 }, 0, "PUT")).status).toBe(409);
    const reviewing = await applicationOf(await review(initial, "start_review"));
    const changed = await applicationOf(await review(reviewing, "request_changes", { feedback: "Please clarify the proposal.\nInclude the revised plan." }));
    expect(changed.feedback).toBe("Please clarify the proposal.\nInclude the revised plan.");
    expect(auditing()).toBe(2);
    expect((await call(`/ngo-applications/${initial.id}`, { ...fields(), expectedRevision: changed.revision }, 1, "PUT")).status).toBe(404);
    const resubmitted = await applicationOf(await call(`/ngo-applications/${initial.id}`, { ...fields(), expectedRevision: changed.revision }, 0, "PUT"));
    expect(resubmitted.status).toBe("submitted");
    expect(resubmitted.revision).toBe(4);
    expect(auditing()).toBe(2);
    expect((await review(initial, "start_review")).status).toBe(409);
    const history = store.sqlite.prepare("SELECT detail FROM audit_events").all();
    expect(JSON.stringify(history)).not.toContain("Please clarify");
  });

  it("publishes only after three eligibility attestations and does not audit approval replay", async () => {
    const reviewing = await applicationOf(await review(await submit(), "start_review"));
    expect((await review(reviewing, "approve")).status).toBe(400);
    expect((await review(reviewing, "approve", { eligibility: { ...eligibility, activeCnpj: false } })).status).toBe(400);
    expect(auditing()).toBe(1);
    const responses = await Promise.all([review(reviewing, "approve", { eligibility }), review(reviewing, "approve", { eligibility })]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(auditing()).toBe(2);
    expect((await get(reviewing)).status).toBe("published");
    const lot = store.sqlite.prepare("SELECT state, ngo_id FROM lots WHERE id = 'plaza-01'").get()!;
    expect(lot).toMatchObject({ state: "published", ngo_id: reviewing.ngoId });
    expect((await review(reviewing, "approve", { eligibility })).status).toBe(409);
    expect(auditing()).toBe(2);
  });

  it("allows only one of two approved applications to claim a lot, without publishing/auditing the loser", async () => {
    const one = await applicationOf(await review(await submit(1), "start_review"));
    const two = await applicationOf(await review(await submit(2, 1), "start_review"));
    const responses = await Promise.all([review(one, "approve", { eligibility }), review(two, "approve", { eligibility })]);
    expect(responses.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(auditing()).toBe(3);
    const states = store.sqlite.prepare("SELECT status FROM ngos ORDER BY cnpj").all().map((row) => row.status);
    expect(states.sort()).toEqual(["published", "under_review"]);
    expect(store.sqlite.prepare("SELECT COUNT(*) AS n FROM lots WHERE ngo_id IS NOT NULL").get()!.n).toBe(1);
  });

  it("accepts bounded accented paragraphs and rejects bodies above the NGO byte limit", async () => {
    const response = await call("/ngo-applications", { ...fields(), name: "Á".repeat(120), summary: "é".repeat(2000) });
    expect(response.status).toBe(201);
    const submitted = await applicationOf(response);
    const reviewing = await applicationOf(await review(submitted, "start_review"));
    const feedback = "ç".repeat(2000);
    const changed = await applicationOf(await review(reviewing, "request_changes", { feedback }));
    expect(changed.feedback).toBe(feedback);
    const oversized = await call("/ngo-applications", { ...fields(2), summary: "x".repeat(9000) });
    expect(oversized.status).toBe(400);
    expect(await oversized.json()).toEqual({ error: "invalid_body" });
  });

  it("does not publish rejected applications and rejects invalid fields, duplicates or stale revisions", async () => {
    for (const fieldsValue of [{ ...fields(), cnpj: "11111111111111" }, { ...fields(), cnpj: "12345678901234" }, { ...fields(), openedOn: "2099-01-01" }, { ...fields(), openedOn: "2020-02-30" }, { ...fields(), summary: "short" }, { ...fields(), ownerId: identities[1].id }]) expect((await call("/ngo-applications", fieldsValue)).status).toBe(400);
    const initial = await submit();
    expect((await call("/ngo-applications", fields())).status).toBe(409);
    const reviewing = await applicationOf(await review(initial, "start_review"));
    expect((await review(reviewing, "reject", { feedback: "Not eligible for this local test." })).status).toBe(200);
    expect(store.sqlite.prepare("SELECT COUNT(*) AS n FROM lots WHERE ngo_id IS NOT NULL").get()!.n).toBe(0);
    expect((await review(reviewing, "approve", { eligibility })).status).toBe(409);
    env.ENVIRONMENT = "production";
    expect((await call()).status).toBe(503);
  });
});
