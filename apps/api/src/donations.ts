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
 * Durable creation intent (IMPL-0028, PROPOSTA): `POST /donations/pix` writes a `donation_intents` row, keyed by
 * the client's `idempotencyKey`, BEFORE it calls the provider, and writes the provider's answer to the same row.
 * The provider is called at most ONCE per key: a retry never calls it again. A timeout, a provider error or a
 * stale in-flight row ends 'unknown' or 'failed' (never deleted; the client starts over with a new key), and when
 * the provider answered but D1 failed, the answer is copied onto the row and a retry finishes from that copy. A
 * signed webhook about a charge with no donation yet waits in `abacatepay_pending_events` (not "processed") and is
 * applied, in arrival order, as soon as that donation exists. An event whose status change the guard refuses is
 * not "processed" either: it waits there as 'transition_refused' until an administrator dismisses it.
 *
 * Routes (public ones need only the flag; the account route needs a session):
 *   GET  /donations/config
 *   GET  /ngos/:id/donation-info
 *   POST /donations/pix {idempotencyKey, targetKind, ngoId?, amountCents}
 *   GET  /donations/:id?refresh=1
 *   POST /donations/:id/simulate            (sandbox only)
 *   POST /donations/redirect {ngoId}
 *   POST /webhooks/abacatepay
 *   GET  /donations/my-title                (signed in)
 *   GET  /admin/donations/overview
 *   POST /admin/donations/settings
 *   POST /admin/ngos/:id/payment-config
 *   POST /admin/donations/external-proof
 *   POST /admin/donations/intents/:id/resolve {accountId, resolution: "failed" | "abandoned"}
 *   POST /admin/donations/events/:id/dismiss  {accountId}
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

import {
  assertChargeConfig,
  ChargeCreationError,
  checkPixCharge,
  createOrGetSubAccount,
  createPixCharge,
  simulatePixPayment,
  subAccountIdError,
  verifyAbacateWebhook,
  type PixCharge,
} from "./abacatepay";
import { newId, sha256Hex } from "./crypto";
import { allowedOrigins, HttpError, json, NO_STORE, readBytes, readJson } from "./http";
import { assertAccount, assertStillAdmin, currentUser, readSessionToken, rehearsesAccountActions, requireAdmin, requireUser, STILL_ADMIN } from "./session";
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

/**
 * From which states each new status may be applied; a stale or out-of-order event changes nothing. A refund is
 * final and applies from every other state: when it is delivered before the payment confirmation (the provider
 * retries a failed delivery later), the late confirmation must not count a refunded donation as paid. A payment
 * confirmation does not end a dispute either (IMPL-0028): only the dispute's own outcome does (`DISPUTE_WON_FROM`).
 */
const TRANSITIONS: Record<Exclude<DonationStatus, "pending">, DonationStatus[]> = {
  paid: ["pending", "expired", "cancelled"],
  refunded: ["pending", "expired", "cancelled", "paid", "under_dispute"],
  under_dispute: ["paid"],
  expired: ["pending"],
  cancelled: ["pending"],
};

/** A `transparent.disputed` event whose charge is PAID again: the dispute was won, so it may leave 'under_dispute'. */
const DISPUTE_WON_FROM: DonationStatus[] = [...TRANSITIONS.paid, "under_dispute"];

/** The statuses a webhook event may move a donation from. */
const eventFrom = (eventName: string, next: Exclude<DonationStatus, "pending">): DonationStatus[] =>
  eventName === "transparent.disputed" && next === "paid" ? DISPUTE_WON_FROM : TRANSITIONS[next];

/** An extra SQL condition on the guarded update (a webhook's idempotency checks), with its binds. */
interface Guard {
  from?: DonationStatus[];
  sql: string;
  binds: unknown[];
}

/**
 * One UPDATE of a donation row, guarded by the current status (`guard.from`, default `TRANSITIONS[next]`). The
 * webhook and the drain add their own condition (`guard.sql`) so a delivery of an event already recorded, or
 * already waiting for an operator, changes nothing.
 */
function chargeUpdate(env: Env, charge: PixCharge, next: Exclude<DonationStatus, "pending">, guard?: Guard): D1PreparedStatement {
  const from = guard?.from ?? TRANSITIONS[next];
  const now = new Date().toISOString();
  const paid = next === "paid" ? 1 : 0;
  const refunded = next === "refunded" ? 1 : 0;
  return env.DB!.prepare(
    `UPDATE donations SET status = ?, paid_at = CASE WHEN ? = 1 THEN COALESCE(paid_at, ?) ELSE paid_at END,
       refunded_at = CASE WHEN ? = 1 THEN COALESCE(refunded_at, ?) ELSE refunded_at END,
       title_credited = CASE WHEN ? = 1 AND user_id IS NOT NULL AND provider = 'abacatepay' THEN 1 ELSE 0 END,
       platform_fee_cents = COALESCE(?, platform_fee_cents), receipt_url = COALESCE(?, receipt_url),
       br_code = COALESCE(?, br_code), br_code_base64 = COALESCE(?, br_code_base64), updated_at = ?
     WHERE provider_charge_id = ? AND status IN (${from.map(() => "?").join(",")})${guard ? ` AND ${guard.sql}` : ""}`
  ).bind(
    next, paid, now, refunded, now, paid, charge.platformFeeCents, charge.receiptUrl, charge.brCode, charge.brCodeBase64, now, charge.id,
    ...from,
    ...(guard?.binds ?? [])
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

/* ------------------------------------------------- durable creation intent */

/**
 * An intent still 'pending_provider' after this long lost its worker (the provider call times out at 15 s). It is
 * never handed to another request: the next read of its key turns it 'unknown', for an operator.
 */
export const STALE_IN_FLIGHT_MS = 60_000;

type IntentState = "pending_provider" | "created" | "unknown" | "failed";

interface IntentRow {
  id: string;
  idempotency_key: string;
  request_hash: string;
  target_kind: DonationTargetKind;
  ngo_id: string | null;
  recipient_name: string;
  user_id: string | null;
  sub_account_id: string;
  amount_cents: number;
  ngo_share_cents: number;
  vila_share_cents: number;
  ngo_percent_bps: number;
  fixed_fee_cents: number;
  state: IntentState;
  last_error: string | null;
  provider_charge_id: string | null;
  provider_status: string | null;
  br_code: string | null;
  br_code_base64: string | null;
  receipt_url: string | null;
  expires_at: string | null;
  platform_fee_cents: number | null;
  dev_mode: number;
  created_at: string;
  updated_at: string;
}

/** Recipient, sub-account and split of a request, resolved from the current configuration. */
interface Target {
  targetKind: DonationTargetKind;
  ngoId: string | null;
  recipientName: string;
  subAccountId: string;
  split: ReturnType<typeof computeDonationSplit>;
}

const readIntentByKey = (env: Env, key: string): Promise<IntentRow | null> =>
  env.DB!.prepare("SELECT * FROM donation_intents WHERE idempotency_key = ?").bind(key).first<IntentRow>();

/** The configured recipient of a donation request; throws the same refusals the route always had. */
async function resolveTarget(env: Env, targetKind: DonationTargetKind, requestedNgoId: string | null, amountCents: number): Promise<Target> {
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
    const ngo = await env.DB!.prepare(PUBLISHED_NGO).bind(requestedNgoId).first<{ id: string; name: string }>();
    if (!ngo) throw new HttpError(404, "not_found");
    const payment = await readPayment(env, ngo.id);
    if (payment?.payment_method === "external_link" || !payment?.sub_account_id) throw new HttpError(409, "ngo_payment_not_configured");
    ngoId = ngo.id;
    recipientName = ngo.name;
    splitConfig = splitOf(payment);
    subAccountId = payment.sub_account_id;
  }
  try {
    return { targetKind, ngoId, recipientName, subAccountId, split: computeDonationSplit(amountCents, splitConfig) };
  } catch {
    // The amount is already inside the Pix window, so the remaining refusal is the configured split.
    throw new HttpError(409, targetKind === "global" ? "global_donation_not_configured" : "ngo_payment_not_configured");
  }
}

/** The charge the provider answered, as the intent kept it while the donation row could not be written. */
const storedCharge = (intent: IntentRow): PixCharge => ({
  id: intent.provider_charge_id!,
  status: intent.provider_status ?? "PENDING",
  amountCents: intent.amount_cents,
  brCode: intent.br_code,
  brCodeBase64: intent.br_code_base64,
  receiptUrl: intent.receipt_url,
  platformFeeCents: intent.platform_fee_cents,
  devMode: intent.dev_mode === 1,
  expiresAt: intent.expires_at,
});

/**
 * Where an intent must still be for a writer to finish it: in flight with no charge yet (the request that called
 * the provider), or 'unknown' holding exactly this charge (a same-key retry finishing from the stored copy).
 * Anything else — created by someone else, or turned 'unknown' because it went stale — fences the writer out.
 */
const fence = (from: "pending_provider" | "unknown"): string =>
  from === "pending_provider" ? "state = 'pending_provider' AND provider_charge_id IS NULL" : "state = 'unknown' AND provider_charge_id = ?";
const fenceBinds = (from: "pending_provider" | "unknown", charge: PixCharge): string[] => (from === "unknown" ? [charge.id] : []);

/**
 * Writes the donation row for a charge the provider created and marks the intent created, in one transaction, and
 * only while the intent is still where `from` says (see `fence`). Never calls the provider. When D1 fails, or the
 * intent was fenced out by staleness, the charge is copied onto the intent ('unknown', `store_failed`) so a retry
 * with the same key can finish from that copy; if even that write fails the intent stays 'pending_provider' and
 * goes 'unknown' once stale. Answers true when this call created the donation, false when another one already had.
 */
async function finishIntent(env: Env, intent: IntentRow, charge: PixCharge, from: "pending_provider" | "unknown"): Promise<boolean> {
  const db = env.DB!;
  const now = new Date().toISOString();
  try {
    const [inserted] = await db.batch([
      // The insert runs only while the intent is still this writer's to finish; the update below uses the same fence.
      db
        .prepare(
          `INSERT INTO donations (id, target_kind, ngo_id, recipient_name, user_id, provider, provider_charge_id, sub_account_id,
             amount_cents, ngo_share_cents, vila_share_cents, platform_fee_cents, ngo_percent_bps, fixed_fee_cents, status,
             br_code, br_code_base64, receipt_url, expires_at, dev_mode)
           SELECT ?, ?, ?, ?, ?, 'abacatepay', ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?
            WHERE EXISTS (SELECT 1 FROM donation_intents WHERE id = ? AND ${fence(from)})`
        )
        .bind(
          intent.id,
          intent.target_kind,
          intent.ngo_id,
          intent.recipient_name,
          intent.user_id,
          charge.id,
          intent.sub_account_id,
          intent.amount_cents,
          intent.ngo_share_cents,
          intent.vila_share_cents,
          charge.platformFeeCents,
          intent.ngo_percent_bps,
          intent.fixed_fee_cents,
          charge.brCode,
          charge.brCodeBase64,
          charge.receiptUrl,
          charge.expiresAt,
          charge.devMode ? 1 : 0,
          intent.id,
          ...fenceBinds(from, charge)
        ),
      // The payment code now lives only in `donations`: the copied answer is cleared. `provider_charge_id` stays (it
      // ties the intent to its charge) and `dev_mode` keeps its value.
      db
        .prepare(
          `UPDATE donation_intents SET state = 'created', provider_charge_id = ?, provider_status = NULL, br_code = NULL,
             br_code_base64 = NULL, receipt_url = NULL, expires_at = NULL, platform_fee_cents = NULL, last_error = NULL, updated_at = ?
           WHERE id = ? AND ${fence(from)}`
        )
        .bind(charge.id, now, intent.id, ...fenceBinds(from, charge)),
    ]);
    if (inserted.meta.changes) return true;
  } catch (error) {
    if (error instanceof Error && /no such table/i.test(error.message)) throw error;
  }
  // Fenced out or failed. Another request may have finished the same intent first (the donation id is the intent id).
  const current = await db.prepare("SELECT state FROM donation_intents WHERE id = ?").bind(intent.id).first<{ state: IntentState }>().catch(() => null);
  if (current?.state === "created") return false;
  if (from === "pending_provider") {
    // Keep the provider's answer on the intent, whether it is still in flight (D1 failed) or went stale meanwhile.
    await db
      .prepare(
        `UPDATE donation_intents SET state = 'unknown', last_error = 'store_failed', provider_charge_id = ?, provider_status = ?,
           br_code = ?, br_code_base64 = ?, receipt_url = ?, expires_at = ?, platform_fee_cents = ?, dev_mode = ?, updated_at = ?
         WHERE id = ? AND state IN ('pending_provider', 'unknown') AND provider_charge_id IS NULL`
      )
      .bind(
        charge.id, charge.status, charge.brCode, charge.brCodeBase64, charge.receiptUrl, charge.expiresAt, charge.platformFeeCents,
        charge.devMode ? 1 : 0, now, intent.id
      )
      .run()
      // D1 itself is failing: the intent stays 'pending_provider' and turns 'unknown' once stale, never re-sent.
      .catch(() => undefined);
  }
  // D1 failed, or a stale mark fenced this writer out: either way the donation is not confirmed yet.
  throw new HttpError(503, "donation_not_confirmed");
}

/** Calls the provider, once, for the intent this request inserted, and records a failure on the intent. */
async function chargeIntent(env: Env, intent: IntentRow): Promise<PixCharge> {
  try {
    return await createPixCharge(env, {
      amountCents: intent.amount_cents,
      description: `Doacao Vila Noel do Bem - ${intent.recipient_name}`,
      // The intent id is the donation id and the provider's externalId.
      externalId: intent.id,
      subAccountId: intent.sub_account_id,
      ngoShareCents: intent.ngo_share_cents,
      metadata: { donationId: intent.id, targetKind: intent.target_kind },
    });
  } catch (error) {
    // A refusal for sure leaves nothing to pay ('failed'); anything else may have created a charge ('unknown').
    // Neither is ever sent to the provider again: the client starts over with a new key.
    const failed = error instanceof ChargeCreationError ? !error.ambiguous : error instanceof HttpError;
    const code = error instanceof HttpError ? error.code : "internal";
    await env.DB!.prepare("UPDATE donation_intents SET state = ?, last_error = ?, updated_at = ? WHERE id = ? AND state = 'pending_provider'")
      .bind(failed ? "failed" : "unknown", code, new Date().toISOString(), intent.id)
      .run()
      .catch(() => undefined);
    throw error;
  }
}

/** Applies the charge status, then any webhook event that arrived before the donation existed. */
async function afterCreate(env: Env, charge: PixCharge): Promise<void> {
  await applyCharge(env, charge, chargeStatus(charge.status));
  try {
    await drainPendingEvents(env, charge.id);
  } catch (error) {
    // The donation exists; the waiting events stay waiting and are drained by the next read or event. No data here.
    console.error("donation_drain_failed", error instanceof Error ? error.name : "unknown");
  }
}

const created = async (env: Env, id: string, status: 200 | 201): Promise<Response> =>
  json({ donation: donationView((await readDonation(env, id))!) }, { status, headers: NO_STORE });

/**
 * The answer to a request whose key already has an intent. At most one provider call ever happens per key, so this
 * never calls the provider: it returns the donation, finishes it from the stored copy of the provider's answer, or
 * says why the client must start over with a new key.
 */
async function replay(env: Env, existing: IntentRow, requestHash: string): Promise<Response> {
  if (existing.request_hash !== requestHash) throw new HttpError(409, "idempotency_key_reused");
  if (existing.state === "created") return created(env, existing.id, 200);
  if (existing.state === "unknown" && existing.provider_charge_id) {
    // The provider answered but the donation row was not written: finish it from the stored answer.
    const charge = storedCharge(existing);
    const mine = await finishIntent(env, existing, charge, "unknown");
    if (mine) await afterCreate(env, charge);
    return created(env, existing.id, mine ? 201 : 200);
  }
  if (existing.state === "failed") throw new HttpError(409, "donation_intent_failed");
  if (existing.state === "unknown") throw new HttpError(409, "donation_intent_unknown");
  // 'pending_provider': in flight, or its worker is gone. A stale one becomes 'unknown' for an operator.
  const stale = new Date(Date.now() - STALE_IN_FLIGHT_MS).toISOString();
  if (existing.updated_at >= stale) throw new HttpError(409, "donation_in_progress");
  await env.DB!.prepare(
    "UPDATE donation_intents SET state = 'unknown', last_error = 'stale_in_flight', updated_at = ? WHERE id = ? AND state = 'pending_provider' AND updated_at < ?"
  )
    .bind(new Date().toISOString(), existing.id, stale)
    .run();
  const now = await env.DB!.prepare("SELECT * FROM donation_intents WHERE id = ?").bind(existing.id).first<IntentRow>();
  // The late worker may have written the provider's answer meanwhile: the next retry finishes from it.
  if (now && now.state !== "pending_provider" && !(now.state === "unknown" && !now.provider_charge_id)) return replay(env, now, requestHash);
  throw new HttpError(409, "donation_intent_unknown");
}

export async function createDonation(request: Request, env: Env): Promise<Response> {
  requireDonations(env);
  assertAllowedOrigin(request, env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  const db = env.DB;
  const body = await readJson(request, 4_000);
  const key = typeof body.idempotencyKey === "string" ? body.idempotencyKey.toLowerCase() : "";
  if (!UUID.test(key)) throw new HttpError(400, "invalid_idempotency_key");
  const targetKind = body.targetKind;
  if (targetKind !== "global" && targetKind !== "ngo")
    throw new HttpError(400, "invalid", { targetKind: "Escolha a doação global ou uma ONG da Vila." });
  const amountCents = body.amountCents;
  if (!Number.isSafeInteger(amountCents) || (amountCents as number) < MIN_DONATION_CENTS || (amountCents as number) > MAX_DONATION_CENTS)
    throw new HttpError(400, "invalid_donation_amount");
  let requestedNgoId: string | null = null;
  if (targetKind === "ngo") {
    if (typeof body.ngoId !== "string" || !UUID.test(body.ngoId)) throw new HttpError(400, "invalid", { ngoId: "Escolha uma ONG publicada na Vila." });
    requestedNgoId = body.ngoId.toLowerCase();
  }

  // Resolve the donor before anything is written: a session read that fails must not leave an intent behind.
  const accountsEnabled = env.ACCOUNTS_ENABLED === "true";
  const user = accountsEnabled ? await currentUser(request, env) : null;
  if (user?.blocked) throw new HttpError(403, "session_blocked");
  // The same key always means the same request: target, amount and donor.
  const requestHash = await sha256Hex(JSON.stringify([targetKind, requestedNgoId, amountCents, user?.id ?? null]));

  // A retry of a known key never calls the provider, so it does not spend the abuse budget; a new key does, before
  // anything is written.
  const existing = await readIntentByKey(env, key);
  if (!user) {
    // An old anonymous intent may hold the only local copy of the provider's answer. Replay never issues a charge.
    if (body.accountId === undefined && existing && existing.user_id === null && existing.request_hash === requestHash) return replay(env, existing, requestHash);
    if (!accountsEnabled) throw new HttpError(404, "accounts_disabled");
    throw new HttpError(401, "not_signed_in");
  }
  if (body.accountId !== undefined) assertAccount(body, user);
  if (existing) return replay(env, existing, requestHash);
  if (env.DONATION_LIMITER && !(await env.DONATION_LIMITER.limit({ key: `account:${user.id}` })).success)
    throw new HttpError(429, "too_many_requests");

  const target = await resolveTarget(env, targetKind, requestedNgoId, amountCents as number);
  // A confirmation applies to the public terms the donor just saw. Older clients omit this precondition.
  if (body.expectedTerms !== undefined) {
    const expected = body.expectedTerms as Partial<SplitConfig & { recipientName: string }> | null;
    if (expected?.recipientName !== target.recipientName || expected.ngoPercentBps !== target.split.ngoPercentBps
      || expected.fixedFeeCents !== target.split.fixedFeeCents) throw new HttpError(409, "donation_terms_changed");
  }
  // Configuration the provider call needs is checked before the intent exists: a missing key writes nothing.
  assertChargeConfig(env, target.subAccountId);
  // The session can expire, sign out, or be blocked while the destination is resolved. Claim the new
  // intent only if that same session is still valid when the database accepts the write.
  const sessionHash = await sha256Hex(readSessionToken(request)!);
  const intent = await db
    .prepare(
      `INSERT INTO donation_intents (id, idempotency_key, request_hash, target_kind, ngo_id, recipient_name, user_id, sub_account_id,
         amount_cents, ngo_share_cents, vila_share_cents, ngo_percent_bps, fixed_fee_cents)
       SELECT ?, ?, ?, ?, ?, ?, s.user_id, ?, ?, ?, ?, ?, ? FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.user_id = ? AND s.token_hash = ? AND s.expires_at > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AND u.blocked = 0
       ON CONFLICT(idempotency_key) DO NOTHING
       RETURNING *`
    )
    .bind(
      newId(), key, requestHash, targetKind, target.ngoId, target.recipientName, target.subAccountId,
      target.split.amountCents, target.split.ngoShareCents, target.split.vilaShareCents, target.split.ngoPercentBps, target.split.fixedFeeCents, user.id, sessionHash
    )
    .first<IntentRow>();
  if (!intent) {
    // A concurrent request with the same key inserted first: answer as a retry of it.
    const winner = await readIntentByKey(env, key);
    if (winner) return replay(env, winner, requestHash);
    await requireUser(request, env);
    throw new HttpError(409, "donation_in_progress");
  }
  const charge = await chargeIntent(env, intent);
  const mine = await finishIntent(env, intent, charge, "pending_provider");
  if (mine) await afterCreate(env, charge);
  return created(env, intent.id, mine ? 201 : 200);
}

export async function getDonation(env: Env, id: string, url: URL): Promise<Response> {
  requireDonations(env);
  if (!env.DB) throw new HttpError(503, "db_unavailable");
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  let row = await readDonation(env, id);
  if (!row) throw new HttpError(404, "not_found");
  // A webhook that arrived before the donation row existed is applied now, before anything is answered.
  if (row.provider === "abacatepay" && row.provider_charge_id && (await drainPendingEvents(env, row.provider_charge_id))) row = (await readDonation(env, id))!;
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
  const rehearsal = rehearsesAccountActions(env);
  if (rehearsal && env.ACCOUNTS_ENABLED !== "true") throw new HttpError(404, "accounts_disabled");
  const user = rehearsal ? await requireUser(request, env) : await currentUser(request, env);
  if (rehearsal && user) assertAccount(body, user);
  const ngo = await env.DB.prepare(PUBLISHED_NGO).bind(body.ngoId).first<{ id: string; name: string }>();
  if (!ngo) throw new HttpError(404, "not_found");
  const payment = await readPayment(env, ngo.id);
  if (payment?.payment_method !== "external_link" || payment.link_validated !== 1 || !payment.donation_url)
    throw new HttpError(409, "ngo_payment_not_configured");
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

  const db = env.DB;
  if (!charge || !next) {
    // Not about a donation state the Vila tracks: recorded as processed, nothing to apply.
    // An id already waiting (same id, payload that now parses as untracked) stays where it is: never in both tables.
    const ignored = await db
      .prepare(
        `INSERT OR IGNORE INTO abacatepay_webhook_events (id, event, charge_id)
         SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM abacatepay_pending_events WHERE id = ?)`
      )
      .bind(eventId, eventName, chargeId, eventId)
      .run();
    return json(ignored.meta.changes ? { ok: true, applied: false } : { ok: true, duplicate: true }, { headers: NO_STORE });
  }
  // Earlier events for this charge that waited for its donation go first, in the order they arrived.
  await drainPendingEvents(env, charge.id);

  // One batch, which D1 runs as a transaction, one at a time. An event id is in at most one of two places: recorded
  // as processed (`abacatepay_webhook_events`) or waiting (`abacatepay_pending_events`); a delivery of an id found in
  // either changes nothing, so a replay cannot undo a later dispute or refund. Otherwise, with the donation present,
  // the guarded update runs first, and the event is recorded as processed only when the donation ends in the status
  // it asks for (applied now, or already there). When the guard refuses the change, the event is NOT recorded: it
  // waits for an operator as 'transition_refused' and is never applied by itself. With no donation for the charge yet
  // (an early event), it waits as 'no_donation' and is applied when the donation appears. No clock takes part.
  const exists = "EXISTS (SELECT 1 FROM donations WHERE provider_charge_id = ?)";
  const settled = "EXISTS (SELECT 1 FROM donations WHERE provider_charge_id = ? AND status = ?)";
  const recorded = "EXISTS (SELECT 1 FROM abacatepay_webhook_events WHERE id = ?)";
  const waiting = "EXISTS (SELECT 1 FROM abacatepay_pending_events WHERE id = ?)";
  const hold = (reason: "no_donation" | "transition_refused", where: string, binds: unknown[]) =>
    db
      .prepare(
        `INSERT OR IGNORE INTO abacatepay_pending_events (id, event, charge_id, next_status, provider_status, receipt_url, platform_fee_cents, dev_mode, hold_reason)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, '${reason}' WHERE ${where} AND NOT ${recorded}`
      )
      .bind(eventId, eventName, charge.id, next, providerStatus, charge.receiptUrl, charge.platformFeeCents, charge.devMode ? 1 : 0, ...binds, eventId);
  const results = await db.batch([
    chargeUpdate(env, charge, next, { from: eventFrom(eventName, next), sql: `NOT ${recorded} AND NOT ${waiting}`, binds: [eventId, eventId] }),
    db
      .prepare(`INSERT OR IGNORE INTO abacatepay_webhook_events (id, event, charge_id) SELECT ?, ?, ? WHERE ${settled} AND NOT ${waiting}`)
      .bind(eventId, eventName, charge.id, charge.id, next, eventId),
    hold("no_donation", `NOT ${exists}`, [charge.id]),
    hold("transition_refused", `${exists} AND NOT ${settled}`, [charge.id, charge.id, next]),
  ]);
  if (results[1].meta.changes) return json({ ok: true, applied: Boolean(results[0].meta.changes) }, { headers: NO_STORE });
  if (results[2].meta.changes) return json({ ok: true, applied: false, unmatched: true }, { headers: NO_STORE });
  if (results[3].meta.changes) return json({ ok: true, applied: false, refused: true }, { headers: NO_STORE });
  return json({ ok: true, duplicate: true }, { headers: NO_STORE });
}

/**
 * Applies, in arrival order, the webhook events that reached the Vila before the donation for `chargeId` existed
 * (IMPL-0028). Each one goes through the same guarded update as a live delivery, in one transaction: when the
 * donation ends in the status it asks for, it is recorded as processed and its waiting row is closed; when the guard
 * refuses it, it is NOT recorded and stays waiting as 'transition_refused', for an operator, never retried. The
 * update and both outcomes require the row to be still waiting as 'no_donation', so two drains at once, or a drain
 * and a redelivery, apply it once. Nothing happens while the donation does not exist. Answers how many events it
 * looked at.
 */
async function drainPendingEvents(env: Env, chargeId: string): Promise<number> {
  const db = env.DB!;
  const { results } = await db
    .prepare(
      `SELECT id, event, next_status, provider_status, receipt_url, platform_fee_cents, dev_mode FROM abacatepay_pending_events
        WHERE charge_id = ? AND resolved_at IS NULL AND hold_reason = 'no_donation'
          AND EXISTS (SELECT 1 FROM donations WHERE provider_charge_id = ?)
        ORDER BY received_at, rowid`
    )
    .bind(chargeId, chargeId)
    .all<{ id: string; event: string; next_status: Exclude<DonationStatus, "pending">; provider_status: string; receipt_url: string | null; platform_fee_cents: number | null; dev_mode: number }>();
  for (const waiting of results) {
    const charge: PixCharge = {
      id: chargeId,
      status: waiting.provider_status,
      amountCents: null,
      brCode: null,
      brCodeBase64: null,
      receiptUrl: waiting.receipt_url,
      platformFeeCents: waiting.platform_fee_cents,
      devMode: waiting.dev_mode === 1,
      expiresAt: null,
    };
    const open = "EXISTS (SELECT 1 FROM abacatepay_pending_events WHERE id = ? AND resolved_at IS NULL AND hold_reason = 'no_donation')";
    const recorded = "EXISTS (SELECT 1 FROM abacatepay_webhook_events WHERE id = ?)";
    await db.batch([
      chargeUpdate(env, charge, waiting.next_status, {
        from: eventFrom(waiting.event, waiting.next_status),
        sql: `NOT ${recorded} AND ${open}`,
        binds: [waiting.id, waiting.id],
      }),
      db
        .prepare(
          `INSERT OR IGNORE INTO abacatepay_webhook_events (id, event, charge_id)
           SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM donations WHERE provider_charge_id = ? AND status = ?) AND ${open}`
        )
        .bind(waiting.id, waiting.event, chargeId, chargeId, waiting.next_status, waiting.id),
      db
        .prepare(`UPDATE abacatepay_pending_events SET resolved_at = ? WHERE id = ? AND resolved_at IS NULL AND hold_reason = 'no_donation' AND ${recorded}`)
        .bind(new Date().toISOString(), waiting.id, waiting.id),
      db
        .prepare(
          `UPDATE abacatepay_pending_events SET hold_reason = 'transition_refused'
            WHERE id = ? AND resolved_at IS NULL AND hold_reason = 'no_donation' AND NOT ${recorded}`
        )
        .bind(waiting.id, waiting.id),
    ]);
  }
  return results.length;
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
  return json(
    { settings: settingsView(settings, true), ngos, recentDonations: recentDonations.map(donationView), recentRedirects, reconciliation: await reconciliation(env) },
    { headers: NO_STORE }
  );
}

/**
 * What an operator must look at (IMPL-0028): intents whose outcome is not known (state 'unknown', or still
 * 'pending_provider' after the worker that owned them must have stopped) and signed webhook events still waiting,
 * for a donation or for an operator after the status guard refused them, each with its age in seconds. Ids,
 * amounts and the recipient's public name only: never a donor, an e-mail, a payment code or a receipt.
 */
async function reconciliation(env: Env) {
  const db = env.DB!;
  const now = Date.now();
  const age = (iso: string) => Math.max(0, Math.floor((now - Date.parse(iso)) / 1000));
  const stale = new Date(now - STALE_IN_FLIGHT_MS).toISOString();
  const { results: intents } = await db
    .prepare(
      `SELECT id, state, target_kind, ngo_id, recipient_name, amount_cents, last_error, provider_charge_id, created_at, updated_at
         FROM donation_intents WHERE state = 'unknown' OR (state = 'pending_provider' AND updated_at < ?)
        ORDER BY updated_at LIMIT 100`
    )
    .bind(stale)
    .all<Pick<IntentRow, "id" | "state" | "target_kind" | "ngo_id" | "recipient_name" | "amount_cents" | "last_error" | "provider_charge_id" | "created_at" | "updated_at">>();
  const { results: events } = await db
    .prepare("SELECT id, event, charge_id, next_status, hold_reason, received_at FROM abacatepay_pending_events WHERE resolved_at IS NULL ORDER BY received_at LIMIT 100")
    .all<{ id: string; event: string; charge_id: string; next_status: string; hold_reason: string; received_at: string }>();
  return {
    staleAfterSeconds: STALE_IN_FLIGHT_MS / 1000,
    intents: intents.map((row) => ({
      id: row.id,
      state: row.state,
      targetKind: row.target_kind,
      ngoId: row.ngo_id,
      recipientName: row.recipient_name,
      amountCents: row.amount_cents,
      lastError: row.last_error,
      providerChargeId: row.provider_charge_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      ageSeconds: age(row.created_at),
    })),
    unmatchedEvents: events.map((row) => ({
      id: row.id,
      event: row.event,
      chargeId: row.charge_id,
      nextStatus: row.next_status,
      // 'no_donation': waits for its donation; 'transition_refused': the status guard refused it (operator only).
      holdReason: row.hold_reason,
      receivedAt: row.received_at,
      ageSeconds: age(row.received_at),
    })),
  };
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
    .prepare("SELECT n.id, n.name, n.cnpj, n.revision, w.ngo_id AS withdrawn FROM ngos n LEFT JOIN ngo_withdrawals w ON w.ngo_id = n.id WHERE n.id = ?")
    .bind(id)
    .first<{ id: string; name: string; cnpj: string; revision: number; withdrawn: string | null }>();
  if (!ngo) throw new HttpError(404, "not_found");
  if (ngo.withdrawn) throw new HttpError(409, "application_withdrawn");
  if (body.revision !== undefined && body.revision !== ngo.revision) throw new HttpError(409, "stale_revision");
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
    if (body.revision === undefined) throw new HttpError(400, "revision_required");
    // Confirming the link is a human check; the box is required, not assumed.
    if (body.linkValidated !== true)
      throw new HttpError(400, "invalid", { linkValidated: "Abra o link e confirme que é uma página de doação da própria organização." });
    donationUrl = link.url;
    linkValidated = 1;
  } else {
    const given = typeof body.subAccountId === "string" ? body.subAccountId.trim() : "";
    if (given && body.revision === undefined) throw new HttpError(400, "revision_required");
    const givenError = given ? subAccountIdError(env, given) : null;
    if (givenError) throw new HttpError(400, "invalid", { subAccountId: givenError });
    subAccountId = given || (await createOrGetSubAccount(env, { name: ngo.name, taxId: ngo.cnpj, externalId: ngo.id })).id;
  }
  const now = new Date().toISOString();
  // Provisioning can finish after a resubmission. Save and audit only the identity this request read.
  const sameBeneficiary = `EXISTS (SELECT 1 FROM ngos n WHERE n.id = ? AND n.revision = ? AND n.cnpj = ?
    AND NOT EXISTS (SELECT 1 FROM ngo_withdrawals w WHERE w.ngo_id = n.id))`;
  const [saved] = await db.batch([
    db
      .prepare(
        `INSERT INTO ngo_payment_configs (ngo_id, payment_method, donation_url, sub_account_id, ngo_percent_bps, fixed_fee_cents, link_validated, updated_by, updated_at)
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${sameBeneficiary}
         ON CONFLICT(ngo_id) DO UPDATE SET payment_method = excluded.payment_method, donation_url = excluded.donation_url,
           sub_account_id = excluded.sub_account_id, ngo_percent_bps = excluded.ngo_percent_bps, fixed_fee_cents = excluded.fixed_fee_cents,
           link_validated = excluded.link_validated, updated_by = excluded.updated_by, updated_at = excluded.updated_at`
      )
      .bind(id, method, donationUrl, subAccountId, split.ngoPercentBps, split.fixedFeeCents, linkValidated, admin.id, now, id, ngo.revision, ngo.cnpj),
    db
      .prepare(`INSERT INTO audit_events (id, actor, action, subject, detail) SELECT ?, ?, ?, ?, ? WHERE ${sameBeneficiary}`)
      .bind(
        newId(),
        admin.id,
        "ngo.payment_config",
        `ngo:${id}`,
        JSON.stringify({ method, linkValidated: linkValidated === 1, ngoPercentBps: split.ngoPercentBps, fixedFeeCents: split.fixedFeeCents }),
        id, ngo.revision, ngo.cnpj
      ),
  ]);
  if (!saved.meta.changes) throw new HttpError(409, "stale_revision");
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

/* ----------------------------------------------- operator reconciliation */

const EVENT_ID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * Closes an intent whose outcome nobody will learn by themselves (IMPL-0028): 'unknown', or 'pending_provider' past
 * the stale window. It never calls the provider. The table has no 'abandoned' state, so both resolutions end
 * 'failed' with `last_error = 'resolved_by_admin'`, and the audit row says which one the administrator chose. Any
 * copy of the provider's answer is cleared (it existed only to finish the donation); `provider_charge_id` stays.
 * A same-key retry then answers `donation_intent_failed`. The audit row is written first in the same transaction,
 * under the same condition as the update, so only the request that resolves the intent writes one.
 */
export async function adminResolveIntent(request: Request, env: Env, id: string): Promise<Response> {
  requireDonations(env);
  const admin = await requireAdmin(request, env);
  if (!UUID.test(id)) throw new HttpError(404, "not_found");
  const body = await readJson(request, 2_000);
  assertAccount(body, admin);
  const resolution = body.resolution;
  if (resolution !== "failed" && resolution !== "abandoned")
    throw new HttpError(400, "invalid", { resolution: "Escolha se o pedido falhou ou foi abandonado." });
  const db = env.DB!;
  const intentId = id.toLowerCase();
  const found = await db.prepare("SELECT provider_charge_id FROM donation_intents WHERE id = ?").bind(intentId).first<{ provider_charge_id: string | null }>();
  if (!found) throw new HttpError(404, "not_found");
  // An intent that holds the provider's charge (the provider answered, D1 failed) is never closed here: the donor
  // may have paid it, and a same-key retry finishes the donation from the copy. Closing it would lose that payment.
  if (found.provider_charge_id) throw new HttpError(409, "intent_has_charge");
  const now = new Date().toISOString();
  const stale = new Date(Date.now() - STALE_IN_FLIGHT_MS).toISOString();
  const open = "id = ? AND provider_charge_id IS NULL AND (state = 'unknown' OR (state = 'pending_provider' AND updated_at < ?))";
  const [, resolved] = await db.batch([
    db
      .prepare(
        `INSERT INTO audit_events (id, actor, action, subject, detail)
         SELECT ?, ?, 'donation.intent_resolve', ?, json_object('intentId', id, 'resolution', ?, 'from', state)
           FROM donation_intents WHERE ${open} AND ${STILL_ADMIN}`
      )
      .bind(newId(), admin.id, `donation_intent:${intentId}`, resolution, intentId, stale, admin.id),
    db
      .prepare(
        `UPDATE donation_intents SET state = 'failed', last_error = 'resolved_by_admin', provider_status = NULL, br_code = NULL,
           br_code_base64 = NULL, receipt_url = NULL, expires_at = NULL, platform_fee_cents = NULL, updated_at = ?
         WHERE ${open} AND ${STILL_ADMIN}`
      )
      .bind(now, intentId, stale, admin.id),
  ]);
  if (!resolved.meta.changes) {
    // The actor lost the role meanwhile, or the intent is not (or no longer) one an operator may close.
    await assertStillAdmin(db, admin.id);
    throw new HttpError(409, "intent_not_resolvable");
  }
  return json({ intent: { id: intentId, state: "failed", lastError: "resolved_by_admin", resolution } }, { headers: NO_STORE });
}

/**
 * Closes a waiting webhook event without applying it (IMPL-0028): a refused transition the operator has looked at,
 * or an event about a charge that will never have a donation here. It is not recorded as processed: a redelivery
 * of the same id still changes nothing, because the id stays in `abacatepay_pending_events` (with `resolved_at`).
 * Audited like the intent resolution, with the event id and why it was waiting.
 */
export async function adminDismissEvent(request: Request, env: Env, id: string): Promise<Response> {
  requireDonations(env);
  const admin = await requireAdmin(request, env);
  if (!EVENT_ID.test(id)) throw new HttpError(404, "not_found");
  const body = await readJson(request, 2_000);
  assertAccount(body, admin);
  const db = env.DB!;
  if (!(await db.prepare("SELECT 1 AS x FROM abacatepay_pending_events WHERE id = ?").bind(id).first())) throw new HttpError(404, "not_found");
  // An event waiting for a donation that a same-key retry can still create (an intent holding that charge) stays:
  // dismissing it would leave the paid status to arrive only by a provider refresh.
  const replayable = await db
    .prepare(
      `SELECT 1 AS x FROM abacatepay_pending_events e JOIN donation_intents i ON i.provider_charge_id = e.charge_id
        WHERE e.id = ? AND e.hold_reason = 'no_donation' AND i.state = 'unknown'`
    )
    .bind(id)
    .first();
  if (replayable) throw new HttpError(409, "event_has_replayable_intent");
  const open = `id = ? AND resolved_at IS NULL AND NOT (hold_reason = 'no_donation' AND EXISTS (SELECT 1 FROM donation_intents i
    WHERE i.provider_charge_id = abacatepay_pending_events.charge_id AND i.state = 'unknown')) AND ${STILL_ADMIN}`;
  const [, dismissed] = await db.batch([
    db
      .prepare(
        `INSERT INTO audit_events (id, actor, action, subject, detail)
         SELECT ?, ?, 'donation.event_dismiss', ?, json_object('eventId', id, 'holdReason', hold_reason) FROM abacatepay_pending_events WHERE ${open}`
      )
      .bind(newId(), admin.id, `abacatepay_event:${id}`, id, admin.id),
    db.prepare(`UPDATE abacatepay_pending_events SET resolved_at = ? WHERE ${open}`).bind(new Date().toISOString(), id, admin.id),
  ]);
  if (!dismissed.meta.changes) {
    await assertStillAdmin(db, admin.id);
    throw new HttpError(409, "event_not_pending");
  }
  return json({ event: { id, dismissed: true } }, { headers: NO_STORE });
}
