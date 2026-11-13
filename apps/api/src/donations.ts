/**
 * Donations and payment reconciliation (IMPL-0023; PROPOSTA, dark behind DONATIONS_ENABLED).
 *
 * Global donation: one partner institution, paid through its AbacatePay sub-account with a split.
 * NGO donation: the NGO's own sub-account (with split) or the NGO's validated HTTPS payment page, which only
 * records a redirect — the Vila credits nothing it cannot verify.
 *
 * Confirmed Pix payments arrive by signed webhook, by `GET /donations/:id?refresh=1` or by a sandbox simulation,
 * and all of them go through `applyCharge`, which keeps the row the single source of truth: a donation counts in
 * the public indicator and in the donor's Título while `status = 'paid'` and `title_credited = 1`. Replaying a
 * webhook changes nothing (`abacatepay_webhook_events`); a refund or lost dispute turns the credit off. A
 * donation never grants XP (DEC-042); the Título tiers are PROPOSTA (PEN-026).
 *
 * Routes (public ones need only the flag; the account route needs a session):
 *   GET  /donations/config
 *   GET  /ngos/:id/donation-info
 *   POST /donations/pix {targetKind, ngoId?, amountCents}
 *   GET  /donations/:id?refresh=1
 *   POST /donations/:id/simulate            (sandbox only)
 *   POST /donations/redirect {ngoId}
 *   POST /webhooks/abacatepay
 *   GET  /donations/my-title                (signed in)
 *   GET  /admin/donations/overview
 *   POST /admin/donations/settings
 *   POST /admin/ngos/:id/payment-config
 *   POST /admin/donations/external-proof
 *
 * Money is integer cents. Nothing here logs a key, a secret, a CNPJ or payer data; the audit rows carry ids and
 * amounts, never the payment link or the proof reference.
 */
import type { NgoPayment } from "@vila/shared/accounts/contract";
import { isValidCnpj } from "@vila/shared/accounts/validate";
import {
  computeDonationSplit,
  computeTitleProgress,
  DEFAULT_FIXED_FEE_CENTS,
  DEFAULT_NGO_PERCENT_BPS,
  MAX_DONATION_CENTS,
  MIN_DONATION_CENTS,
  type DonationStatus,
  type DonationTargetKind,
  type DonationView,
  type NgoPaymentMethod,
  type SplitConfig,
  validateExternalDonationUrl,
  validateSplitConfig,
} from "@vila/shared/donations/contract";

import { checkPixCharge, createOrGetSubAccount, createPixCharge, simulatePixPayment, subAccountIdError, verifyAbacateWebhook, type PixCharge } from "./abacatepay";
import { newId } from "./crypto";
import { allowedOrigins, HttpError, json, NO_STORE, readBytes, readJson } from "./http";
import { assertAccount, currentUser, requireAdmin, requireUser } from "./session";
import type { Env } from "./api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WEBHOOK_MAX_BYTES = 64_000;

/** The flag that keeps every donation route dark until the owner approves it (404, like the withdraw route). */
const requireDonations = (env: Env): void => {
  if (env.DONATIONS_ENABLED !== "true") throw new HttpError(404, "not_found");
};

/** A browser POST must come from an allowed page origin; server-to-server calls (the webhook) send none. */
function assertAllowedOrigin(request: Request, env: Env): void {
  const origin = request.headers.get("Origin");
  if (origin && !allowedOrigins(env.ALLOWED_ORIGINS).includes(origin)) throw new HttpError(403, "forbidden_origin");
}

const textOrNull = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
const centsOrNull = (value: unknown): number | null => (Number.isSafeInteger(value) && (value as number) >= 0 ? (value as number) : null);

interface SettingsRow {
  primary_ngo_name: string | null;
  primary_ngo_cnpj: string | null;
  primary_sub_account_id: string | null;
  ngo_percent_bps: number;
  fixed_fee_cents: number;
  updated_at: string;
}

interface PaymentRow {
  ngo_id: string;
  payment_method: NgoPaymentMethod;
  donation_url: string | null;
  sub_account_id: string | null;
  ngo_percent_bps: number;
  fixed_fee_cents: number;
  link_validated: number;
  updated_at: string;
}

interface DonationRow {
  id: string;
  target_kind: DonationTargetKind;
  ngo_id: string | null;
  recipient_name: string;
  user_id: string | null;
  provider: string;
  provider_charge_id: string | null;
  sub_account_id: string | null;
  amount_cents: number;
  ngo_share_cents: number;
  vila_share_cents: number;
  platform_fee_cents: number | null;
  ngo_percent_bps: number;
  fixed_fee_cents: number;
  status: DonationStatus;
  br_code: string | null;
  br_code_base64: string | null;
  receipt_url: string | null;
  expires_at: string | null;
  dev_mode: number;
  title_credited: number;
  proof_note: string | null;
  paid_at: string | null;
  refunded_at: string | null;
  created_at: string;
  updated_at: string;
}

const SETTINGS_QUERY =
  "SELECT primary_ngo_name, primary_ngo_cnpj, primary_sub_account_id, ngo_percent_bps, fixed_fee_cents, updated_at FROM donation_settings WHERE id = 'global'";
const PAYMENT_QUERY =
  "SELECT ngo_id, payment_method, donation_url, sub_account_id, ngo_percent_bps, fixed_fee_cents, link_validated, updated_at FROM ngo_payment_configs WHERE ngo_id = ?";
const DONATION_QUERY = "SELECT * FROM donations WHERE id = ?";

/** A published NGO on a published lot, like every other public projection. */
const PUBLISHED_NGO = `SELECT n.id, n.name FROM ngos n JOIN lots l ON l.ngo_id = n.id
  WHERE n.id = ? AND n.status = 'published' AND l.state = 'published' ORDER BY l.id LIMIT 1`;

const readSettings = (env: Env): Promise<SettingsRow | null> => env.DB!.prepare(SETTINGS_QUERY).first<SettingsRow>();
const readPayment = (env: Env, ngoId: string): Promise<PaymentRow | null> => env.DB!.prepare(PAYMENT_QUERY).bind(ngoId).first<PaymentRow>();
const readDonation = (env: Env, id: string): Promise<DonationRow | null> => env.DB!.prepare(DONATION_QUERY).bind(id).first<DonationRow>();

/** The configured split, defaulting only when there is no row yet (the FKs and CHECKs keep the rest valid). */
const splitOf = (row: { ngo_percent_bps?: number | null; fixed_fee_cents?: number | null } | null): SplitConfig => ({
  ngoPercentBps: row?.ngo_percent_bps ?? DEFAULT_NGO_PERCENT_BPS,
  fixedFeeCents: row?.fixed_fee_cents ?? DEFAULT_FIXED_FEE_CENTS,
});

const donationView = (row: DonationRow): DonationView => ({
  id: row.id,
  targetKind: row.target_kind,
  ngoId: row.ngo_id,
  recipientName: row.recipient_name,
  amountCents: row.amount_cents,
  ngoShareCents: row.ngo_share_cents,
  vilaShareCents: row.vila_share_cents,
  ngoPercentBps: row.ngo_percent_bps,
  fixedFeeCents: row.fixed_fee_cents,
  status: row.status,
  brCode: row.br_code,
  brCodeBase64: row.br_code_base64,
  receiptUrl: row.receipt_url,
  expiresAt: row.expires_at,
  devMode: row.dev_mode === 1,
  titleCredited: row.title_credited === 1,
  paidAt: row.paid_at,
  createdAt: row.created_at,
});

const settingsView = (row: SettingsRow | null, internal: boolean) => ({
  primaryNgoName: row?.primary_ngo_name ?? null,
  ...(internal ? { primaryNgoCnpj: row?.primary_ngo_cnpj ?? null, subAccountId: row?.primary_sub_account_id ?? null } : {}),
  ...splitOf(row),
  configured: Boolean(row?.primary_sub_account_id),
  updatedAt: row?.updated_at ?? null,
});

/** The `ngoPayment` block of a private application answer; null while the donations flag is off. */
export async function readNgoPayment(env: Env, ngoId: string): Promise<NgoPayment | null> {
  if (env.DONATIONS_ENABLED !== "true" || !env.DB) return null;
  const row = await readPayment(env, ngoId);
  return row
    ? {
        method: row.payment_method,
        donationUrl: row.donation_url,
        subAccountId: row.sub_account_id,
        ngoPercentBps: row.ngo_percent_bps,
        fixedFeeCents: row.fixed_fee_cents,
        linkValidated: row.link_validated === 1,
        updatedAt: row.updated_at,
      }
    : null;
}

/* ------------------------------------------------------------------ public */

export async function getDonationConfig(env: Env): Promise<Response> {
  requireDonations(env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const row = await readSettings(env);
  return json(
    {
      global: {
        enabled: Boolean(row?.primary_sub_account_id),
        recipientName: row?.primary_ngo_name ?? null,
        ...splitOf(row),
        minAmountCents: MIN_DONATION_CENTS,
      },
    },
    { headers: NO_STORE }
  );
}

export async function getNgoDonationInfo(env: Env, id: string): Promise<Response> {
  requireDonations(env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  const ngo = await env.DB.prepare(PUBLISHED_NGO).bind(id).first<{ id: string; name: string }>();
  if (!ngo) throw new HttpError(404, "not_found");
  const payment = await readPayment(env, id);
  const stats = await env.DB.prepare("SELECT COUNT(*) AS n, COALESCE(SUM(amount_cents), 0) AS total FROM donations WHERE ngo_id = ? AND status = 'paid'")
    .bind(id)
    .first<{ n: number; total: number }>();
  const method: NgoPaymentMethod = payment?.payment_method ?? "abacatepay";
  return json(
    {
      ngoId: id,
      name: ngo.name,
      method,
      enabled: method === "external_link" ? Boolean(payment?.link_validated && payment.donation_url) : Boolean(payment?.sub_account_id),
      ...splitOf(payment),
      minAmountCents: MIN_DONATION_CENTS,
      confirmedDonations: stats?.n ?? 0,
      confirmedAmountCents: stats?.total ?? 0,
    },
    { headers: NO_STORE }
  );
}

/** Map the provider's charge status onto the donation state machine. */
function chargeStatus(raw: string): DonationStatus {
  switch (raw.toUpperCase()) {
    case "PAID":
    case "COMPLETED":
      return "paid";
    case "REFUNDED":
      return "refunded";
    case "UNDER_DISPUTE":
    case "DISPUTED":
      return "under_dispute";
    case "EXPIRED":
      return "expired";
    case "CANCELLED":
    case "CANCELED":
      return "cancelled";
    default:
      return "pending";
  }
}

/** From which states each new status may be applied; a stale or out-of-order event changes nothing. */
const TRANSITIONS: Record<Exclude<DonationStatus, "pending">, DonationStatus[]> = {
  paid: ["pending", "expired", "cancelled", "under_dispute"],
  refunded: ["paid", "under_dispute"],
  under_dispute: ["paid"],
  expired: ["pending"],
  cancelled: ["pending"],
};

/**
 * One UPDATE of a donation row, guarded by the current status. `delivery` binds it to the webhook insert of THIS
 * delivery: a replayed event keeps its first `processed_at`, so the EXISTS is false and nothing changes.
 */
function chargeUpdate(
  env: Env,
  charge: PixCharge,
  next: Exclude<DonationStatus, "pending">,
  delivery?: { eventId: string; marker: string }
): D1PreparedStatement {
  const from = TRANSITIONS[next];
  const now = new Date().toISOString();
  const paid = next === "paid" ? 1 : 0;
  const refunded = next === "refunded" ? 1 : 0;
  return env.DB!.prepare(
    `UPDATE donations SET status = ?, paid_at = CASE WHEN ? = 1 THEN COALESCE(paid_at, ?) ELSE paid_at END,
       refunded_at = CASE WHEN ? = 1 THEN COALESCE(refunded_at, ?) ELSE refunded_at END,
       title_credited = CASE WHEN ? = 1 AND user_id IS NOT NULL AND provider = 'abacatepay' THEN 1 ELSE 0 END,
       platform_fee_cents = COALESCE(?, platform_fee_cents), receipt_url = COALESCE(?, receipt_url),
       br_code = COALESCE(?, br_code), br_code_base64 = COALESCE(?, br_code_base64), updated_at = ?
     WHERE provider_charge_id = ? AND status IN (${from.map(() => "?").join(",")})${
       delivery ? " AND EXISTS (SELECT 1 FROM abacatepay_webhook_events WHERE id = ? AND processed_at = ?)" : ""
     }`
  ).bind(
    next, paid, now, refunded, now, paid, charge.platformFeeCents, charge.receiptUrl, charge.brCode, charge.brCodeBase64, now, charge.id,
    ...from,
    ...(delivery ? [delivery.eventId, delivery.marker] : [])
  );
}

/**
 * The only place a charge changes a donation row. Guarded by the current status, so a late PENDING check cannot
 * undo a payment and a refund cannot be overwritten by a replay; `title_credited` follows the new status.
 */
async function applyCharge(env: Env, charge: PixCharge, next: DonationStatus): Promise<void> {
  if (next === "pending") return;
  await chargeUpdate(env, charge, next).run();
}

export async function createDonation(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  assertAllowedOrigin(request, env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const db = env.DB;
  const body = await readJson(request, 4_000);
  const targetKind = body.targetKind;
  if (targetKind !== "global" && targetKind !== "ngo")
    throw new HttpError(400, "invalid", { targetKind: "Escolha a doação global ou uma ONG da Vila." });
  const amountCents = body.amountCents;
  if (!Number.isSafeInteger(amountCents) || (amountCents as number) < MIN_DONATION_CENTS || (amountCents as number) > MAX_DONATION_CENTS)
    throw new HttpError(400, "invalid_donation_amount");

  let recipientName: string;
  let ngoId: string | null = null;
  let splitConfig: SplitConfig;
  let subAccountId: string;
  if (targetKind === "global") {
    const settings = await readSettings(env);
    if (!settings?.primary_ngo_name || !settings.primary_sub_account_id) throw new HttpError(409, "global_donation_not_configured");
    recipientName = settings.primary_ngo_name;
    splitConfig = splitOf(settings);
    subAccountId = settings.primary_sub_account_id;
  } else {
    if (typeof body.ngoId !== "string" || !UUID.test(body.ngoId)) throw new HttpError(400, "invalid", { ngoId: "Escolha uma ONG publicada na Vila." });
    const ngo = await db.prepare(PUBLISHED_NGO).bind(body.ngoId).first<{ id: string; name: string }>();
    if (!ngo) throw new HttpError(404, "not_found");
    const payment = await readPayment(env, ngo.id);
    if (payment?.payment_method === "external_link" || !payment?.sub_account_id) throw new HttpError(409, "ngo_payment_not_configured");
    ngoId = ngo.id;
    recipientName = ngo.name;
    splitConfig = splitOf(payment);
    subAccountId = payment.sub_account_id;
  }

  let split;
  try {
    split = computeDonationSplit(amountCents as number, splitConfig);
  } catch {
    // The amount is already inside the Pix window, so the remaining refusal is the configured split.
    throw new HttpError(409, targetKind === "global" ? "global_donation_not_configured" : "ngo_payment_not_configured");
  }

  // Resolve the donor before creating the provider charge: a session read that fails must not leave a payable Pix
  // with no local row.
  const user = await currentUser(request, env);
  const id = newId();
  const charge = await createPixCharge(env, {
    amountCents: split.amountCents,
    description: `Doacao Vila Noel do Bem - ${recipientName}`,
    externalId: id,
    subAccountId,
    ngoShareCents: split.ngoShareCents,
    metadata: { donationId: id, targetKind },
  });
  await db
    .prepare(
      `INSERT INTO donations (id, target_kind, ngo_id, recipient_name, user_id, provider, provider_charge_id, sub_account_id,
         amount_cents, ngo_share_cents, vila_share_cents, platform_fee_cents, ngo_percent_bps, fixed_fee_cents, status,
         br_code, br_code_base64, receipt_url, expires_at, dev_mode)
       VALUES (?, ?, ?, ?, ?, 'abacatepay', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
    )
    .bind(
      id,
      targetKind,
      ngoId,
      recipientName,
      user?.id ?? null,
      charge.id,
      subAccountId,
      split.amountCents,
      split.ngoShareCents,
      split.vilaShareCents,
      charge.platformFeeCents,
      split.ngoPercentBps,
      split.fixedFeeCents,
      charge.brCode,
      charge.brCodeBase64,
      charge.receiptUrl,
      charge.expiresAt,
      charge.devMode ? 1 : 0
    )
    .run();
  await applyCharge(env, charge, chargeStatus(charge.status));
  return json({ donation: donationView((await readDonation(env, id))!) }, { status: 201, headers: NO_STORE });
}

export async function getDonation(env: Env, id: string, url: URL): Promise<Response> {
  requireDonations(env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  let row = await readDonation(env, id);
  if (!row) throw new HttpError(404, "not_found");
  if (row.status === "pending" && row.provider === "abacatepay" && row.provider_charge_id && url.searchParams.get("refresh") === "1") {
    const charge = await checkPixCharge(env, row.provider_charge_id);
    await applyCharge(env, charge, chargeStatus(charge.status));
    row = (await readDonation(env, id))!;
  }
  return json({ donation: donationView(row) }, { headers: NO_STORE });
}

export async function simulateDonation(request: Request, env: Env, id: string): Promise<Response> {
  requireDonations(env);
  // Sandbox only: production can never be told a donation was paid without the provider's own confirmation.
  if (env.ENVIRONMENT === "production") throw new HttpError(404, "not_found");
  assertAllowedOrigin(request, env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  const row = await readDonation(env, id);
  if (!row || row.provider !== "abacatepay" || row.dev_mode !== 1 || !row.provider_charge_id) throw new HttpError(404, "not_found");
  const simulated = await simulatePixPayment(env, row.provider_charge_id);
  const charge = simulated.status === "PAID" ? simulated : await checkPixCharge(env, row.provider_charge_id);
  await applyCharge(env, charge, chargeStatus(charge.status));
  return json({ donation: donationView((await readDonation(env, id))!) }, { headers: NO_STORE });
}

export async function recordRedirect(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  assertAllowedOrigin(request, env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const body = await readJson(request, 2_000);
  if (typeof body.ngoId !== "string" || !UUID.test(body.ngoId)) throw new HttpError(400, "invalid", { ngoId: "Escolha uma ONG publicada na Vila." });
  const ngo = await env.DB.prepare(PUBLISHED_NGO).bind(body.ngoId).first<{ id: string; name: string }>();
  if (!ngo) throw new HttpError(404, "not_found");
  const payment = await readPayment(env, ngo.id);
  if (payment?.payment_method !== "external_link" || payment.link_validated !== 1 || !payment.donation_url)
    throw new HttpError(409, "ngo_payment_not_configured");
  const user = await currentUser(request, env);
  await env.DB.prepare("INSERT INTO donation_redirects (id, ngo_id, user_id, target_url) VALUES (?, ?, ?, ?)")
    .bind(newId(), ngo.id, user?.id ?? null, payment.donation_url)
    .run();
  // The click is logged; the payment happens outside the Vila and credits nothing by itself.
  return json({ url: payment.donation_url, tracked: true, titleCredit: "none" }, { headers: NO_STORE });
}

/** The status the webhook event asks for; null when the event is not about a donation we track. */
function webhookStatus(event: string, providerStatus: string): Exclude<DonationStatus, "pending"> | null {
  const status = providerStatus.toUpperCase();
  if (event === "transparent.completed") return "paid";
  if (event === "transparent.refunded" || event === "transparent.lost") return "refunded";
  if (event === "transparent.disputed") {
    if (status === "UNDER_DISPUTE" || status === "DISPUTED") return "under_dispute";
    if (status === "REFUNDED") return "refunded";
    if (status === "PAID") return "paid";
  }
  return null;
}

export async function abacateWebhook(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const raw = await readBytes(request, WEBHOOK_MAX_BYTES);
  await verifyAbacateWebhook(request, raw, env.ABACATEPAY_WEBHOOK_SECRET ?? "");
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    throw new HttpError(400, "bad_json");
  }
  if (!payload || typeof payload !== "object") throw new HttpError(400, "bad_json");
  const envelope = payload as { id?: unknown; event?: unknown; data?: unknown };
  const eventId = typeof envelope.id === "string" ? envelope.id : "";
  const eventName = typeof envelope.event === "string" ? envelope.event : "";
  if (!eventId || !eventName) throw new HttpError(400, "bad_json");
  const data = envelope.data && typeof envelope.data === "object" && "transparent" in envelope.data ? envelope.data.transparent : null;
  const transparent = data && typeof data === "object" ? (data as Record<string, unknown>) : null;
  const chargeId = textOrNull(transparent?.id);
  const providerStatus = typeof transparent?.status === "string" ? transparent.status : "";
  const next = webhookStatus(eventName, providerStatus);
  const charge: PixCharge | null =
    chargeId && next
      ? {
          id: chargeId,
          status: providerStatus,
          amountCents: centsOrNull(transparent?.amount),
          brCode: null,
          brCodeBase64: null,
          receiptUrl: textOrNull(transparent?.receiptUrl),
          platformFeeCents: centsOrNull(transparent?.platformFee),
          devMode: transparent?.devMode === true,
          expiresAt: null,
        }
      : null;

  // The update is bound to THIS insert, not merely to the event id: a replay inserts nothing and the old
  // processed_at makes its EXISTS false, so a replayed event cannot undo a later dispute or refund.
  const marker = new Date().toISOString();
  const statements = [
    env.DB.prepare("INSERT OR IGNORE INTO abacatepay_webhook_events (id, event, charge_id, processed_at) VALUES (?, ?, ?, ?)").bind(eventId, eventName, chargeId, marker),
  ];
  if (charge && next) {
    statements.push(chargeUpdate(env, charge, next, { eventId, marker }));
  }
  const [inserted, updated] = await env.DB.batch(statements);
  if (!inserted.meta.changes) return json({ ok: true, duplicate: true }, { headers: NO_STORE });
  return json({ ok: true, applied: Boolean(updated?.meta.changes) }, { headers: NO_STORE });
}

export async function getMyTitle(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  const user = await requireUser(request, env);
  const db = env.DB!;
  const totals = await db
    .prepare("SELECT COALESCE(SUM(amount_cents), 0) AS eligible_cents, COUNT(*) AS confirmed_count FROM donations WHERE user_id = ? AND status = 'paid' AND title_credited = 1")
    .bind(user.id)
    .first<{ eligible_cents: number; confirmed_count: number }>();
  const { results } = await db
    .prepare("SELECT * FROM donations WHERE user_id = ? ORDER BY created_at DESC LIMIT 20")
    .bind(user.id)
    .all<DonationRow>();
  return json({ title: computeTitleProgress(totals?.eligible_cents ?? 0, totals?.confirmed_count ?? 0), donations: results.map(donationView) }, { headers: NO_STORE });
}

/* ------------------------------------------------------------------- admin */

export async function adminDonationOverview(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  await requireAdmin(request, env);
  const db = env.DB!;
  const settings = await readSettings(env);
  const { results: ngos } = await db
    .prepare(
      `SELECT n.id, n.name, CASE WHEN w.ngo_id IS NOT NULL THEN 'withdrawn' ELSE n.status END AS status,
              l.id AS lotId, c.payment_method, c.donation_url, c.sub_account_id, c.link_validated,
              c.ngo_percent_bps, c.fixed_fee_cents
         FROM ngos n
         LEFT JOIN ngo_withdrawals w ON w.ngo_id = n.id
         LEFT JOIN lots l ON l.ngo_id = n.id AND l.state = 'published'
         LEFT JOIN ngo_payment_configs c ON c.ngo_id = n.id
        ORDER BY n.name LIMIT 200`
    )
    .all();
  const { results: recentDonations } = await db.prepare("SELECT * FROM donations ORDER BY created_at DESC LIMIT 50").all<DonationRow>();
  const { results: recentRedirects } = await db
    .prepare("SELECT r.id, r.ngo_id, n.name AS ngo_name, r.created_at FROM donation_redirects r LEFT JOIN ngos n ON n.id = r.ngo_id ORDER BY r.created_at DESC LIMIT 50")
    .all();
  return json({ settings: settingsView(settings, true), ngos, recentDonations: recentDonations.map(donationView), recentRedirects }, { headers: NO_STORE });
}

/** Validates the split fields shared by the two admin forms; throws the pt-BR field errors when unusable. */
function splitFromBody(body: Record<string, unknown>): SplitConfig {
  const ngoPercentBps = Number.isSafeInteger(body.ngoPercentBps) ? (body.ngoPercentBps as number) : -1;
  const fixedFeeCents = Number.isSafeInteger(body.fixedFeeCents) ? (body.fixedFeeCents as number) : -1;
  const errors = validateSplitConfig({ ngoPercentBps, fixedFeeCents });
  if (Object.keys(errors).length) throw new HttpError(400, "invalid", errors as Record<string, string>);
  return { ngoPercentBps, fixedFeeCents };
}

export async function adminUpdateSettings(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  const admin = await requireAdmin(request, env);
  const body = await readJson(request, 8_000);
  assertAccount(body, admin);
  const name = typeof body.primaryNgoName === "string" ? body.primaryNgoName.trim().replace(/\s+/g, " ") : "";
  const cnpj = typeof body.primaryNgoCnpj === "string" ? body.primaryNgoCnpj.replace(/\D/g, "") : "";
  const errors: Record<string, string> = {};
  if (name.length < 3 || name.length > 120) errors.primaryNgoName = "Digite o nome da instituição parceira (3 a 120 caracteres).";
  if (!isValidCnpj(cnpj)) errors.primaryNgoCnpj = "CNPJ inválido. Confira os 14 números.";
  if (Object.keys(errors).length) throw new HttpError(400, "invalid", errors);
  const split = splitFromBody(body);
  const given = typeof body.subAccountId === "string" ? body.subAccountId.trim() : "";
  const givenError = given ? subAccountIdError(env, given) : null;
  if (givenError) throw new HttpError(400, "invalid", { subAccountId: givenError });
  const subAccountId = given || (await createOrGetSubAccount(env, { name, taxId: cnpj, externalId: "vila-global" })).id;
  const now = new Date().toISOString();
  const db = env.DB!;
  await db.batch([
    db
      .prepare(
        `INSERT INTO donation_settings (id, primary_ngo_name, primary_ngo_cnpj, primary_sub_account_id, ngo_percent_bps, fixed_fee_cents, updated_by, updated_at)
         VALUES ('global', ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET primary_ngo_name = excluded.primary_ngo_name, primary_ngo_cnpj = excluded.primary_ngo_cnpj,
           primary_sub_account_id = excluded.primary_sub_account_id, ngo_percent_bps = excluded.ngo_percent_bps,
           fixed_fee_cents = excluded.fixed_fee_cents, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      )
      .bind(name, cnpj, subAccountId, split.ngoPercentBps, split.fixedFeeCents, admin.id, now),
    // The audit carries ids, percentages and the kind of sub-account — never the CNPJ or the account id itself.
    db
      .prepare("INSERT INTO audit_events (id, actor, action, subject, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(
        newId(),
        admin.id,
        "donation.settings_update",
        "donation:global",
        JSON.stringify({ ngoPercentBps: split.ngoPercentBps, fixedFeeCents: split.fixedFeeCents, subAccount: subAccountId.startsWith("dev_sacc_") ? "dev_sacc" : "sacc" })
      ),
  ]);
  return json({ settings: settingsView(await readSettings(env), true) }, { headers: NO_STORE });
}

export async function adminUpdateNgoPayment(request: Request, env: Env, id: string): Promise<Response> {
  requireDonations(env);
  const admin = await requireAdmin(request, env);
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  const body = await readJson(request, 8_000);
  assertAccount(body, admin);
  const db = env.DB!;
  const ngo = await db
    .prepare("SELECT n.id, n.name, n.cnpj, n.status, w.ngo_id AS withdrawn FROM ngos n LEFT JOIN ngo_withdrawals w ON w.ngo_id = n.id WHERE n.id = ?")
    .bind(id)
    .first<{ id: string; name: string; cnpj: string; status: string; withdrawn: string | null }>();
  if (!ngo) throw new HttpError(404, "not_found");
  if (ngo.withdrawn) throw new HttpError(409, "application_withdrawn");
  const method = body.paymentMethod;
  if (method !== "abacatepay" && method !== "external_link")
    throw new HttpError(400, "invalid", { paymentMethod: "Escolha AbacatePay ou um link próprio da organização." });
  const split = splitFromBody(body);
  let donationUrl: string | null = null;
  let subAccountId: string | null = null;
  let linkValidated = 0;
  if (method === "external_link") {
    const link = validateExternalDonationUrl(body.donationUrl);
    if (!link.url) throw new HttpError(400, "invalid", { donationUrl: link.error ?? "Informe um link HTTPS público válido da organização." });
    // Confirming the link is a human check; the box is required, not assumed.
    if (body.linkValidated !== true)
      throw new HttpError(400, "invalid", { linkValidated: "Abra o link e confirme que é uma página de doação da própria organização." });
    donationUrl = link.url;
    linkValidated = 1;
  } else {
    const given = typeof body.subAccountId === "string" ? body.subAccountId.trim() : "";
    const givenError = given ? subAccountIdError(env, given) : null;
    if (givenError) throw new HttpError(400, "invalid", { subAccountId: givenError });
    subAccountId = given || (await createOrGetSubAccount(env, { name: ngo.name, taxId: ngo.cnpj, externalId: ngo.id })).id;
  }
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO ngo_payment_configs (ngo_id, payment_method, donation_url, sub_account_id, ngo_percent_bps, fixed_fee_cents, link_validated, updated_by, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ngo_id) DO UPDATE SET payment_method = excluded.payment_method, donation_url = excluded.donation_url,
           sub_account_id = excluded.sub_account_id, ngo_percent_bps = excluded.ngo_percent_bps, fixed_fee_cents = excluded.fixed_fee_cents,
           link_validated = excluded.link_validated, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      )
      .bind(id, method, donationUrl, subAccountId, split.ngoPercentBps, split.fixedFeeCents, linkValidated, admin.id, now),
    db
      .prepare("INSERT INTO audit_events (id, actor, action, subject, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(
        newId(),
        admin.id,
        "ngo.payment_config",
        `ngo:${id}`,
        JSON.stringify({ method, linkValidated: linkValidated === 1, ngoPercentBps: split.ngoPercentBps, fixedFeeCents: split.fixedFeeCents })
      ),
  ]);
  const payment = await readNgoPayment(env, id);
  return json({ payment }, { headers: NO_STORE });
}

export async function adminExternalProof(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  const admin = await requireAdmin(request, env);
  const body = await readJson(request, 8_000);
  assertAccount(body, admin);
  const ngoId = typeof body.ngoId === "string" && UUID.test(body.ngoId) ? body.ngoId : "";
  const amountCents = Number.isSafeInteger(body.amountCents) ? (body.amountCents as number) : 0;
  const reference = typeof body.proofReference === "string" ? body.proofReference.trim().replace(/\s+/g, " ") : "";
  const note = typeof body.note === "string" ? body.note.trim() : "";
  const errors: Record<string, string> = {};
  if (!ngoId) errors.ngoId = "Escolha a organização.";
  if (amountCents < MIN_DONATION_CENTS || amountCents > MAX_DONATION_CENTS) errors.amountCents = "Informe o valor comprovado (mínimo de R$ 2,00).";
  if (reference.length < 3 || reference.length > 200) errors.proofReference = "Informe a referência do comprovante (3 a 200 caracteres).";
  if (note.length > 1000) errors.note = "A observação pode ter até 1000 caracteres.";
  if (Object.keys(errors).length) throw new HttpError(400, "invalid", errors);
  const db = env.DB!;
  const ngo = await db.prepare(PUBLISHED_NGO).bind(ngoId).first<{ id: string; name: string }>();
  if (!ngo) throw new HttpError(404, "not_found");
  const id = newId();
  const now = new Date().toISOString();
  await db.batch([
    db
      .prepare(
        `INSERT INTO donations (id, target_kind, ngo_id, recipient_name, user_id, provider, provider_charge_id, amount_cents,
           ngo_share_cents, vila_share_cents, ngo_percent_bps, fixed_fee_cents, status, title_credited, proof_note, paid_at, updated_at)
         VALUES (?, 'ngo', ?, ?, NULL, 'external_proof', ?, ?, ?, 0, 10000, 0, 'paid', 0, ?, ?, ?)`
      )
      .bind(id, ngo.id, ngo.name, `ext_${id}`, amountCents, amountCents, reference + (note ? ` — ${note}` : ""), now, now),
    db
      .prepare("INSERT INTO audit_events (id, actor, action, subject, detail) VALUES (?, ?, ?, ?, ?)")
      .bind(newId(), admin.id, "donation.external_proof", `ngo:${ngoId}`, JSON.stringify({ donationId: id, amountCents })),
  ]);
  return json({ donation: donationView((await readDonation(env, id))!) }, { status: 201, headers: NO_STORE });
}
