/**
 * Donations end to end on the real migrations (IMPL-0023, PROPOSTA): admin configuration, Pix charges with the
 * provider split, signed webhook reconciliation, Título credit exactly once, refund reversal, external links and
 * proofs, sandbox fallback and the schema guard. The provider is a stub: no test reaches AbacatePay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import countPaidGlobalPix from "../scripts/count-paid-global-pix.sql?raw";
import summarizePaidDonations from "../scripts/summarize-paid-donations.sql?raw";
import { configuredVars, devVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { ABACATEPAY_PUBLIC_KEY, createOrGetSubAccount, createPixCharge } from "./abacatepay";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

const NGO = "a0000000-0000-4000-8000-000000000001";
const ORIGIN = "https://play.example";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const API_KEY = "abc_dev_test_key";
const BASE = "https://pay.test/v2";
const PRIMARY_CNPJ = "11444777000161";
const NGO_CNPJ = "11222333000181";

type ProviderCall = { path: string; body: Record<string, unknown> | null; authorization: string | null; returnedSubAccountId?: string };
let db: ReturnType<typeof createD1>;
let env: Env;
let calls: ProviderCall[];
let chargeCounter: number;
/** What the stub answers for `POST /sub-accounts/create`, when a test needs a refusal. */
let subAccountFailure: { status: number; body: unknown } | null;

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function stubProvider(): void {
  chargeCounter = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(String(input));
    const body = init.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;
    const headers = new Headers(init.headers);
    const call: ProviderCall = { path: url.pathname + url.search, body, authorization: headers.get("Authorization") };
    calls.push(call);
    if (url.pathname.endsWith("/sub-accounts/create")) {
      if (subAccountFailure) return reply(subAccountFailure.status, subAccountFailure.body);
      const taxId = String(body?.taxId ?? "");
      call.returnedSubAccountId = `sacc_${taxId}`;
      return reply(200, { data: { id: call.returnedSubAccountId, devMode: true }, error: null, success: true });
    }
    if (url.pathname.endsWith("/transparents/create")) {
      chargeCounter++;
      return reply(200, {
        data: {
          id: `pix_char_${chargeCounter}`,
          status: "PENDING",
          amount: (body?.data as { amount?: number } | undefined)?.amount,
          brCode: `000201-charge-${chargeCounter}`,
          brCodeBase64: `data:image/png;base64,CHARGE${chargeCounter}`,
          devMode: true,
          expiresAt: "2099-01-01T00:00:00.000Z",
        },
        error: null,
      });
    }
    if (url.pathname.endsWith("/transparents/check") || url.pathname.endsWith("/transparents/simulate-payment")) {
      const id = url.searchParams.get("id");
      return reply(200, { data: { id, status: "PAID", receiptUrl: "https://pay.test/receipt", platformFee: 80, devMode: true }, error: null });
    }
    return reply(404, { data: null, error: "not_found" });
  });
}

const request = (method: string, path: string, user: string | null, origin: string | null, headers: Record<string, string>, body?: BodyInit) =>
  handleApi(
    new Request(`https://api.example${path}`, {
      method,
      headers: { ...(origin ? { Origin: origin } : {}), ...(user ? { Cookie: `__Host-vila_session=${user}` } : {}), ...headers },
      body,
    }),
    env
  );
const call = (method: string, path: string, body?: unknown, user: string | null = "admin", origin: string | null = ORIGIN) =>
  request(method, path, user, origin, body === undefined ? {} : { "Content-Type": "application/json" }, body === undefined ? undefined : JSON.stringify(body));
const count = (table: string) => db.sql(`SELECT COUNT(*) AS n FROM ${table}`)[0].n as number;

const settings = (override: Record<string, unknown> = {}) =>
  call("POST", "/admin/donations/settings", {
    accountId: "admin",
    primaryNgoName: "Instituto Parceiro",
    primaryNgoCnpj: PRIMARY_CNPJ,
    ngoPercentBps: 9500,
    fixedFeeCents: 80,
    ...override,
  });
const ngoPayment = (override: Record<string, unknown> = {}, ngoId = NGO) =>
  call("POST", `/admin/ngos/${ngoId}/payment-config`, { accountId: "admin", paymentMethod: "abacatepay", ngoPercentBps: 9500, fixedFeeCents: 80, ...override });
/** A Pix request; each call is a new logical request unless the body carries its own `idempotencyKey`. */
const pix = (body: Record<string, unknown>, user: string | null) => call("POST", "/donations/pix", { idempotencyKey: crypto.randomUUID(), ...body }, user);

/** The provider's signature, exactly as abacatepay.ts verifies it (Web Crypto, base64 of the HMAC). */
async function sign(raw: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(ABACATEPAY_PUBLIC_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw)));
  return btoa([...mac].map((byte) => String.fromCharCode(byte)).join(""));
}

async function webhook(event: unknown, options: { secret?: string; signature?: string } = {}) {
  const raw = JSON.stringify(event);
  const signature = options.signature ?? (await sign(raw));
  return request("POST", "/webhooks/abacatepay", null, null, {
    "Content-Type": "application/json",
    "X-Webhook-Secret": options.secret ?? SECRET,
    "X-Webhook-Signature": signature,
  }, raw);
}
const event = (id: string, name: string, chargeId: string, status: string, amount = 1000) => ({
  id,
  event: name,
  devMode: true,
  data: { transparent: { id: chargeId, status, amount, platformFee: 80, receiptUrl: "https://pay.test/receipt" } },
});

/** Users, sessions and one published NGO on plaza-01. */
async function seed() {
  for (const [id, role] of [
    ["admin", "admin"],
    ["owner", "player"],
    ["donor", "player"],
    ["applicant", "player"],
  ] as const) {
    await db
      .prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES(?,?,?,?,?,?,?,?)")
      .bind(id, id, id, id, "Recife", `${id}@example.test`, role, "2026-01-01")
      .run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex(id), id, "2099-01-01").run();
  }
  await db
    .prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES(?, 'Associação Exemplo', ?, 'published', 'owner', 'plaza-01')")
    .bind(NGO, NGO_CNPJ)
    .run();
  await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
}

beforeEach(async () => {
  db = createD1();
  env = {
    DB: db,
    ENVIRONMENT: "test",
    ALLOWED_ORIGINS: ORIGIN,
    ACCOUNTS_ENABLED: "true",
    DONATIONS_ENABLED: "true",
    ABACATEPAY_API_KEY: API_KEY,
    ABACATEPAY_WEBHOOK_SECRET: SECRET,
    ABACATEPAY_BASE_URL: BASE,
  };
  calls = [];
  subAccountFailure = null;
  stubProvider();
  await seed();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Every delivery from here on is processed in the same millisecond, as on a fast machine or a provider burst. */
function freezeClock(): void {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-13T12:00:00.000Z"));
}

describe("configuration", () => {
  it("saves the global partner with its split and the sub-account created from the CNPJ, and audits it", async () => {
    const response = await settings();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { settings: Record<string, unknown> };
    expect(body.settings).toMatchObject({ primaryNgoName: "Instituto Parceiro", ngoPercentBps: 9500, fixedFeeCents: 80, configured: true });
    expect(body.settings.subAccountId).toBe(`sacc_${PRIMARY_CNPJ}`);
    const call0 = calls[0];
    expect(call0.path).toBe("/v2/sub-accounts/create");
    expect(call0.body).toEqual({ name: "Instituto Parceiro", taxId: PRIMARY_CNPJ, externalId: "vila-global" });
    expect(call0.authorization).toBe(`Bearer ${API_KEY}`);
    const audit = db.sql("SELECT actor,action,subject,detail FROM audit_events")[0];
    expect(audit).toMatchObject({ actor: "admin", action: "donation.settings_update", subject: "donation:global" });
    expect(audit.detail).not.toContain(PRIMARY_CNPJ);
    // The public configuration never carries the CNPJ or the sub-account id.
    const publicConfig = await (await call("GET", "/donations/config", undefined, null, null)).text();
    expect(JSON.parse(publicConfig)).toMatchObject({ global: { enabled: true, recipientName: "Instituto Parceiro", minAmountCents: 200 } });
    expect(publicConfig).not.toMatch(new RegExp(`subAccountId|primaryNgoCnpj|${PRIMARY_CNPJ}`));
  });

  it("refuses an invalid CNPJ and a split the provider would reject", async () => {
    const badCnpj = await settings({ primaryNgoCnpj: "11222333000180" });
    expect([badCnpj.status, ((await badCnpj.json()) as { fields: Record<string, string> }).fields.primaryNgoCnpj]).toMatchObject([400, expect.stringContaining("CNPJ")]);
    const badSplit = await settings({ ngoPercentBps: 100 });
    expect([badSplit.status, ((await badSplit.json()) as { fields: Record<string, string> }).fields.split]).toMatchObject([400, expect.stringContaining("doação mínima")]);
    expect(count("donation_settings")).toBe(0);
    expect(calls).toEqual([]);
  });

  it("requires the admin account and an allowed page origin", async () => {
    expect((await call("POST", "/admin/donations/settings", {}, "donor")).status).toBe(403);
    expect((await call("POST", "/admin/donations/settings", {}, "admin", "https://evil.example")).status).toBe(403);
    expect(count("donation_settings")).toBe(0);
  });

  it("provisions the NGO sub-account from its own CNPJ", async () => {
    const response = await ngoPayment();
    expect(response.status).toBe(200);
    expect(calls[0].body).toEqual({ name: "Associação Exemplo", taxId: NGO_CNPJ, externalId: NGO });
    expect(db.sql("SELECT payment_method,sub_account_id,link_validated FROM ngo_payment_configs WHERE ngo_id=?", NGO)[0]).toEqual({
      payment_method: "abacatepay",
      sub_account_id: `sacc_${NGO_CNPJ}`,
      link_validated: 0,
    });
  });

  it("sends a 100-character beneficiary name unchanged for both sub-accounts", async () => {
    const name = "A".repeat(99) + "🌱";
    await db.prepare("UPDATE ngos SET name=? WHERE id=?").bind(name, NGO).run();
    expect((await settings({ primaryNgoName: name })).status).toBe(200);
    expect((await ngoPayment()).status).toBe(200);
    expect(calls.map(c => c.body?.name)).toEqual([name, name]);
  });

  it("rejects a 101-character beneficiary name before automatic provisioning and preserves the other routes", async () => {
    const name = "A".repeat(100) + "🌱";
    await db.prepare("UPDATE ngos SET name=? WHERE id=?").bind(name, NGO).run();
    subAccountFailure = { status: 400, body: { error: "name too long" } };
    for (const response of [await settings({ primaryNgoName: name }), await ngoPayment()]) {
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: "invalid_subaccount_name" });
    }
    expect([count("donation_settings"), count("ngo_payment_configs"), count("audit_events")]).toEqual([0, 0, 0]);
    expect((await settings({ primaryNgoName: name, subAccountId: "sacc_global" })).status).toBe(200);
    expect((await ngoPayment({ revision: 1, subAccountId: "sacc_ngo" })).status).toBe(200);
    expect((await ngoPayment({ revision: 1, paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar", linkValidated: true })).status).toBe(200);
    expect(calls).toEqual([]);
  });

  it("recovers the same NGO sub-account after the payment configuration transaction rolls back", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const subAccountId = `sacc_${NGO_CNPJ}`;
    const beneficiary = { body: { taxId: NGO_CNPJ, externalId: NGO }, returnedSubAccountId: subAccountId };
    const provisioning = () => calls.filter((c) => c.path.endsWith("/sub-accounts/create"));
    const audits = () => db.sql("SELECT actor, subject FROM audit_events WHERE action = 'ngo.payment_config'");
    const directedPix = { targetKind: "ngo", ngoId: NGO, amountCents: 1000 };

    // Fail the audit after the configuration write in the same D1 batch.
    await db.exec(`CREATE TEMP TRIGGER fail_payment_audit BEFORE INSERT ON audit_events
      WHEN NEW.action = 'ngo.payment_config'
      BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END`);
    expect((await ngoPayment({ revision: 1 })).status).toBe(500);
    expect(provisioning()).toMatchObject([beneficiary]);
    expect(count("ngo_payment_configs")).toBe(0);
    expect(audits()).toEqual([]);
    expect((await pix(directedPix, "donor")).status).toBe(409);
    expect(chargeCounter).toBe(0);

    await db.exec("DROP TRIGGER fail_payment_audit");
    expect((await ngoPayment({ revision: 1 })).status).toBe(200);
    expect(provisioning()).toMatchObject([beneficiary, beneficiary]);
    expect(db.sql("SELECT ngo_id, sub_account_id FROM ngo_payment_configs")).toEqual([
      { ngo_id: NGO, sub_account_id: subAccountId },
    ]);
    expect(audits()).toEqual([{ actor: "admin", subject: `ngo:${NGO}` }]);
    expect((await pix(directedPix, "donor")).status).toBe(201);
    expect(calls.filter((c) => c.path.endsWith("/transparents/create"))).toMatchObject([
      { body: { data: { splits: [{ subAccountId, amount: 870 }] } } },
    ]);
  });

  it("falls back to the sandbox marker when AbacatePay has not enabled sub-accounts yet (never in production)", async () => {
    subAccountFailure = { status: 403, body: { success: false, data: null, error: "Insufficient permissions" } };
    const dev = await settings();
    expect(dev.status).toBe(200);
    expect(((await dev.json()) as { settings: { subAccountId: string } }).settings.subAccountId).toBe(`dev_sacc_${PRIMARY_CNPJ}`);
    // The charge for a development sub-account carries no `splits`, but D1 keeps the full breakdown.
    const created = await pix({ targetKind: "global", amountCents: 1000 }, "donor");
    expect(created.status).toBe(201);
    const create = calls.find((c) => c.path.endsWith("/transparents/create"));
    expect((create?.body?.data as { splits?: unknown }).splits).toBeUndefined();
    expect(db.sql("SELECT ngo_share_cents,vila_share_cents,sub_account_id FROM donations")[0]).toEqual({
      ngo_share_cents: 870,
      vila_share_cents: 130,
      sub_account_id: `dev_sacc_${PRIMARY_CNPJ}`,
    });
    env.ENVIRONMENT = "production";
    const prod = await settings({ subAccountId: undefined });
    expect(prod.status).toBe(409);
    expect(((await prod.json()) as { error: string }).error).toBe("subaccounts_unavailable");
  });

  it("does not turn a provider validation refusal into a sandbox sub-account", async () => {
    subAccountFailure = { status: 400, body: { success: false, data: null, error: "CPF ou CNPJ inválido" } };
    await expect(createOrGetSubAccount(env, { name: "Associação Exemplo", taxId: NGO_CNPJ, externalId: NGO })).rejects.toMatchObject({ status: 503 });
    expect(count("donation_settings")).toBe(0);
  });

  it("refuses a sandbox sub-account id in production instead of silently dropping the split", async () => {
    env.ENVIRONMENT = "production";
    const refused = await settings({ subAccountId: "dev_sacc_x" });
    expect(refused.status).toBe(400);
    const fields = ((await refused.json()) as { fields?: Record<string, string> }).fields ?? {};
    expect(fields.subAccountId).toContain("produção");
    calls = [];
    await expect(
      createPixCharge(env, { amountCents: 500, description: "Doacao", externalId: "e1", subAccountId: "dev_sacc_x", ngoShareCents: 100, metadata: {} })
    ).rejects.toMatchObject({ status: 409 });
    expect(calls).toEqual([]);
    expect(count("donation_settings")).toBe(0);
  });

  it("reports a withdrawn NGO as withdrawn in the donations overview", async () => {
    await db.prepare("UPDATE ngos SET revision = 2 WHERE id = ?").bind(NGO).run();
    await db
      .prepare("INSERT INTO ngo_withdrawals (ngo_id, operation_token, reason, actor, withdrawn_at, revision, lot_ids) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(NGO, "op-1", "Mensagem para a organização.", "admin", "2026-11-13T00:00:00.000Z", 2, JSON.stringify(["plaza-01"]))
      .run();
    const body = (await (await call("GET", "/admin/donations/overview")).json()) as { ngos: Array<{ id: string; status: string }> };
    expect(body.ngos.find((n) => n.id === NGO)?.status).toBe("withdrawn");
  });
});

describe("access to Pix issuance", () => {
  const targets = [{ targetKind: "global", amountCents: 1000 }, { targetKind: "ngo", ngoId: NGO, amountCents: 1000 }];
  const expectRefusal = async (response: Response, status: number, error: string) => {
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error });
  };
  const expectNoIssuance = () => {
    expect([count("donation_intents"), count("donations"), chargeCounter]).toEqual([0, 0, 0]);
  };

  it("keeps Pix dark on old schemas even with a cookie when donations are off", async () => {
    env.DB = createD1({ upTo: 3 });
    env.DONATIONS_ENABLED = "false";
    for (const user of [null, "donor"]) await expectRefusal(await pix(targets[0], user), 404, "not_found");
    expect(calls).toEqual([]);
  });

  it("requires both features for new global and directed Pix even with an existing session", async () => {
    env.ACCOUNTS_ENABLED = "false";
    for (const target of targets) await expectRefusal(await pix(target, "donor"), 404, "accounts_disabled");
    expectNoIssuance();
  });

  it("refuses visitors, expired sessions and blocked accounts at both destinations", async () => {
    await db.prepare("UPDATE sessions SET expires_at='2000-01-01' WHERE user_id='owner'").run();
    await db.prepare("UPDATE users SET blocked=1 WHERE id='applicant'").run();
    for (const target of targets) {
      await expectRefusal(await pix(target, null), 401, "not_signed_in");
      await expectRefusal(await pix(target, "owner"), 401, "not_signed_in");
      await expectRefusal(await pix(target, "applicant"), 403, "session_blocked");
    }
    expectNoIssuance();
    expect((await call("GET", `/ngos/${NGO}`, undefined, null)).status).toBe(200);
    expect((await call("GET", "/donations/config", undefined, null)).status).toBe(200);
  });

  it("requires the session and public terms shown to the donor when the client includes them", async () => {
    await settings({ ngoPercentBps: 9500, fixedFeeCents: 80 });
    const expectedTerms = { recipientName: "Instituto Parceiro", ngoPercentBps: 9500, fixedFeeCents: 80 };
    const body = { ...targets[0], accountId: "donor", expectedTerms, idempotencyKey: crypto.randomUUID() };
    await expectRefusal(await pix(body, "owner"), 409, "account_changed");
    await expectRefusal(await pix(body, null), 401, "not_signed_in");
    for (const change of [{ recipientName: "Outra" }, { ngoPercentBps: 9200 }, { fixedFeeCents: 90 }])
      await expectRefusal(await pix({ ...body, expectedTerms: { ...expectedTerms, ...change } }, "donor"), 409, "donation_terms_changed");
    expectNoIssuance();
    expect((await pix(body, "donor")).status).toBe(201);
    expect((await pix(body, "donor")).status).toBe(200);
    await expectRefusal(await pix(body, "owner"), 409, "account_changed");
    expect(chargeCounter).toBe(1);
  });

  it("checks the session again when claiming a new intent", async () => {
    await settings();
    env.DONATION_LIMITER = { limit: async () => {
      await db.prepare("DELETE FROM sessions WHERE user_id='donor'").run();
      return { success: true };
    } };
    await expectRefusal(await pix(targets[0], "donor"), 401, "not_signed_in");
    expectNoIssuance();
  });

  it("keeps historical anonymous payments anonymous through confirmation and refund", async () => {
    const id = crypto.randomUUID(), charge = "pix_char_old";
    await db.prepare(`INSERT INTO donations
      (id,target_kind,ngo_id,recipient_name,provider,provider_charge_id,sub_account_id,amount_cents,ngo_share_cents,vila_share_cents,ngo_percent_bps,fixed_fee_cents)
      VALUES (?, 'ngo', ?, 'ONG antiga', 'abacatepay', ?, 'sacc_original', 1000, 870, 130, 9500, 80)`).bind(id, NGO, charge).run();

    for (const [action, state, expectedCount] of [["completed", "paid", 1], ["refunded", "refunded", 0]] as const) {
      const response = await webhook(event(`log_legacy_${action}`, `transparent.${action}`, charge, state.toUpperCase()));
      expect(await response.json()).toMatchObject({ applied: true });
      expect(db.sql("SELECT user_id,ngo_id,sub_account_id,status,title_credited FROM donations WHERE id=?", id)).toEqual([
        { user_id: null, ngo_id: NGO, sub_account_id: "sacc_original", status: state, title_credited: 0 },
      ]);
      expect(await (await call("GET", "/indicators", undefined, null)).json()).toMatchObject({ indicators: expect.arrayContaining([
        expect.objectContaining({ key: "confirmed_donations", value: expectedCount }),
        expect.objectContaining({ key: "confirmed_amount", value: expectedCount * 1000 }),
      ]) });
      expect(await (await call("GET", "/donations/my-title", undefined, "donor")).json()).toMatchObject({
        title: { confirmedCount: 0 }, donations: [],
      });
    }
    expect(calls).toEqual([]);
  });

  it.each(["true", "false"])("recovers an issued anonymous intent with accounts %s, without a new provider call", async (accounts) => {
    const id = crypto.randomUUID(), key = crypto.randomUUID(), charge = "pix_char_stored";
    const body = { ...targets[1], idempotencyKey: key };
    const hash = await sha256Hex(JSON.stringify(["ngo", NGO, 1000, null]));
    await db.prepare(`INSERT INTO donation_intents
      (id,idempotency_key,request_hash,target_kind,ngo_id,recipient_name,sub_account_id,amount_cents,ngo_share_cents,vila_share_cents,
       ngo_percent_bps,fixed_fee_cents,state,last_error,provider_charge_id,provider_status,br_code)
      VALUES (?,?,?,'ngo',?,'ONG antiga','sacc_original',1000,870,130,9500,80,'unknown','store_failed',?,'PENDING','fixture-pix')`)
      .bind(id, key, hash, NGO, charge).run();
    const paid = event("log_before_row", "transparent.completed", charge, "PAID");
    expect(await (await webhook(paid)).json()).toMatchObject({ unmatched: true });
    await expectRefusal(await pix(body, "donor"), 409, "idempotency_key_reused");
    env.ACCOUNTS_ENABLED = accounts;
    await expectRefusal(await pix({ ...body, amountCents: 500 }, null), accounts === "true" ? 401 : 404, accounts === "true" ? "not_signed_in" : "accounts_disabled");
    expect(count("donations")).toBe(0);
    for (const status of [201, 200]) {
      const recovered = await pix(body, null);
      expect(recovered.status).toBe(status);
      expect(await recovered.json()).toMatchObject({ donation: { id, status: "paid", titleCredited: false } });
    }
    env.ACCOUNTS_ENABLED = "true";
    await expectRefusal(await pix(body, "donor"), 409, "idempotency_key_reused");
    await expectRefusal(await pix(targets[1], null), 401, "not_signed_in");
    expect(await (await webhook(paid)).json()).toMatchObject({ duplicate: true });
    expect(db.sql("SELECT id,user_id,provider_charge_id,sub_account_id,title_credited FROM donations")).toEqual([
      { id, user_id: null, provider_charge_id: charge, sub_account_id: "sacc_original", title_credited: 0 },
    ]);
    expect(db.sql("SELECT id,user_id,state FROM donation_intents")).toEqual([{ id, user_id: null, state: "created" }]);
    expect(count("abacatepay_webhook_events")).toBe(1);
    expect(calls).toEqual([]);
  });
});

describe("Pix donations", () => {
  beforeEach(async () => {
    await settings();
    await ngoPayment();
  });

  it("splits the R$ 2,00 minimum exactly and sends the NGO share to the sub-account", async () => {
    const response = await pix({ targetKind: "global", amountCents: 200 }, "donor");
    expect(response.status).toBe(201);
    const { donation } = (await response.json()) as { donation: Record<string, unknown> };
    expect(donation).toMatchObject({
      targetKind: "global",
      ngoId: null,
      recipientName: "Instituto Parceiro",
      amountCents: 200,
      ngoShareCents: 110,
      vilaShareCents: 90,
      status: "pending",
      brCode: "000201-charge-1",
      brCodeBase64: "data:image/png;base64,CHARGE1",
      devMode: true,
      titleCredited: false,
    });
    const create = calls.find((c) => c.path.endsWith("/transparents/create"));
    expect(create?.body).toMatchObject({
      method: "PIX",
      data: { amount: 200, externalId: donation.id, metadata: { donationId: donation.id, targetKind: "global" }, splits: [{ subAccountId: `sacc_${PRIMARY_CNPJ}`, amount: 110 }] },
    });
    expect(db.sql("SELECT provider,status,amount_cents FROM donations")[0]).toEqual({ provider: "abacatepay", status: "pending", amount_cents: 200 });
  });

  it("keeps the Pix description inside the provider's 140-character limit", async () => {
    await db.prepare("UPDATE ngos SET name = ? WHERE id = ?").bind("O".repeat(120), NGO).run();
    const response = await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 500 }, "donor");
    expect(response.status).toBe(201);
    const create = calls.find((c) => c.path.endsWith("/transparents/create"));
    const description = (create?.body?.data as { description?: string } | undefined)?.description ?? "";
    expect(description.length).toBe(140);
  });

  it("pays the NGO's own sub-account and credits the account that issued the Pix", async () => {
    const response = await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 1000 }, "donor");
    expect(response.status).toBe(201);
    const { donation } = (await response.json()) as { donation: { id: string } };
    const create = calls.find((c) => c.path.endsWith("/transparents/create"));
    expect((create?.body?.data as { splits: unknown[] }).splits).toEqual([{ subAccountId: `sacc_${NGO_CNPJ}`, amount: 870 }]);
    const chargeId = db.sql("SELECT provider_charge_id FROM donations WHERE id=?", donation.id)[0].provider_charge_id as string;
    expect((await webhook(event("log_donor", "transparent.completed", chargeId, "PAID"))).status).toBe(200);
    expect(db.sql("SELECT status,user_id,title_credited FROM donations WHERE id=?", donation.id)[0]).toEqual({ status: "paid", user_id: "donor", title_credited: 1 });
  });

  it("refuses amounts and targets it cannot honour, before calling the provider", async () => {
    for (const amountCents of [199, 0, -100, 5_000_001, 2.5]) {
      const response = await pix({ targetKind: "global", amountCents }, "donor");
      expect([amountCents, response.status, ((await response.json()) as { error: string }).error]).toEqual([amountCents, 400, "invalid_donation_amount"]);
    }
    expect((await pix({ targetKind: "ngo", ngoId: "a0000000-0000-4000-8000-000000000099", amountCents: 500 }, "donor")).status).toBe(404);
    expect((await pix({ targetKind: "global", amountCents: 500 }, "donor")).status).toBe(201);
    expect(calls.filter((c) => c.path.endsWith("/transparents/create"))).toHaveLength(1);
  });

  it("answers payment_provider_unavailable, writes no donation and keeps the intent when the provider fails", async () => {
    vi.stubGlobal("fetch", async () => reply(500, { data: null, error: "internal" }));
    const response = await pix({ targetKind: "global", amountCents: 1000 }, "donor");
    expect([response.status, ((await response.json()) as { error: string }).error]).toEqual([503, "payment_provider_unavailable"]);
    expect(count("donations")).toBe(0);
    // A 5xx may have created the charge: the intent stays, for an operator, with only the error code.
    expect(db.sql("SELECT state,last_error FROM donation_intents")).toEqual([{ state: "unknown", last_error: "payment_provider_unavailable" }]);
  });

  it("refreshes a pending charge from the provider and answers a paid donation", async () => {
    const { donation } = (await (await pix({ targetKind: "global", amountCents: 500 }, "donor")).json()) as { donation: { id: string } };
    const refreshed = await call("GET", `/donations/${donation.id}?refresh=1`, undefined, null, null);
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject({ donation: { status: "paid", receiptUrl: "https://pay.test/receipt", titleCredited: true } });
    expect((await call("GET", "/donations/not-a-uuid", undefined, null, null)).status).toBe(404);
  });

  it("lets a sandbox charge be simulated, but never in production", async () => {
    const { donation } = (await (await pix({ targetKind: "global", amountCents: 500 }, "donor")).json()) as { donation: { id: string } };
    const simulated = await call("POST", `/donations/${donation.id}/simulate`);
    expect(simulated.status).toBe(200);
    expect(await simulated.json()).toMatchObject({ donation: { status: "paid" } });
    env.ENVIRONMENT = "production";
    expect((await call("POST", `/donations/${donation.id}/simulate`)).status).toBe(404);
  });
});

it("keeps the NGO and global splits and confirmed totals isolated across webhook replays", async () => {
  const globalPixCount = () => db.sql(countPaidGlobalPix)[0].paid_global_pix;
  expect(globalPixCount()).toBe(0);
  const ngoB = "b0000000-0000-4000-8000-000000000002";
  await db.prepare("INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES(?, 'ONG B', '22345678000149', 'published', 'applicant', 'plaza-02')").bind(ngoB).run();
  await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-02'").bind(ngoB).run();
  expect((await ngoPayment({ revision: 1, subAccountId: "sacc_a", ngoPercentBps: 9250, fixedFeeCents: 113 })).status).toBe(200);
  expect((await ngoPayment({ revision: 1, subAccountId: "sacc_b" }, ngoB)).status).toBe(200);
  expect((await settings({ subAccountId: "sacc_global", ngoPercentBps: 8750, fixedFeeCents: 89 })).status).toBe(200);
  expect(calls).toEqual([]);

  async function expectTotals(ngoCount: number, ngoCents: number, totalCount: number, totalCents: number) {
    for (const [ngoId, confirmedDonations, confirmedAmountCents] of [[NGO, ngoCount, ngoCents], [ngoB, 0, 0]] as const) {
      const response = await call("GET", `/ngos/${ngoId}/donation-info`, undefined, null, null);
      expect(await response.json()).toMatchObject({ ngoId, enabled: true, confirmedDonations, confirmedAmountCents });
    }
    const publicTotals = await call("GET", "/indicators", undefined, null, null);
    expect(await publicTotals.json()).toMatchObject({
      indicators: expect.arrayContaining([
        expect.objectContaining({ key: "confirmed_donations", value: totalCount }),
        expect.objectContaining({ key: "confirmed_amount", value: totalCents }),
      ]),
    });
  }

  // Each rate applies to the gross cents before the fixed deduction. Both vectors include a fractional cent.
  const cases = [
    { kind: "ngo", ngoId: NGO, name: "Associação Exemplo", sub: "sacc_a", gross: 10001, bps: 9250, fixed: 113, ngo: 9137, vila: 864, charge: "pix_char_1", totalCount: 1, totalCents: 10001 },
    { kind: "global", ngoId: null, name: "Instituto Parceiro", sub: "sacc_global", gross: 3333, bps: 8750, fixed: 89, ngo: 2827, vila: 506, charge: "pix_char_2", totalCount: 2, totalCents: 13334 },
  ] as const;
  await expectTotals(0, 0, 0, 0);
  for (const c of cases) {
    const idempotencyKey = crypto.randomUUID();
    const response = await pix({ targetKind: c.kind, ngoId: c.ngoId, amountCents: c.gross, idempotencyKey }, "donor");
    expect(response.status).toBe(201);
    const { donation } = (await response.json()) as { donation: { id: string } };
    expect(calls.at(-1)).toMatchObject({
      path: "/v2/transparents/create",
      body: { method: "PIX", data: { externalId: donation.id, metadata: { donationId: donation.id, targetKind: c.kind }, amount: c.gross, splits: [{ subAccountId: c.sub, amount: c.ngo }] } },
    });
    const snapshot = {
      id: donation.id, user_id: "donor", provider_charge_id: c.charge, target_kind: c.kind, ngo_id: c.ngoId,
      recipient_name: c.name, sub_account_id: c.sub, amount_cents: c.gross,
      ngo_percent_bps: c.bps, fixed_fee_cents: c.fixed, ngo_share_cents: c.ngo, vila_share_cents: c.vila,
    };
    expect(db.sql("SELECT * FROM donation_intents WHERE idempotency_key=?", idempotencyKey)).toMatchObject([{ ...snapshot, state: "created" }]);
    expect(db.sql("SELECT * FROM donations WHERE id=?", donation.id)).toMatchObject([{ ...snapshot, status: "pending" }]);

    expect(globalPixCount()).toBe(0);
    const paid = event(`log_${c.kind}`, "transparent.completed", c.charge, "PAID", c.gross);
    for (const expected of [{ ok: true, applied: true }, { ok: true, duplicate: true }]) {
      const delivery = await webhook(paid);
      expect(delivery.status).toBe(200);
      expect(await delivery.json()).toEqual(expected);
      expect(db.sql("SELECT * FROM donations WHERE id=?", donation.id)).toMatchObject([{ ...snapshot, status: "paid" }]);
      await expectTotals(1, 10001, c.totalCount, c.totalCents);
      expect(globalPixCount()).toBe(c.kind === "global" ? 1 : 0);
    }
  }
  expect(count("abacatepay_webhook_events")).toBe(2);
  const refund = await webhook(event("log_global_refunded", "transparent.refunded", "pix_char_2", "REFUNDED", 3333));
  expect(await refund.json()).toEqual({ ok: true, applied: true });
  expect(globalPixCount()).toBe(0);
});

describe("webhook reconciliation", () => {
  let donationId: string;
  let chargeId: string;

  beforeEach(async () => {
    await settings();
    await ngoPayment();
    const { donation } = (await (await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 1000 }, "donor")).json()) as { donation: { id: string } };
    donationId = donation.id;
    chargeId = db.sql("SELECT provider_charge_id FROM donations WHERE id=?", donationId)[0].provider_charge_id as string;
  });

  it("marks the donation paid, credits the Título once and counts it in the public indicators", async () => {
    const first = await webhook(event("log_1", "transparent.completed", chargeId, "PAID"));
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, applied: true });
    expect(db.sql("SELECT status,title_credited,paid_at,platform_fee_cents,receipt_url FROM donations WHERE id=?", donationId)[0]).toMatchObject({
      status: "paid",
      title_credited: 1,
      platform_fee_cents: 80,
      receipt_url: "https://pay.test/receipt",
    });
    const title = await (await call("GET", "/donations/my-title", undefined, "donor")).json();
    expect(title).toMatchObject({ title: { eligibleCents: 1000, confirmedCount: 1, tier: 2 }, donations: [{ id: donationId, titleCredited: true }] });
    const indicators = ((await (await call("GET", "/indicators", undefined, null, null)).json()) as { indicators: Array<{ key: string; value: number | null }> }).indicators;
    expect([indicators.find((i) => i.key === "confirmed_donations")?.value, indicators.find((i) => i.key === "confirmed_amount")?.value]).toEqual([1, 1000]);

    // The same event id is a duplicate; a new id for the same charge changes nothing either.
    expect(await (await webhook(event("log_1", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    expect(await (await webhook(event("log_2", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, applied: false });
    const after = ((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number; confirmedCount: number } }).title;
    expect([after.eligibleCents, after.confirmedCount]).toEqual([1000, 1]);
    expect(db.sql("SELECT COUNT(*) AS n FROM abacatepay_webhook_events")[0].n).toBe(2);
  });

  it("reverses the credit on a refund and hides the amount from the indicators", async () => {
    await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    const refund = await webhook(event("log_refund", "transparent.refunded", chargeId, "REFUNDED"));
    expect(await refund.json()).toEqual({ ok: true, applied: true });
    expect(db.sql("SELECT status,title_credited,refunded_at FROM donations WHERE id=?", donationId)[0]).toMatchObject({ status: "refunded", title_credited: 0 });
    expect(((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number; confirmedCount: number } }).title).toMatchObject({
      eligibleCents: 0,
      confirmedCount: 0,
    });
    const indicators = ((await (await call("GET", "/indicators", undefined, null, null)).json()) as { indicators: Array<{ key: string; value: number | null }> }).indicators;
    expect([indicators.find((i) => i.key === "confirmed_donations")?.value, indicators.find((i) => i.key === "confirmed_amount")?.value]).toEqual([0, 0]);
  });

  it("handles a lost dispute like a refund and restores a won one", async () => {
    await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"));
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "under_dispute", title_credited: 0 });
    await webhook(event("log_won", "transparent.disputed", chargeId, "PAID"));
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "paid", title_credited: 1 });
    await webhook(event("log_lost", "transparent.lost", chargeId, "LOST"));
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "refunded", title_credited: 0 });
  });

  it("ignores a replay of an event already applied, even after a later dispute", async () => {
    await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"));
    const replay = await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "under_dispute", title_credited: 0 });
    const title = ((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number; confirmedCount: number } }).title;
    expect(title).toMatchObject({ eligibleCents: 0, confirmedCount: 0 });
    expect(count("abacatepay_webhook_events")).toBe(2);
  });

  it("ignores a replay processed in the same millisecond as the original delivery", async () => {
    freezeClock();
    expect(await (await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, applied: true });
    expect(await (await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"))).json()).toEqual({ ok: true, applied: true });
    const replay = await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    expect(await replay.json()).toEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "under_dispute", title_credited: 0 });
    expect(count("abacatepay_webhook_events")).toBe(2);
  });

  it("applies different events for one charge in the same millisecond, in the order they arrive", async () => {
    freezeClock();
    for (const [id, name, status, expected] of [
      ["log_paid", "transparent.completed", "PAID", "paid"],
      ["log_dispute", "transparent.disputed", "UNDER_DISPUTE", "under_dispute"],
      ["log_refund", "transparent.refunded", "REFUNDED", "refunded"],
    ]) {
      expect(await (await webhook(event(id, name, chargeId, status))).json()).toEqual({ ok: true, applied: true });
      expect(db.sql("SELECT status FROM donations WHERE id=?", donationId)[0].status).toBe(expected);
    }
    expect(db.sql("SELECT title_credited FROM donations WHERE id=?", donationId)[0].title_credited).toBe(0);
    expect(count("abacatepay_webhook_events")).toBe(3);
  });

  it("applies an event once when the same delivery arrives twice at the same time", async () => {
    freezeClock();
    const twice = (id: string, name: string, status: string) =>
      Promise.all([webhook(event(id, name, chargeId, status)), webhook(event(id, name, chargeId, status))]).then((both) => Promise.all(both.map((r) => r.json())));
    const paid = await twice("log_paid", "transparent.completed", "PAID");
    expect(paid).toHaveLength(2);
    expect(paid).toContainEqual({ ok: true, applied: true });
    expect(paid).toContainEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "paid", title_credited: 1 });
    const title = ((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number; confirmedCount: number } }).title;
    expect(title).toMatchObject({ eligibleCents: 1000, confirmedCount: 1 });
    // After the charge moved on, the same event twice at once is two duplicates.
    await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"));
    expect(await twice("log_paid", "transparent.completed", "PAID")).toEqual([{ ok: true, duplicate: true }, { ok: true, duplicate: true }]);
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "under_dispute", title_credited: 0 });
    expect(count("abacatepay_webhook_events")).toBe(2);
  });

  it("keeps a refund that arrives before the payment confirmation", async () => {
    // The provider retries a failed delivery later: the refund can be the first event the Vila receives.
    expect(await (await webhook(event("log_refund", "transparent.refunded", chargeId, "REFUNDED"))).json()).toEqual({ ok: true, applied: true });
    // The guard refuses the late confirmation: it is kept for an operator, not recorded as processed.
    expect(await (await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, applied: false, refused: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "refunded", title_credited: 0 });
    expect(db.sql("SELECT id FROM abacatepay_webhook_events")).toEqual([{ id: "log_refund" }]);
    expect(db.sql("SELECT id, hold_reason, resolved_at FROM abacatepay_pending_events")).toEqual([{ id: "log_paid", hold_reason: "transition_refused", resolved_at: null }]);
    const indicators = ((await (await call("GET", "/indicators", undefined, null, null)).json()) as { indicators: Array<{ key: string; value: number | null }> }).indicators;
    expect([indicators.find((i) => i.key === "confirmed_donations")?.value, indicators.find((i) => i.key === "confirmed_amount")?.value]).toEqual([0, 0]);
  });

  it("refunds a disputed charge, and nothing that arrives after the refund reopens it", async () => {
    await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"));
    expect(await (await webhook(event("log_refund", "transparent.refunded", chargeId, "REFUNDED"))).json()).toEqual({ ok: true, applied: true });
    for (const [id, name, status] of [
      ["log_dispute_late", "transparent.disputed", "UNDER_DISPUTE"],
      ["log_won_late", "transparent.disputed", "PAID"],
      ["log_paid_again", "transparent.completed", "PAID"],
    ])
      expect(await (await webhook(event(id, name, chargeId, status))).json()).toEqual({ ok: true, applied: false, refused: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "refunded", title_credited: 0 });
    expect(count("abacatepay_webhook_events")).toBe(3);
    expect(db.sql("SELECT id FROM abacatepay_pending_events WHERE hold_reason = 'transition_refused' ORDER BY rowid").map((r) => r.id)).toEqual([
      "log_dispute_late",
      "log_won_late",
      "log_paid_again",
    ]);
  });

  it("ends refunded when a dispute arrives before the payment confirmation and is then lost", async () => {
    expect(await (await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"))).json()).toEqual({ ok: true, applied: false, refused: true });
    await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    // The refused dispute waits for an operator: it is never applied by itself once the payment makes it possible.
    expect(db.sql("SELECT status FROM donations WHERE id=?", donationId)[0].status).toBe("paid");
    expect(await (await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"))).json()).toEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT status FROM donations WHERE id=?", donationId)[0].status).toBe("paid");
    expect(await (await webhook(event("log_lost", "transparent.lost", chargeId, "LOST"))).json()).toEqual({ ok: true, applied: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "refunded", title_credited: 0 });
    expect(db.sql("SELECT id, hold_reason FROM abacatepay_pending_events WHERE resolved_at IS NULL")).toEqual([{ id: "log_dispute", hold_reason: "transition_refused" }]);
  });

  it("refuses a payment confirmation after a dispute, keeps it for an operator, and still accepts the dispute's outcome", async () => {
    await webhook(event("log_paid", "transparent.completed", chargeId, "PAID"));
    await webhook(event("log_dispute", "transparent.disputed", chargeId, "UNDER_DISPUTE"));
    // A late `transparent.completed` neither ends the dispute nor credits the Título again.
    expect(await (await webhook(event("log_paid_late", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, applied: false, refused: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "under_dispute", title_credited: 0 });
    const title = ((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number } }).title;
    expect(title.eligibleCents).toBe(0);
    expect(db.sql("SELECT id FROM abacatepay_webhook_events WHERE id = 'log_paid_late'")).toEqual([]);
    const pending = ((await (await call("GET", "/admin/donations/overview")).json()) as { reconciliation: { unmatchedEvents: unknown[] } }).reconciliation;
    expect(pending.unmatchedEvents).toMatchObject([{ id: "log_paid_late", chargeId, nextStatus: "paid", holdReason: "transition_refused" }]);
    // Redeliveries of the refused event are duplicates: one waiting row, nothing recorded, nothing applied.
    for (let i = 0; i < 2; i++)
      expect(await (await webhook(event("log_paid_late", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    expect([count("abacatepay_pending_events"), count("abacatepay_webhook_events")]).toEqual([1, 2]);
    // The dispute's own outcome still moves it: won → paid and credited again.
    expect(await (await webhook(event("log_won", "transparent.disputed", chargeId, "PAID"))).json()).toEqual({ ok: true, applied: true });
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donationId)[0]).toEqual({ status: "paid", title_credited: 1 });
    // Now that the donation is paid, a redelivery of the refused event is still a duplicate and stays waiting.
    expect(await (await webhook(event("log_paid_late", "transparent.completed", chargeId, "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT resolved_at FROM abacatepay_pending_events WHERE id = 'log_paid_late'")).toEqual([{ resolved_at: null }]);
  });

  it("records a refused event once when the same delivery arrives twice at the same time", async () => {
    freezeClock();
    await webhook(event("log_refund", "transparent.refunded", chargeId, "REFUNDED"));
    const both = await Promise.all([
      webhook(event("log_paid", "transparent.completed", chargeId, "PAID")),
      webhook(event("log_paid", "transparent.completed", chargeId, "PAID")),
    ]).then((responses) => Promise.all(responses.map((r) => r.json())));
    expect(both).toContainEqual({ ok: true, applied: false, refused: true });
    expect(both).toContainEqual({ ok: true, duplicate: true });
    expect([count("abacatepay_pending_events"), count("abacatepay_webhook_events")]).toEqual([1, 1]);
  });

  it("refuses a wrong secret or tampered body and writes no event", async () => {
    const secret = await webhook(event("log_bad", "transparent.completed", chargeId, "PAID"), { secret: "x".repeat(64) });
    expect([secret.status, await secret.json()]).toEqual([401, { error: "invalid_webhook_signature" }]);
    const signature = await webhook(event("log_bad", "transparent.completed", chargeId, "PAID"), { signature: "AAAA" });
    expect(signature.status).toBe(401);
    expect(count("abacatepay_webhook_events")).toBe(0);
    expect(db.sql("SELECT status FROM donations WHERE id=?", donationId)[0].status).toBe("pending");
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("is dark with the flag off, including the webhook", async () => {
    env.DONATIONS_ENABLED = "false";
    expect((await webhook(event("log_off", "transparent.completed", chargeId, "PAID"))).status).toBe(404);
    expect((await call("GET", "/donations/config", undefined, null, null)).status).toBe(404);
    expect((await pix({ targetKind: "global", amountCents: 500 }, "donor")).status).toBe(404);
  });
});

describe("an NGO's own payment link", () => {
  beforeEach(async () => {
    await settings();
  });

  it("is only usable after the admin validates the HTTPS link, and logs the redirect without crediting anything", async () => {
    const invalid = await ngoPayment({ revision: 1, paymentMethod: "external_link", donationUrl: "http://localhost/doar", linkValidated: true });
    expect(invalid.status).toBe(400);
    const unchecked = await ngoPayment({ revision: 1, paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar" });
    expect(unchecked.status).toBe(400);
    const saved = await ngoPayment({ revision: 1, paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar", linkValidated: true });
    expect(saved.status).toBe(200);
    expect(db.sql("SELECT payment_method,donation_url,link_validated,sub_account_id FROM ngo_payment_configs WHERE ngo_id=?", NGO)[0]).toEqual({
      payment_method: "external_link",
      donation_url: "https://ong.org.br/doar",
      link_validated: 1,
      sub_account_id: null,
    });
    // The public info never exposes the URL; only the redirect answer does.
    const info = await (await call("GET", `/ngos/${NGO}/donation-info`, undefined, null, null)).text();
    expect(JSON.parse(info)).toMatchObject({ method: "external_link", enabled: true, confirmedDonations: 0, confirmedAmountCents: 0 });
    expect(info).not.toContain("ong.org.br");
    expect(info).not.toMatch(/subAccountId|donationUrl/);
    const redirect = await call("POST", "/donations/redirect", { ngoId: NGO }, "donor");
    expect(redirect.status).toBe(200);
    expect(await redirect.json()).toEqual({ url: "https://ong.org.br/doar", tracked: true, titleCredit: "none" });
    expect(db.sql("SELECT ngo_id,user_id,target_url FROM donation_redirects")[0]).toEqual({ ngo_id: NGO, user_id: "donor", target_url: "https://ong.org.br/doar" });
    expect(count("donations")).toBe(0);
    // A Pix charge for this NGO is refused: it has no sub-account to receive it.
    expect((await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 500 }, "donor")).status).toBe(409);
  });

  it("compares guest and account-only external links in a local rehearsal without creating a payment", async () => {
    await ngoPayment({ revision: 1, paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar", linkValidated: true });
    const redirect = (user: string | null, accountId?: string) => call("POST", "/donations/redirect", { ngoId: NGO, accountId }, user);
    env.LOCAL_ACCOUNT_ACTIONS = "true";
    expect((await redirect(null)).status).toBe(401);
    expect((await redirect("donor", "other")).status).toBe(409);
    expect(count("donation_redirects")).toBe(0);
    const allowed = await redirect("donor", "donor");
    expect(allowed.status).toBe(200);
    expect(await allowed.json()).toMatchObject({ tracked: true, titleCredit: "none", url: "https://ong.org.br/doar" });
    env.ACCOUNTS_ENABLED = "false";
    expect((await redirect(null)).status).toBe(404);
    env.ENVIRONMENT = "production";
    expect((await redirect(null)).status).toBe(200);
    expect(count("donation_redirects")).toBe(2);
    expect(count("donations")).toBe(0);
  });

  it("records an admin-verified proof in the indicators without crediting a Título", async () => {
    const proof = await call("POST", "/admin/donations/external-proof", {
      accountId: "admin",
      ngoId: NGO,
      amountCents: 500,
      proofReference: "Comprovante 2026-01",
      note: "Conferido no extrato da organização.",
    });
    expect(proof.status).toBe(201);
    expect(await proof.json()).toMatchObject({ donation: { targetKind: "ngo", amountCents: 500, status: "paid", titleCredited: false } });
    const row = db.sql("SELECT provider,status,title_credited,ngo_share_cents,vila_share_cents,proof_note FROM donations")[0];
    expect(row).toMatchObject({ provider: "external_proof", status: "paid", title_credited: 0, ngo_share_cents: 500, vila_share_cents: 0 });
    expect(row.proof_note).toContain("Comprovante 2026-01");
    const indicators = ((await (await call("GET", "/indicators", undefined, null, null)).json()) as { indicators: Array<{ key: string; value: number | null }> }).indicators;
    expect([indicators.find((i) => i.key === "confirmed_donations")?.value, indicators.find((i) => i.key === "confirmed_amount")?.value]).toEqual([1, 500]);
    const title = ((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number; confirmedCount: number } }).title;
    expect(title).toMatchObject({ eligibleCents: 0, confirmedCount: 0 });
    const audit = db.sql("SELECT action,detail FROM audit_events WHERE action='donation.external_proof'")[0];
    expect(audit.detail).not.toContain("Comprovante 2026-01");
  });

  it("requires a published NGO and the admin account for a proof", async () => {
    await db.prepare("UPDATE lots SET state='available',ngo_id=NULL WHERE id='plaza-01'").run();
    const response = await call("POST", "/admin/donations/external-proof", { accountId: "admin", ngoId: NGO, amountCents: 500, proofReference: "Comprovante 1" });
    expect(response.status).toBe(404);
    await db.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
    for (const model of [
      { accountId: "donor", ngoId: NGO, amountCents: 500, proofReference: "Comprovante 1" },
      { accountId: "admin", ngoId: NGO, amountCents: 100, proofReference: "Comprovante 1" },
      { accountId: "admin", ngoId: NGO, amountCents: 500, proofReference: "" },
    ])
      expect((await call("POST", "/admin/donations/external-proof", model, model.accountId)).status).toBe(model.accountId === "admin" ? 400 : 403);
    expect(count("donations")).toBe(0);
  });
});

describe("NGO applications and donation destinations", () => {
  const APPLICATION = {
    name: "Associação Exemplo",
    cnpj: "22345678000149",
    openedOn: "2020-01-01",
    city: "Recife",
    declarations: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
    fundsConfirmation: "Extratos e relatórios conciliáveis da organização.",
    summary: "Apoio escolar às crianças da comunidade.",
    description: "Atendemos crianças com atividades educativas e culturais na comunidade.",
    tags: ["education"],
    projects: [],
    lotId: "plaza-02",
    paymentMethod: "external_link",
    donationUrl: "https://ong.org.br/doar",
  };

  it("keeps a late Pix confirmation with the withdrawn NGO after its lot is reassigned", async () => {
    env.NGO_WITHDRAWAL_ENABLED = "true";
    const lotId = "ring2-01";
    async function publishNgo(accountId: string, name: string, cnpj: string) {
      const submitted = await call("POST", "/ngo/application", {
        ...APPLICATION, accountId, name, cnpj, lotId, paymentMethod: "abacatepay", donationUrl: "",
      }, accountId);
      expect(submitted.status).toBe(201);
      const { application } = await submitted.json() as { application: { id: string; revision: number } };
      const approved = await call("POST", `/admin/applications/${application.id}/decision`, {
        accountId: "admin", revision: application.revision, action: "approve", checks: APPLICATION.declarations,
      });
      expect(approved.status).toBe(200);
      const { application: published } = await approved.json() as { application: { id: string; revision: number; status: string } };
      expect(published.status).toBe("published");
      expect((await ngoPayment({ revision: published.revision }, published.id)).status).toBe(200);
      return published;
    }
    const original = await publishNgo("applicant", "ONG Primeira", APPLICATION.cnpj);
    const issued = await pix({ targetKind: "ngo", ngoId: original.id, amountCents: 1000 }, "donor");
    expect(issued.status).toBe(201);
    const { donation } = await issued.json() as { donation: { id: string } };
    const readDonation = () => db.sql(
      "SELECT provider_charge_id, target_kind, ngo_id, sub_account_id, amount_cents, status FROM donations WHERE id=?", donation.id
    )[0];
    const pending = readDonation();
    expect(pending).toMatchObject({
      provider_charge_id: expect.any(String), status: "pending", target_kind: "ngo",
      ngo_id: original.id, sub_account_id: `sacc_${APPLICATION.cnpj}`, amount_cents: 1000,
    });

    const withdrawn = await call("POST", `/admin/ngos/${original.id}/withdraw`, {
      accountId: "admin", revision: original.revision, reason: "Encerramento da participação da primeira organização.",
    });
    expect(withdrawn.status).toBe(200);
    const next = await publishNgo("donor", "ONG Seguinte", PRIMARY_CNPJ);
    async function expectNewOccupant() {
      const lots = await call("GET", "/lots", undefined, null, null);
      expect(await lots.json()).toMatchObject({
        lots: expect.arrayContaining([expect.objectContaining({ id: lotId, state: "published", ngo_id: next.id })]),
      });
      const info = await call("GET", `/ngos/${next.id}/donation-info`, undefined, null, null);
      expect(await info.json()).toMatchObject({ ngoId: next.id, enabled: true, confirmedDonations: 0, confirmedAmountCents: 0 });
    }
    await expectNewOccupant();
    const confirmation = await webhook(event("log_late_ngo", "transparent.completed", pending.provider_charge_id as string, "PAID"));
    expect(confirmation.status).toBe(200);
    expect(await confirmation.json()).toEqual({ ok: true, applied: true });
    expect(readDonation()).toEqual({ ...pending, status: "paid" });
    await expectNewOccupant();
    const totals = await call("GET", "/indicators", undefined, null, null);
    expect(await totals.json()).toMatchObject({ indicators: expect.arrayContaining([
      expect.objectContaining({ key: "confirmed_donations", value: 1 }),
      expect.objectContaining({ key: "confirmed_amount", value: 1000 }),
    ]) });
    expect(db.sql(countPaidGlobalPix)[0].paid_global_pix).toBe(0);
  });

  it("stores the mode and the link for the admin review, clearing the link for the sub-account mode", async () => {
    await db.prepare("UPDATE lots SET state='available' WHERE id='plaza-02'").run();
    const response = await call("POST", "/ngo/application", { ...APPLICATION, accountId: "applicant" }, "applicant");
    expect(response.status).toBe(201);
    const ngoId = db.sql("SELECT id FROM ngos WHERE applicant_id='applicant'")[0].id as string;
    expect(db.sql("SELECT payment_method,donation_url,link_validated FROM ngo_payment_configs WHERE ngo_id=?", ngoId)[0]).toEqual({
      payment_method: "external_link",
      donation_url: "https://ong.org.br/doar",
      link_validated: 0,
    });
    const own = ((await (await call("GET", "/ngo/application", undefined, "applicant")).json()) as { application: { ngoPayment: Record<string, unknown> } }).application;
    expect(own.ngoPayment).toMatchObject({ method: "external_link", donationUrl: "https://ong.org.br/doar", linkValidated: false });
    const review = ((await (await call("GET", `/admin/applications/${ngoId}`)).json()) as { application: { ngoPayment: Record<string, unknown> } }).application;
    expect(review.ngoPayment).toMatchObject({ method: "external_link", donationUrl: "https://ong.org.br/doar" });
    // After a request for changes the applicant switches to the sub-account: the stored link is cleared.
    await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(ngoId).run();
    const resubmit = await call("POST", "/ngo/application", { ...APPLICATION, accountId: "applicant", paymentMethod: "abacatepay" }, "applicant");
    expect(resubmit.status).toBe(200);
    expect(db.sql("SELECT payment_method,donation_url,link_validated FROM ngo_payment_configs WHERE ngo_id=?", ngoId)[0]).toEqual({
      payment_method: "abacatepay",
      donation_url: "",
      link_validated: 0,
    });
  });

  it("accepts an application without the new fields, defaulting to AbacatePay", async () => {
    await db.prepare("UPDATE lots SET state='available' WHERE id='plaza-02'").run();
    const { paymentMethod: _method, donationUrl: _url, ...legacy } = APPLICATION;
    const response = await call("POST", "/ngo/application", { ...legacy, accountId: "applicant", cnpj: "22345678000149" }, "applicant");
    expect(response.status).toBe(201);
    expect(db.sql("SELECT payment_method,donation_url FROM ngo_payment_configs")[0]).toEqual({ payment_method: "abacatepay", donation_url: "" });
  });

  it("accepts a stale payment field while donations are off and keeps the saved choice on a later resubmission", async () => {
    const body = { ...APPLICATION, accountId: "applicant" };
    expect((await call("POST", "/ngo/application", body, "applicant")).status).toBe(201);
    const id = db.sql("SELECT id FROM ngos WHERE applicant_id='applicant'")[0].id;
    const requestChanges = () => db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(id).run();
    const stored = () => db.sql("SELECT payment_method,donation_url FROM ngo_payment_configs WHERE ngo_id=?", id)[0];
    const original = { payment_method: "external_link", donation_url: APPLICATION.donationUrl };
    await requestChanges();
    env.DONATIONS_ENABLED = "false";
    expect((await call("POST", "/ngo/application", { ...body, donationUrl: "" }, "applicant")).status).toBe(200);
    expect(stored()).toEqual(original);

    await requestChanges();
    env.DONATIONS_ENABLED = "true";
    const { paymentMethod, donationUrl, ...withoutPreference } = body;
    expect((await call("POST", "/ngo/application", withoutPreference, "applicant")).status).toBe(200);
    expect(stored()).toEqual(original);
  });

  const resubmit = (cnpj: string) => {
    const { paymentMethod, donationUrl, ...fields } = APPLICATION;
    return call("POST", "/ngo/application", { ...fields, cnpj, accountId: "owner", lotId: "plaza-01" }, "owner");
  };
  const approve = () => call("POST", `/admin/applications/${NGO}/decision`, {
    action: "approve", revision: 2, checks: { activeCnpj: true, oneYear: true, fundsConfirmable: true },
  });

  it.each(["true", "false"])("requires a new beneficiary after a CNPJ change with donations %s", async (flag) => {
    const target = { targetKind: "ngo", ngoId: NGO, amountCents: 1000 };
    expect((await ngoPayment()).status).toBe(200);
    expect((await pix(target, "donor")).status).toBe(201);
    await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    env.DONATIONS_ENABLED = flag;
    expect((await resubmit(PRIMARY_CNPJ)).status).toBe(200);
    expect((await approve()).status).toBe(200);
    env.DONATIONS_ENABLED = "true";
    calls = [];
    const refused = await pix(target, "donor");
    expect(refused.status).toBe(409);
    expect(await refused.json()).toMatchObject({ error: "ngo_payment_not_configured" });
    expect(calls).toEqual([]);

    const oldForm = await ngoPayment({ revision: 1, subAccountId: `sacc_${NGO_CNPJ}` });
    expect(oldForm.status).toBe(409);
    expect((await ngoPayment({ subAccountId: `sacc_${NGO_CNPJ}` })).status).toBe(400);
    expect((await ngoPayment({ revision: 2 })).status).toBe(200);
    expect((await pix(target, "donor")).status).toBe(201);
    expect(calls.find((c) => c.path.endsWith("/transparents/create"))?.body?.data).toMatchObject({
      splits: [{ subAccountId: `sacc_${PRIMARY_CNPJ}`, amount: 870 }],
    });
    expect(db.sql("SELECT sub_account_id FROM donations ORDER BY provider_charge_id").map((r) => r.sub_account_id))
      .toEqual([`sacc_${NGO_CNPJ}`, `sacc_${PRIMARY_CNPJ}`]);
  });

  it("requires fresh review of a previously validated external link after the holder changes", async () => {
    const link = { paymentMethod: "external_link", donationUrl: APPLICATION.donationUrl, linkValidated: true };
    expect((await ngoPayment({ ...link, revision: 1 })).status).toBe(200);
    await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    expect((await resubmit(PRIMARY_CNPJ)).status).toBe(200);
    expect((await ngoPayment({ ...link, revision: 1 })).status).toBe(409);
    expect((await ngoPayment(link)).status).toBe(400);
    expect(db.sql("SELECT link_validated FROM ngo_payment_configs WHERE ngo_id=?", NGO)[0].link_validated).toBe(0);
    expect((await ngoPayment({ ...link, revision: 2 })).status).toBe(200);
  });

  it("retains the verified beneficiary on a same-holder resubmission", async () => {
    expect((await ngoPayment()).status).toBe(200);
    await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    expect((await resubmit(NGO_CNPJ)).status).toBe(200);
    expect((await approve()).status).toBe(200);
    expect((await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 1000 }, "donor")).status).toBe(201);
    expect(db.sql("SELECT sub_account_id FROM donations")[0].sub_account_id).toBe(`sacc_${NGO_CNPJ}`);
  });

  it("discards an in-flight beneficiary save if the application changes before the provider returns", async () => {
    await db.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    const provider = globalThis.fetch;
    vi.stubGlobal("fetch", async (...args: Parameters<typeof fetch>) => {
      expect((await resubmit(PRIMARY_CNPJ)).status).toBe(200);
      return provider(...args);
    });
    const response = await ngoPayment({ revision: 1 });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: "stale_revision" });
    expect(db.sql("SELECT sub_account_id FROM ngo_payment_configs WHERE ngo_id=?", NGO)[0].sub_account_id).toBeNull();
    expect(db.sql("SELECT id FROM audit_events WHERE action = 'ngo.payment_config'")).toEqual([]);
  });

  it("touches no donation table while the flag is off", async () => {
    env.DONATIONS_ENABLED = "false";
    await db.prepare("UPDATE lots SET state='available' WHERE id='plaza-02'").run();
    const legacy = createD1({ upTo: 10 });
    env.DB = legacy;
    for (const statement of [
      "INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES('owner','owner','owner','owner','Recife','owner@example.test','player','2026-01-01')",
      `INSERT INTO sessions(token_hash,user_id,expires_at) VALUES('${await sha256Hex("owner")}','owner','2099-01-01')`,
      `INSERT INTO ngos(id,name,cnpj,status,applicant_id,requested_lot_id) VALUES('${NGO}', 'Example', '${NGO_CNPJ}', 'published', 'owner', 'plaza-01')`,
    ])
      await legacy.exec(statement);
    await legacy.prepare("UPDATE lots SET state='published',ngo_id=? WHERE id='plaza-01'").bind(NGO).run();
    expect((await call("GET", "/ngo/application", undefined, "owner")).status).toBe(200);
    await legacy.prepare("UPDATE ngos SET status='changes_requested' WHERE id=?").bind(NGO).run();
    expect((await resubmit(PRIMARY_CNPJ)).status).toBe(200);
    expect(legacy.sql("SELECT cnpj FROM ngos WHERE id=?", NGO)[0].cnpj).toBe(PRIMARY_CNPJ);
  });
});

describe("durable creation intent (IMPL-0028)", () => {
  type Intent = Record<string, unknown>;
  const intents = () => db.sql("SELECT * FROM donation_intents") as Intent[];
  const creates = () => calls.filter((c) => c.path.endsWith("/transparents/create"));
  const errorOf = async (response: Response) => [response.status, ((await response.json()) as { error: string }).error];
  /** Wraps the provider stub: `create` answers `/transparents/create`, everything else goes to the normal stub. */
  function onCreate(create: (forward: () => Promise<Response>) => Promise<Response>): void {
    const normal = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/transparents/create") ? create(() => normal(input, init)) : normal(input, init)
    );
  }
  /** Fails D1 for the donation insert (and, when `everything`, for the fallback write of the intent too). */
  function failStore(options: { times: number; everything?: boolean }): void {
    const real = db;
    let left = options.times;
    env.DB = {
      ...real,
      batch: async (list: Array<{ sql?: string }>) => {
        if (left > 0 && list.some((s) => s.sql?.includes("INSERT INTO donations"))) {
          left--;
          throw new Error("D1_ERROR: network connection lost");
        }
        return real.batch(list as never);
      },
      prepare: (sql: string) => {
        if (options.everything && left >= 0 && sql.includes("last_error = 'store_failed'"))
          return { bind: () => ({ run: async () => { throw new Error("D1_ERROR: network connection lost"); } }) } as never;
        return real.prepare(sql);
      },
    } as unknown as D1Database;
  }
  const overview = async () =>
    ((await (await call("GET", "/admin/donations/overview")).json()) as { reconciliation: { intents: Intent[]; unmatchedEvents: Intent[] } }).reconciliation;

  beforeEach(async () => {
    await settings();
    await ngoPayment();
  });

  it("refuses a request without a valid idempotency key before writing or calling anything", async () => {
    for (const idempotencyKey of [undefined, "", "abc", 42, "a0000000-0000-4000-8000-00000000000"]) {
      const response = await call("POST", "/donations/pix", { idempotencyKey, targetKind: "global", amountCents: 500 }, null);
      expect(await errorOf(response)).toEqual([400, "invalid_idempotency_key"]);
    }
    expect([count("donation_intents"), creates().length]).toEqual([0, 0]);
  });

  it("answers a retry with the same key with the same donation and never calls the provider again", async () => {
    const key = crypto.randomUUID();
    const first = await pix({ idempotencyKey: key, targetKind: "global", amountCents: 500 }, "donor");
    expect(first.status).toBe(201);
    const { donation } = (await first.json()) as { donation: { id: string; brCode: string } };
    const again = await pix({ idempotencyKey: key.toUpperCase(), targetKind: "global", amountCents: 500 }, "donor");
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ donation: { id: donation.id, brCode: donation.brCode } });
    expect([creates().length, count("donations")]).toEqual([1, 1]);
    // The intent id is the donation id and the provider's externalId; the payment code lives only in `donations`.
    expect(intents()).toMatchObject([{ id: donation.id, state: "created", provider_charge_id: "pix_char_1", br_code: null, br_code_base64: null }]);
    expect(creates()[0].body).toMatchObject({ data: { externalId: donation.id } });
  });

  it("answers 409 when a key is reused with another amount, target or donor, and calls nothing", async () => {
    const key = crypto.randomUUID();
    expect((await pix({ idempotencyKey: key, targetKind: "global", amountCents: 500 }, "donor")).status).toBe(201);
    for (const [body, user] of [
      [{ targetKind: "global", amountCents: 600 }, "donor"],
      [{ targetKind: "ngo", ngoId: NGO, amountCents: 500 }, "donor"],
      [{ targetKind: "global", amountCents: 500 }, "owner"],
    ] as const)
      expect(await errorOf(await pix({ idempotencyKey: key, ...body }, user))).toEqual([409, "idempotency_key_reused"]);
    expect([creates().length, count("donations"), count("donation_intents")]).toEqual([1, 1, 1]);
  });

  it("calls the provider once when retries with the same key arrive at the same time", async () => {
    let entered!: () => void;
    let release!: () => void;
    const providerEntered = new Promise<void>((resolve) => (entered = resolve));
    const gate = new Promise<void>((resolve) => (release = resolve));
    let providerCalls = 0;
    onCreate(async (forward) => {
      if (++providerCalls === 1) {
        entered();
        await gate;
      }
      return forward();
    });
    const body = { idempotencyKey: crypto.randomUUID(), targetKind: "ngo", ngoId: NGO, amountCents: 1000 };
    const first = pix(body, "donor");
    let created: Response;
    try {
      await providerEntered;
      const retries = await Promise.all([pix(body, "donor"), pix(body, "donor")]);
      expect(await Promise.all(retries.map(errorOf))).toEqual([[409, "donation_in_progress"], [409, "donation_in_progress"]]);
    } finally {
      release();
      created = await first;
    }
    expect(created.status).toBe(201);
    const replay = await pix(body, "donor");
    expect(replay.status).toBe(200);
    const saved = { donation: { id: intents()[0].id } };
    expect(await created.json()).toMatchObject(saved);
    expect(await replay.json()).toMatchObject(saved);
    expect([providerCalls, creates().length, count("donations"), count("donation_intents")]).toEqual([1, 1, 1, 1]);
  });

  it("keeps the provider's answer when D1 fails after it, and finishes the same donation on retry without a second charge", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failStore({ times: 1 });
    const key = crypto.randomUUID();
    const body = { idempotencyKey: key, targetKind: "ngo", ngoId: NGO, amountCents: 1000 };
    expect(await errorOf(await pix(body, "donor"))).toEqual([503, "donation_not_confirmed"]);
    expect(count("donations")).toBe(0);
    expect(intents()).toMatchObject([
      { state: "unknown", last_error: "store_failed", provider_charge_id: "pix_char_1", br_code: "000201-charge-1", provider_status: "PENDING" },
    ]);
    // The operator sees it, with its age, and no donor, e-mail or payment code.
    const seen = await overview();
    expect(seen.intents).toMatchObject([{ state: "unknown", lastError: "store_failed", providerChargeId: "pix_char_1", amountCents: 1000 }]);
    expect(typeof seen.intents[0].ageSeconds).toBe("number");
    expect(JSON.stringify(seen)).not.toMatch(/donor|example\.test|000201|user/);
    // The payment is confirmed while the donation row is missing: the event waits, it is not "processed".
    expect(await (await webhook(event("log_early", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, applied: false, unmatched: true });
    expect(count("abacatepay_webhook_events")).toBe(0);
    const retry = await pix(body, "donor");
    expect(retry.status).toBe(201);
    expect(await retry.json()).toMatchObject({ donation: { id: intents()[0].id, brCode: "000201-charge-1", status: "paid", titleCredited: true } });
    expect(creates()).toHaveLength(1);
    expect(intents()).toMatchObject([{ state: "created", provider_charge_id: "pix_char_1", br_code: null, last_error: null }]);
    expect(db.sql("SELECT id FROM abacatepay_webhook_events")).toEqual([{ id: "log_early" }]);
    expect(await overview()).toMatchObject({ intents: [], unmatchedEvents: [] });
  });

  it("turns a stale in-flight intent 'unknown' when D1 failed completely, and never calls the provider again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failStore({ times: 1, everything: true });
    const body = { idempotencyKey: crypto.randomUUID(), targetKind: "global", amountCents: 500 };
    expect(await errorOf(await pix(body, "donor"))).toEqual([503, "donation_not_confirmed"]);
    expect(intents()).toMatchObject([{ state: "pending_provider", provider_charge_id: null }]);
    env.DB = db;
    // Still inside the window of a live provider call.
    expect(await errorOf(await pix(body, "donor"))).toEqual([409, "donation_in_progress"]);
    expect(await overview()).toMatchObject({ intents: [] });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect((await overview()).intents).toMatchObject([{ state: "pending_provider" }]);
    // Stale: it becomes 'unknown' for an operator; nobody takes it over and calls the provider.
    expect(await errorOf(await pix(body, "donor"))).toEqual([409, "donation_intent_unknown"]);
    expect(await errorOf(await pix(body, "donor"))).toEqual([409, "donation_intent_unknown"]);
    expect(intents()).toMatchObject([{ state: "unknown", last_error: "stale_in_flight", provider_charge_id: null }]);
    expect([creates().length, count("donations")]).toEqual([1, 0]);
    expect((await overview()).intents).toMatchObject([{ state: "unknown", lastError: "stale_in_flight" }]);
  });

  it("fences a late writer out of a stale intent, keeps its answer, and lets the same key finish from it", async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    onCreate(async (forward) => {
      await gate;
      return forward();
    });
    const body = { idempotencyKey: crypto.randomUUID(), targetKind: "global", amountCents: 500 };
    const late = pix(body, "donor");
    await new Promise((resolve) => setTimeout(resolve, 20));
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 61_000);
    expect(await errorOf(await pix(body, "donor"))).toEqual([409, "donation_intent_unknown"]);
    release();
    // The provider answered after the intent went stale: no donation is written over the 'unknown' mark.
    expect(await errorOf(await late)).toEqual([503, "donation_not_confirmed"]);
    expect(count("donations")).toBe(0);
    expect(intents()).toMatchObject([{ state: "unknown", last_error: "store_failed", provider_charge_id: "pix_char_1", br_code: "000201-charge-1" }]);
    const finish = await pix(body, "donor");
    expect(finish.status).toBe(201);
    expect(await finish.json()).toMatchObject({ donation: { brCode: "000201-charge-1", status: "pending" } });
    expect(creates()).toHaveLength(1);
  });

  it("finishes from the stored copy once, even when two retries race for it", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    failStore({ times: 1 });
    const body = { idempotencyKey: crypto.randomUUID(), targetKind: "global", amountCents: 500 };
    expect((await pix(body, "donor")).status).toBe(503);
    env.DB = db;
    const statuses = (await Promise.all([pix(body, "donor"), pix(body, "donor")])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 201]);
    expect([creates().length, count("donations")]).toEqual([1, 1]);
  });

  it.each([
    ["a timeout", async () => { throw new DOMException("The operation timed out.", "TimeoutError"); }, "unknown", "donation_intent_unknown"],
    ["a network error", async () => { throw new TypeError("fetch failed"); }, "unknown", "donation_intent_unknown"],
    ["a 5xx", async () => reply(502, { data: null, error: "bad gateway" }), "unknown", "donation_intent_unknown"],
    ["a 4xx refusal", async () => reply(400, { data: null, error: "Invalid split" }), "failed", "donation_intent_failed"],
  ] as const)("makes one provider call per key after %s, and answers every retry without calling it", async (_name, answer, state, code) => {
    let provider = 0;
    onCreate(async () => {
      provider++;
      return answer();
    });
    const body = { idempotencyKey: crypto.randomUUID(), targetKind: "global", amountCents: 500 };
    expect(await errorOf(await pix(body, "donor"))).toEqual([503, "payment_provider_unavailable"]);
    expect(intents()).toMatchObject([{ state, provider_charge_id: null, last_error: "payment_provider_unavailable" }]);
    for (let retry = 0; retry < 3; retry++) expect(await errorOf(await pix(body, "donor"))).toEqual([409, code]);
    expect([provider, count("donations")]).toEqual([1, 0]);
    // Only the outcome nobody knows needs an operator; a refusal created nothing.
    expect((await overview()).intents).toHaveLength(state === "unknown" ? 1 : 0);
    // A new key is a new request.
    stubProvider();
    expect((await pix({ ...body, idempotencyKey: crypto.randomUUID() }, "donor")).status).toBe(201);
  });

  it("checks the provider configuration before writing an intent, so a configuration error leaves nothing", async () => {
    env.ABACATEPAY_API_KEY = undefined;
    expect(await errorOf(await pix({ targetKind: "global", amountCents: 500 }, "donor"))).toEqual([503, "payment_provider_unavailable"]);
    env.ABACATEPAY_API_KEY = API_KEY;
    // A sandbox marker in production must never route money.
    await db.prepare("UPDATE donation_settings SET primary_sub_account_id = 'dev_sacc_x'").run();
    env.ENVIRONMENT = "production";
    expect(await errorOf(await pix({ targetKind: "global", amountCents: 500 }, "donor"))).toEqual([409, "subaccounts_unavailable"]);
    expect([count("donation_intents"), creates().length]).toEqual([0, 0]);
  });

  it("stores an early webhook as unmatched, ignores its redelivery, and applies it when the donation appears", async () => {
    // The provider's charge ids are sequential in the stub: the next donation will be pix_char_1.
    expect(await (await webhook(event("log_early", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, applied: false, unmatched: true });
    expect(await (await webhook(event("log_early", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    expect([count("abacatepay_webhook_events"), count("abacatepay_pending_events")]).toEqual([0, 1]);
    expect((await overview()).unmatchedEvents).toMatchObject([{ id: "log_early", chargeId: "pix_char_1", nextStatus: "paid" }]);
    const response = await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 1000 }, "donor");
    expect(await response.json()).toMatchObject({ donation: { status: "paid", titleCredited: true } });
    expect(db.sql("SELECT resolved_at IS NOT NULL AS resolved FROM abacatepay_pending_events")).toEqual([{ resolved: 1 }]);
    expect(await (await webhook(event("log_early", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    const title = ((await (await call("GET", "/donations/my-title", undefined, "donor")).json()) as { title: { eligibleCents: number; confirmedCount: number } }).title;
    expect(title).toMatchObject({ eligibleCents: 1000, confirmedCount: 1 });
    expect(await overview()).toMatchObject({ unmatchedEvents: [] });
  });

  it("applies waiting events in arrival order, so an early refund is not undone by an early payment", async () => {
    await webhook(event("log_paid", "transparent.completed", "pix_char_1", "PAID"));
    await webhook(event("log_refund", "transparent.refunded", "pix_char_1", "REFUNDED"));
    const response = await pix({ targetKind: "global", amountCents: 500 }, "donor");
    expect(await response.json()).toMatchObject({ donation: { status: "refunded", titleCredited: false } });
    expect(count("abacatepay_webhook_events")).toBe(2);
  });

  it("drains waiting events on a status read when an earlier drain did not run", async () => {
    const { donation } = (await (await pix({ targetKind: "global", amountCents: 500 }, "donor")).json()) as { donation: { id: string } };
    db.sql("INSERT INTO abacatepay_pending_events (id, event, charge_id, next_status, provider_status) VALUES ('log_left', 'transparent.completed', 'pix_char_1', 'paid', 'PAID')");
    const read = await call("GET", `/donations/${donation.id}`, undefined, null, null);
    expect(await read.json()).toMatchObject({ donation: { status: "paid" } });
    expect(db.sql("SELECT id FROM abacatepay_webhook_events")).toEqual([{ id: "log_left" }]);
  });

  it("keeps an early event the guard refuses when it is finally applied for an operator, and never retries it", async () => {
    await webhook(event("log_refund", "transparent.refunded", "pix_char_1", "REFUNDED"));
    await webhook(event("log_paid", "transparent.completed", "pix_char_1", "PAID"));
    const response = await pix({ targetKind: "global", amountCents: 500 }, "donor");
    expect(await response.json()).toMatchObject({ donation: { status: "refunded", titleCredited: false } });
    expect(db.sql("SELECT id FROM abacatepay_webhook_events")).toEqual([{ id: "log_refund" }]);
    expect(db.sql("SELECT id, hold_reason, resolved_at IS NULL AS open FROM abacatepay_pending_events ORDER BY rowid")).toEqual([
      { id: "log_refund", hold_reason: "no_donation", open: 0 },
      { id: "log_paid", hold_reason: "transition_refused", open: 1 },
    ]);
    // A later event or a status read does not try it again.
    expect(await (await webhook(event("log_paid", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    expect((await overview()).unmatchedEvents).toMatchObject([{ id: "log_paid", holdReason: "transition_refused" }]);
  });

  it("answers a retry of a known key without spending the abuse budget; a new key still hits the limiter first", async () => {
    const keys: string[] = [];
    let allow = true;
    env.DONATION_LIMITER = { limit: async ({ key }) => (keys.push(key), { success: allow }) };
    const body = { idempotencyKey: crypto.randomUUID(), targetKind: "global", amountCents: 500 };
    expect((await pix(body, "donor")).status).toBe(201);
    expect(keys).toEqual(["account:donor"]);
    allow = false;
    for (let i = 0; i < 3; i++) expect((await pix(body, "donor")).status).toBe(200);
    // The same key with other data is refused as reuse, also without touching the limiter.
    expect(await errorOf(await pix({ ...body, amountCents: 600 }, "donor"))).toEqual([409, "idempotency_key_reused"]);
    expect(keys).toHaveLength(1);
    expect(await errorOf(await pix({ targetKind: "global", amountCents: 500 }, "donor"))).toEqual([429, "too_many_requests"]);
    expect(keys).toHaveLength(2);
    expect([count("donation_intents"), creates().length]).toEqual([1, 1]);
  });

  it("limits new charges per account and rejects visitors before spending quota", async () => {
    const keys: string[] = [];
    env.DONATION_LIMITER = { limit: async ({ key }) => (keys.push(key), { success: false }) };
    const visitor = await request("POST", "/donations/pix", null, ORIGIN, { "Content-Type": "application/json", "CF-Connecting-IP": "203.0.113.7" },
      JSON.stringify({ idempotencyKey: crypto.randomUUID(), targetKind: "global", amountCents: 500 }));
    expect(await errorOf(visitor)).toEqual([401, "not_signed_in"]);
    expect(await errorOf(await pix({ targetKind: "global", amountCents: 500 }, "donor"))).toEqual([429, "too_many_requests"]);
    expect(keys).toEqual(["account:donor"]);
    expect([count("donation_intents"), creates().length]).toEqual([0, 0]);
    env.DONATION_LIMITER = { limit: async () => ({ success: true }) };
    expect((await pix({ targetKind: "global", amountCents: 500 }, "donor")).status).toBe(201);
  });
});

describe("operator reconciliation (IMPL-0028)", () => {
  const errorOf = async (response: Response) => [response.status, ((await response.json()) as { error: string }).error];
  const INTENT = "b0000000-0000-4000-8000-000000000001";
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  function intent(state: string, updatedAt = ago(1_000), extra: Record<string, unknown> = {}) {
    const row = { id: INTENT, idempotency_key: crypto.randomUUID(), request_hash: "h", target_kind: "global", recipient_name: "Instituto Parceiro",
      sub_account_id: "sacc_x", amount_cents: 500, ngo_share_cents: 395, vila_share_cents: 105, ngo_percent_bps: 9500, fixed_fee_cents: 80,
      state, updated_at: updatedAt, ...extra };
    const cols = Object.keys(row);
    db.sql(`INSERT INTO donation_intents (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`, ...(Object.values(row) as never[]));
    return row;
  }
  const resolve = (body: Record<string, unknown>, user = "admin", id = INTENT) =>
    call("POST", `/admin/donations/intents/${id}/resolve`, { accountId: user, resolution: "failed", ...body }, user);
  const dismiss = (id: string, user = "admin", body: Record<string, unknown> = {}) =>
    call("POST", `/admin/donations/events/${id}/dismiss`, { accountId: user, ...body }, user);
  const audits = (action: string) => db.sql("SELECT actor, subject, detail FROM audit_events WHERE action = ?", action);

  it("never closes an intent that holds the provider's charge: the donor may have paid it, and a retry finishes it", async () => {
    intent("unknown", ago(1_000), { last_error: "store_failed", provider_charge_id: "pix_char_9", provider_status: "PENDING", br_code: "000201-x" });
    expect(await errorOf(await resolve({ resolution: "abandoned" }))).toEqual([409, "intent_has_charge"]);
    expect(db.sql("SELECT state, last_error, provider_charge_id, br_code FROM donation_intents")).toEqual([
      { state: "unknown", last_error: "store_failed", provider_charge_id: "pix_char_9", br_code: "000201-x" },
    ]);
    expect(audits("donation.intent_resolve")).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });

  it("closes an 'unknown' intent as failed, never calls the provider, audits it, and a same-key retry stays closed", async () => {
    const row = intent("unknown", ago(1_000), { last_error: "provider_timeout" });
    const response = await resolve({ resolution: "abandoned" });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ intent: { id: INTENT, state: "failed", lastError: "resolved_by_admin", resolution: "abandoned" } });
    expect(db.sql("SELECT state, last_error, provider_charge_id, br_code, provider_status FROM donation_intents")).toEqual([
      { state: "failed", last_error: "resolved_by_admin", provider_charge_id: null, br_code: null, provider_status: null },
    ]);
    expect(audits("donation.intent_resolve")).toEqual([
      { actor: "admin", subject: `donation_intent:${INTENT}`, detail: JSON.stringify({ intentId: INTENT, resolution: "abandoned", from: "unknown" }) },
    ]);
    expect(calls).toHaveLength(0);
    // The donor's retry with the same key is told the request failed; nothing is created or charged.
    db.sql("UPDATE donation_intents SET request_hash = ?", await sha256Hex(JSON.stringify(["global", null, 500, null])));
    expect(await errorOf(await call("POST", "/donations/pix", { idempotencyKey: row.idempotency_key, targetKind: "global", amountCents: 500 }, null))).toEqual([
      409,
      "donation_intent_failed",
    ]);
    expect([count("donations"), calls.filter((c) => c.path.endsWith("/transparents/create")).length]).toEqual([0, 0]);
    // Closed is closed: a second resolution is refused and writes no second audit row.
    expect(await errorOf(await resolve({}))).toEqual([409, "intent_not_resolvable"]);
    expect(audits("donation.intent_resolve")).toHaveLength(1);
  });

  it("closes a stale 'pending_provider' intent, but not one still inside the provider's window or already settled", async () => {
    intent("pending_provider", ago(5_000));
    expect(await errorOf(await resolve({}))).toEqual([409, "intent_not_resolvable"]);
    db.sql("UPDATE donation_intents SET updated_at = ?", ago(61_000));
    expect((await resolve({})).status).toBe(200);
    expect(audits("donation.intent_resolve").map((a) => JSON.parse(a.detail as string))).toEqual([{ intentId: INTENT, resolution: "failed", from: "pending_provider" }]);
    for (const state of ["created", "failed"]) {
      db.sql("DELETE FROM donation_intents");
      intent(state, ago(120_000));
      expect(await errorOf(await resolve({}))).toEqual([409, "intent_not_resolvable"]);
    }
    expect(audits("donation.intent_resolve")).toHaveLength(1);
  });

  it("resolves an intent once when two administrators act at the same time", async () => {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,role,verified_at) VALUES('admin2','a2','a2','a2','Recife','a2@example.test','admin','2026-01-01')").run();
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)").bind(await sha256Hex("admin2"), "admin2", "2099-01-01").run();
    intent("unknown");
    const statuses = (await Promise.all([resolve({}), resolve({}, "admin2")])).map((r) => r.status).sort();
    expect(statuses).toEqual([200, 409]);
    expect(audits("donation.intent_resolve")).toHaveLength(1);
  });

  it("refuses a non-administrator, a stale account, a bad resolution and an unknown id, writing nothing", async () => {
    intent("unknown");
    expect(await errorOf(await resolve({}, "donor"))).toEqual([403, "admin_only"]);
    expect(await errorOf(await resolve({ accountId: "someone-else" }))).toEqual([409, "account_changed"]);
    expect(await errorOf(await resolve({ resolution: "paid" }))).toEqual([400, "invalid"]);
    expect(await errorOf(await resolve({}, "admin", "b0000000-0000-4000-8000-000000000999"))).toEqual([404, "not_found"]);
    expect(await errorOf(await resolve({}, "admin", "not-a-uuid"))).toEqual([404, "not_found"]);
    expect(db.sql("SELECT state FROM donation_intents")).toEqual([{ state: "unknown" }]);
    expect(count("audit_events")).toBe(0);
  });

  it("is dark with the flag off", async () => {
    intent("unknown");
    db.sql("INSERT INTO abacatepay_pending_events (id, event, charge_id, next_status, provider_status) VALUES ('log_x', 'transparent.completed', 'pix_char_x', 'paid', 'PAID')");
    env.DONATIONS_ENABLED = "false";
    expect(await errorOf(await resolve({}))).toEqual([404, "not_found"]);
    expect(await errorOf(await dismiss("log_x"))).toEqual([404, "not_found"]);
    expect(db.sql("SELECT state FROM donation_intents")).toEqual([{ state: "unknown" }]);
    expect(count("audit_events")).toBe(0);
  });

  it("dismisses a waiting event without recording it as processed, audits it, and a redelivery stays a duplicate", async () => {
    await settings();
    db.sql("DELETE FROM audit_events");
    const { donation } = (await (await pix({ targetKind: "global", amountCents: 500 }, "donor")).json()) as { donation: { id: string } };
    await webhook(event("log_refund", "transparent.refunded", "pix_char_1", "REFUNDED"));
    expect(await (await webhook(event("log_paid", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, applied: false, refused: true });
    expect(await errorOf(await dismiss("log_paid", "donor"))).toEqual([403, "admin_only"]);
    expect(await errorOf(await dismiss("log_paid", "admin", { accountId: "someone-else" }))).toEqual([409, "account_changed"]);
    expect(await errorOf(await dismiss("log_missing"))).toEqual([404, "not_found"]);
    const response = await dismiss("log_paid");
    expect([response.status, await response.json()]).toEqual([200, { event: { id: "log_paid", dismissed: true } }]);
    expect(audits("donation.event_dismiss")).toEqual([
      { actor: "admin", subject: "abacatepay_event:log_paid", detail: JSON.stringify({ eventId: "log_paid", holdReason: "transition_refused" }) },
    ]);
    expect(await errorOf(await dismiss("log_paid"))).toEqual([409, "event_not_pending"]);
    expect(audits("donation.event_dismiss")).toHaveLength(1);
    const overview = ((await (await call("GET", "/admin/donations/overview")).json()) as { reconciliation: { unmatchedEvents: unknown[] } }).reconciliation;
    expect(overview.unmatchedEvents).toEqual([]);
    expect(await (await webhook(event("log_paid", "transparent.completed", "pix_char_1", "PAID"))).json()).toEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT id FROM abacatepay_webhook_events")).toEqual([{ id: "log_refund" }]);
    expect(db.sql("SELECT status FROM donations WHERE id = ?", donation.id)).toEqual([{ status: "refunded" }]);
  });

  it("keeps an event waiting while an intent holding its charge can still finish the donation", async () => {
    await settings();
    intent("unknown", ago(1_000), { last_error: "store_failed", provider_charge_id: "pix_char_7", provider_status: "PENDING", br_code: "000201-x" });
    await webhook(event("log_hold", "transparent.completed", "pix_char_7", "PAID"));
    expect(await errorOf(await dismiss("log_hold"))).toEqual([409, "event_has_replayable_intent"]);
    expect(db.sql("SELECT resolved_at FROM abacatepay_pending_events WHERE id = 'log_hold'")).toEqual([{ resolved_at: null }]);
    expect(audits("donation.event_dismiss")).toHaveLength(0);
  });

  it("never records a waiting event id as processed, even when a redelivery no longer parses as tracked", async () => {
    await settings();
    await webhook(event("log_wait", "transparent.completed", "pix_char_8", "PAID"));
    const again = await webhook({ id: "log_wait", event: "billing.unknown", devMode: true, data: {} });
    expect(await again.json()).toEqual({ ok: true, duplicate: true });
    expect(db.sql("SELECT id FROM abacatepay_webhook_events WHERE id = 'log_wait'")).toEqual([]);
    expect(db.sql("SELECT resolved_at FROM abacatepay_pending_events WHERE id = 'log_wait'")).toEqual([{ resolved_at: null }]);
  });

  it("dismisses an event still waiting for its donation, which is then never applied", async () => {
    await settings();
    await webhook(event("log_early", "transparent.completed", "pix_char_1", "PAID"));
    expect((await dismiss("log_early")).status).toBe(200);
    const response = await pix({ targetKind: "global", amountCents: 500 }, "donor");
    expect(await response.json()).toMatchObject({ donation: { status: "pending" } });
    expect(count("abacatepay_webhook_events")).toBe(0);
    expect(audits("donation.event_dismiss").map((a) => JSON.parse(a.detail as string))).toEqual([{ eventId: "log_early", holdReason: "no_donation" }]);
  });
});

describe("schema behind the code", () => {
  it("answers 503 schema_outdated on the routes that need migration 0013 (v12), and the rest keeps working", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 12 });
    env.DB = db;
    await seed();
    expect((await settings()).status).toBe(200);
    expect((await call("GET", "/donations/config", undefined, null, null)).status).toBe(200);
    expect((await call("GET", `/ngos/${NGO}/donation-info`, undefined, null, null)).status).toBe(200);
    expect((await pix({ targetKind: "global", amountCents: 500 }, "donor")).status).toBe(503);
    expect((await call("GET", "/admin/donations/overview")).status).toBe(503);
    const hook = await webhook(event("log_v12", "transparent.completed", "pix_char_1", "PAID"));
    expect([hook.status, await hook.json()]).toEqual([503, { error: "schema_outdated" }]);
    expect(calls.filter((c) => c.path.endsWith("/transparents/create"))).toHaveLength(0);
    expect(count("abacatepay_webhook_events")).toBe(0);
    expect(logged).not.toHaveBeenCalled();
  });

  it("answers 503 schema_outdated on the webhook and the operator routes without migration 0014 (v13)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 13 });
    env.DB = db;
    await seed();
    await settings();
    const hook = await webhook(event("log_v13", "transparent.completed", "pix_char_1", "PAID"));
    expect([hook.status, await hook.json()]).toEqual([503, { error: "schema_outdated" }]);
    expect((await call("GET", "/admin/donations/overview")).status).toBe(503);
    db.sql("INSERT INTO abacatepay_pending_events (id, event, charge_id, next_status, provider_status) VALUES ('log_x', 'transparent.completed', 'pix_char_x', 'paid', 'PAID')");
    expect((await call("POST", "/admin/donations/events/log_x/dismiss", { accountId: "admin" })).status).toBe(503);
    // Only the settings audit row: nothing was recorded or dismissed.
    expect([count("abacatepay_webhook_events"), count("audit_events")]).toEqual([0, 1]);
    expect(logged).not.toHaveBeenCalled();
  });

  it("answers 503 schema_outdated on the donation routes and keeps the public routes working (v10)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 10 });
    env.DB = db;
    await seed();
    for (const path of ["/donations/config", `/ngos/${NGO}/donation-info`])
      expect([path, (await call("GET", path, undefined, null, null)).status]).toEqual([path, 503]);
    expect((await call("GET", "/donations/my-title", undefined, "donor")).status).toBe(503);
    expect((await pix({ targetKind: "global", amountCents: 500 }, "donor")).status).toBe(503);
    const indicators = ((await (await call("GET", "/indicators", undefined, null, null)).json()) as { indicators: Array<{ key: string; value: number | null }> }).indicators;
    expect([indicators.find((i) => i.key === "confirmed_donations")?.value, indicators.find((i) => i.key === "confirmed_amount")?.value]).toEqual([null, null]);
    expect((await call("GET", "/lots", undefined, null, null)).status).toBe(200);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe("shipping state", () => {
  it("is off in production and staging, and on only in the local dev script", () => {
    expect(configuredVars("DONATIONS_ENABLED")).toEqual(["false", "false"]);
    expect(devVar("DONATIONS_ENABLED")).toBe("true");
  });
});

it("reports gross Pix and external evidence separately after an NGO leaves the village", async () => {
  const report = async () => {
    const response = await call("GET", "/admin/donations/overview");
    expect(response.status).toBe(200);
    return (await response.json() as { paidByDestination: unknown[] }).paidByDestination;
  };
  const zero = { pix_count: 0, pix_gross_cents: 0, proof_count: 0, proof_amount_cents: 0, ngo_name: null };
  const global = { scope: "global", ngo_id: null, ...zero };
  const ngo = { scope: "ngo", ngo_id: NGO, ...zero, ngo_name: "Associação Exemplo" };
  const total = { scope: "total", ngo_id: null, ...zero };
  expect(() => createD1({ upTo: 10 }).sql(summarizePaidDonations)).toThrow(/no such table: donations/i);
  expect(createD1().sql(summarizePaidDonations)).toEqual([global, total]);
  expect(await report()).toEqual([global, ngo, total]);

  await settings({ subAccountId: "sacc_global" });
  await ngoPayment({ revision: 1, subAccountId: "sacc_ngo" });
  expect((await pix({ targetKind: "global", amountCents: 1000 }, "donor")).status).toBe(201);
  expect((await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 725 }, "donor")).status).toBe(201);
  expect(await report()).toEqual([global, ngo, total]);

  const directed = event("log_directed", "transparent.completed", "pix_char_2", "PAID", 725);
  await webhook(event("log_global", "transparent.completed", "pix_char_1", "PAID"));
  await webhook(directed);
  expect(await (await webhook(directed)).json()).toMatchObject({ duplicate: true });
  expect((await call("POST", "/admin/donations/external-proof", {
    accountId: "admin", ngoId: NGO, amountCents: 500, proofReference: "Synthetic proof",
  })).status).toBe(201);
  env.NGO_WITHDRAWAL_ENABLED = "true";
  expect((await call("POST", `/admin/ngos/${NGO}/withdraw`, {
    accountId: "admin", revision: 1, reason: "Synthetic withdrawal",
  })).status).toBe(200);

  const directedAmounts = { ...ngo, pix_count: 1, pix_gross_cents: 725, proof_count: 1, proof_amount_cents: 500 };
  expect(await report()).toEqual([
    { ...global, pix_count: 1, pix_gross_cents: 1000 }, directedAmounts,
    { ...total, pix_count: 2, pix_gross_cents: 1725, proof_count: 1, proof_amount_cents: 500 },
  ]);
  await webhook(event("log_refunded", "transparent.refunded", "pix_char_1", "REFUNDED"));
  expect(await report()).toEqual([
    global, directedAmounts, { ...total, pix_count: 1, pix_gross_cents: 725, proof_count: 1, proof_amount_cents: 500 },
  ]);
  expect(calls.filter((entry) => entry.path.endsWith("/transparents/create"))).toHaveLength(2);
});

it("includes named destinations outside the 200-organization payment settings list", async () => {
  await db.exec(`WITH RECURSIVE seq(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM seq WHERE i<200)
    INSERT INTO ngos(id,name,cnpj) SELECT 'fixture-'||i, 'A '||i, printf('%014d',i) FROM seq`);
  const response = await call("GET", "/admin/donations/overview");
  expect(response.status).toBe(200);
  const overview = await response.json() as { ngos: { id: string }[]; paidByDestination: { ngo_id: string | null; ngo_name: string | null }[] };
  expect(overview.ngos).toHaveLength(200);
  expect(overview.ngos.some(row => row.id === NGO)).toBe(false);
  expect(overview.paidByDestination).toContainEqual(expect.objectContaining({ ngo_id: NGO, ngo_name: "Associação Exemplo", pix_count: 0 }));
  expect((await call("GET", "/admin/donations/overview", undefined, "donor")).status).toBe(403);
  const publicIndicators = await call("GET", "/indicators", undefined, null, null);
  expect(publicIndicators.status).toBe(200);
  expect(await publicIndicators.json()).not.toHaveProperty("paidByDestination");
});
