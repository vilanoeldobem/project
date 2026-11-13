/**
 * Donations end to end on the real migrations (IMPL-0022, PROPOSTA): admin configuration, Pix charges with the
 * provider split, signed webhook reconciliation, Título credit exactly once, refund reversal, external links and
 * proofs, sandbox fallback and the schema guard. The provider is a stub: no test reaches AbacatePay.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { configuredVars, devVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { ABACATEPAY_PUBLIC_KEY } from "./abacatepay";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

const NGO = "a0000000-0000-4000-8000-000000000001";
const ORIGIN = "https://play.example";
const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const API_KEY = "abc_dev_test_key";
const BASE = "https://pay.test/v2";
const PRIMARY_CNPJ = "11444777000161";
const NGO_CNPJ = "11222333000181";

type ProviderCall = { path: string; body: Record<string, unknown> | null; authorization: string | null };
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
    calls.push({ path: url.pathname + url.search, body, authorization: headers.get("Authorization") });
    if (url.pathname.endsWith("/sub-accounts/create")) {
      if (subAccountFailure) return reply(subAccountFailure.status, subAccountFailure.body);
      const taxId = String(body?.taxId ?? "");
      return reply(200, { data: { id: `sacc_${taxId}`, devMode: true }, error: null, success: true });
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
const ngoPayment = (override: Record<string, unknown> = {}) =>
  call("POST", `/admin/ngos/${NGO}/payment-config`, { accountId: "admin", paymentMethod: "abacatepay", ngoPercentBps: 9500, fixedFeeCents: 80, ...override });
const pix = (body: Record<string, unknown>, user: string | null = null) => call("POST", "/donations/pix", body, user);

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
const event = (id: string, name: string, chargeId: string, status: string) => ({
  id,
  event: name,
  devMode: true,
  data: { transparent: { id: chargeId, status, amount: 1000, platformFee: 80, receiptUrl: "https://pay.test/receipt" } },
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
});

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

  it("falls back to the sandbox marker when AbacatePay has not enabled sub-accounts yet (never in production)", async () => {
    subAccountFailure = { status: 403, body: { success: false, data: null, error: "Insufficient permissions" } };
    const dev = await settings();
    expect(dev.status).toBe(200);
    expect(((await dev.json()) as { settings: { subAccountId: string } }).settings.subAccountId).toBe(`dev_sacc_${PRIMARY_CNPJ}`);
    // The charge for a development sub-account carries no `splits`, but D1 keeps the full breakdown.
    const created = await pix({ targetKind: "global", amountCents: 1000 });
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
});

describe("Pix donations", () => {
  beforeEach(async () => {
    await settings();
    await ngoPayment();
  });

  it("splits the R$ 2,00 minimum exactly and sends the NGO share to the sub-account", async () => {
    const response = await pix({ targetKind: "global", amountCents: 200 });
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

  it("pays the NGO's own sub-account and keeps a visitor's donation out of any Título", async () => {
    const response = await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 1000 });
    expect(response.status).toBe(201);
    const { donation } = (await response.json()) as { donation: { id: string } };
    const create = calls.find((c) => c.path.endsWith("/transparents/create"));
    expect((create?.body?.data as { splits: unknown[] }).splits).toEqual([{ subAccountId: `sacc_${NGO_CNPJ}`, amount: 870 }]);
    const chargeId = db.sql("SELECT provider_charge_id FROM donations WHERE id=?", donation.id)[0].provider_charge_id as string;
    expect((await webhook(event("log_visitor", "transparent.completed", chargeId, "PAID"))).status).toBe(200);
    expect(db.sql("SELECT status,title_credited FROM donations WHERE id=?", donation.id)[0]).toEqual({ status: "paid", title_credited: 0 });
  });

  it("refuses amounts and targets it cannot honour, before calling the provider", async () => {
    for (const amountCents of [199, 0, -100, 5_000_001, 2.5]) {
      const response = await pix({ targetKind: "global", amountCents });
      expect([amountCents, response.status, ((await response.json()) as { error: string }).error]).toEqual([amountCents, 400, "invalid_donation_amount"]);
    }
    expect((await pix({ targetKind: "ngo", ngoId: "a0000000-0000-4000-8000-000000000099", amountCents: 500 })).status).toBe(404);
    expect((await pix({ targetKind: "global", amountCents: 500 }, null)).status).toBe(201);
    expect(calls.filter((c) => c.path.endsWith("/transparents/create"))).toHaveLength(1);
  });

  it("answers payment_provider_unavailable and writes nothing when the provider fails", async () => {
    vi.stubGlobal("fetch", async () => reply(500, { data: null, error: "internal" }));
    const response = await pix({ targetKind: "global", amountCents: 1000 });
    expect([response.status, ((await response.json()) as { error: string }).error]).toEqual([503, "payment_provider_unavailable"]);
    expect(count("donations")).toBe(0);
  });

  it("refreshes a pending charge from the provider and answers a paid donation", async () => {
    const { donation } = (await (await pix({ targetKind: "global", amountCents: 500 })).json()) as { donation: { id: string } };
    const refreshed = await call("GET", `/donations/${donation.id}?refresh=1`, undefined, null, null);
    expect(refreshed.status).toBe(200);
    expect(await refreshed.json()).toMatchObject({ donation: { status: "paid", receiptUrl: "https://pay.test/receipt", titleCredited: false } });
    expect((await call("GET", "/donations/not-a-uuid", undefined, null, null)).status).toBe(404);
  });

  it("lets a sandbox charge be simulated, but never in production", async () => {
    const { donation } = (await (await pix({ targetKind: "global", amountCents: 500 })).json()) as { donation: { id: string } };
    const simulated = await call("POST", `/donations/${donation.id}/simulate`);
    expect(simulated.status).toBe(200);
    expect(await simulated.json()).toMatchObject({ donation: { status: "paid" } });
    env.ENVIRONMENT = "production";
    expect((await call("POST", `/donations/${donation.id}/simulate`)).status).toBe(404);
  });
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
    expect((await pix({ targetKind: "global", amountCents: 500 })).status).toBe(404);
  });
});

describe("an NGO's own payment link", () => {
  beforeEach(async () => {
    await settings();
  });

  it("is only usable after the admin validates the HTTPS link, and logs the redirect without crediting anything", async () => {
    const invalid = await ngoPayment({ paymentMethod: "external_link", donationUrl: "http://localhost/doar", linkValidated: true });
    expect(invalid.status).toBe(400);
    const unchecked = await ngoPayment({ paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar" });
    expect(unchecked.status).toBe(400);
    const saved = await ngoPayment({ paymentMethod: "external_link", donationUrl: "https://ong.org.br/doar", linkValidated: true });
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
    expect((await pix({ targetKind: "ngo", ngoId: NGO, amountCents: 500 })).status).toBe(409);
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

describe("the application keeps the requested payment mode", () => {
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
    expect(count("ngos")).toBe(1);
  });
});

describe("schema behind the code", () => {
  it("answers 503 schema_outdated on the donation routes and keeps the public routes working (v10)", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    db = createD1({ upTo: 10 });
    env.DB = db;
    await seed();
    for (const path of ["/donations/config", `/ngos/${NGO}/donation-info`])
      expect([path, (await call("GET", path, undefined, null, null)).status]).toEqual([path, 503]);
    expect((await call("GET", "/donations/my-title", undefined, "donor")).status).toBe(503);
    expect((await pix({ targetKind: "global", amountCents: 500 })).status).toBe(503);
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
