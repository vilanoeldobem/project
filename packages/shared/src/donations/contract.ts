/**
 * Donation rules shared by the game, the API and the backoffice (IMPL-0021). PROPOSTA until the partner
 * contract and the payment rules are decided (PEN-004, PEN-006, PEN-026): the Título tiers and the split
 * defaults below are the proposal, not a settled decision.
 *
 * The split follows AbacatePay's rule: the sub-account part must fit inside `amount - platformFee`, so the
 * Vila keeps at least the base Pix fee. A donation never grants XP (DEC-042); it may credit the Título once.
 */

/** R$ 2,00: minimum Pix the Vila accepts (above AbacatePay's own 100-cent minimum). */
export const MIN_DONATION_CENTS = 200;
/** R$ 50.000,00: single-Pix ceiling. */
export const MAX_DONATION_CENTS = 5_000_000;
/** 95.00% to the NGO, in hundredths of a percent (100 = 1%, 10000 = 100%). */
export const DEFAULT_NGO_PERCENT_BPS = 9500;
/** R$ 0,80: AbacatePay's base Pix fee, retained by the Vila before the NGO share. */
export const DEFAULT_FIXED_FEE_CENTS = 80;

export type DonationTargetKind = "global" | "ngo";
export type NgoPaymentMethod = "abacatepay" | "external_link";
export type DonationStatus = "pending" | "paid" | "refunded" | "under_dispute" | "expired" | "cancelled";

export interface SplitConfig {
  /** Share of the donation that belongs to the NGO before the fixed fee, in hundredths of a percent. */
  ngoPercentBps: number;
  /** Fixed amount retained by the Vila (covers the payment provider's Pix fee), in cents. */
  fixedFeeCents: number;
}

export interface DonationSplitBreakdown extends SplitConfig {
  amountCents: number;
  /** What the NGO's sub-account receives. */
  ngoShareCents: number;
  /** What stays with the Vila (fixed fee plus the remainder of the percentage). */
  vilaShareCents: number;
}

export interface TitleProgress {
  /** Sum of the paid, title-credited donations of the account, in cents. */
  eligibleCents: number;
  confirmedCount: number;
  tier: 0 | 1 | 2 | 3 | 4;
  tierLabel: string;
  nextTierCents: number | null;
}

/** Título stages (P15, DEC-041). PROPOSTA: the thresholds and labels still need the owner's approval (PEN-026). */
export const TITLE_TIERS = [
  { tier: 0, minCents: 0, label: "Sem título ativo", nextTierCents: 200 },
  { tier: 1, minCents: 200, label: "Faixa I — Símbolo de Natal", nextTierCents: 1000 },
  { tier: 2, minCents: 1000, label: "Faixa II — Moldura Dourada", nextTierCents: 5000 },
  { tier: 3, minCents: 5000, label: "Faixa III — Guirlanda de Estrelas", nextTierCents: 15000 },
  { tier: 4, minCents: 15000, label: "Faixa IV — Brasão Iluminado", nextTierCents: null },
] as const;

/** R$ 12.345,67 — the same text in the game, the dashboard and the API's UI copy. */
export function formatBrl(cents: number): string {
  const abs = Math.abs(Math.trunc(cents));
  const reais = Math.floor(abs / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${cents < 0 ? "-" : ""}R$ ${reais},${String(abs % 100).padStart(2, "0")}`;
}

/** pt-BR field messages; empty when the configuration is usable. */
export function validateSplitConfig(config: SplitConfig): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isSafeInteger(config.ngoPercentBps) || config.ngoPercentBps < 100 || config.ngoPercentBps > 10000)
    errors.ngoPercentBps = "A porcentagem destinada à ONG deve ficar entre 1% e 100%.";
  if (!Number.isSafeInteger(config.fixedFeeCents) || config.fixedFeeCents < 80 || config.fixedFeeCents > 190)
    errors.fixedFeeCents = "A taxa fixa deve ficar entre R$ 0,80 e R$ 1,90.";
  if (Object.keys(errors).length === 0) {
    const gross = Math.floor((MIN_DONATION_CENTS * config.ngoPercentBps) / 10000);
    if (gross - config.fixedFeeCents < 1)
      errors.split = "Na doação mínima de R$ 2,00, a parcela da ONG precisa ser de pelo menos R$ 0,01 e a retenção mínima de R$ 0,80.";
  }
  return errors;
}

/**
 * How one Pix donation is divided. `ngoPercentBps` applies to the whole amount, then the fixed fee is taken
 * from the NGO's part; anything left (including the fee) stays with the Vila. Integer cents only: no rounding
 * drift between the QR Code, the D1 row and the screens.
 */
export function computeDonationSplit(amountCents: number, config: SplitConfig): DonationSplitBreakdown {
  if (!Number.isSafeInteger(amountCents) || amountCents < MIN_DONATION_CENTS || amountCents > MAX_DONATION_CENTS)
    throw new RangeError(`amountCents must be an integer between ${MIN_DONATION_CENTS} and ${MAX_DONATION_CENTS}`);
  const invalid = validateSplitConfig(config);
  if (Object.keys(invalid).length) throw new RangeError(invalid.split ?? "invalid split config");
  const ngoShareCents = Math.floor((amountCents * config.ngoPercentBps) / 10000) - config.fixedFeeCents;
  const vilaShareCents = amountCents - ngoShareCents;
  // The invariant the provider enforces: at least 1 cent to the sub-account and the platform fee kept here.
  if (ngoShareCents < 1 || vilaShareCents < 80) throw new RangeError("split leaves less than the minimum");
  return { amountCents, ngoPercentBps: config.ngoPercentBps, fixedFeeCents: config.fixedFeeCents, ngoShareCents, vilaShareCents };
}

const IPV4 = /^\d{1,3}(?:\.\d{1,3}){3}$/;
/** Hosts no public donation page may use: loopback, private suffixes, single labels and IP literals. */
function forbiddenHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  if (host.startsWith("[") || host.includes(":")) return true; // IPv6 literal
  if (IPV4.test(host)) return true;
  if (!host.includes(".")) return true; // localhost, intranet names
  return ["localhost", "local", "internal", "home.arpa", "lan"].some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

/**
 * A payment link an NGO owns, checked before the Vila sends anyone there: public HTTPS only, no credentials in
 * the URL, no script/data scheme and no private or literal host. Returns the URL as typed (trimmed), or the
 * pt-BR error. Parsed by hand: `packages/shared` has no DOM lib, and the rules are stricter than `new URL`.
 */
export function validateExternalDonationUrl(raw: unknown): { url: string | null; error?: string } {
  const error = "Informe um link HTTPS público válido da organização (ex.: https://ong.org.br/doar).";
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text || text.length > 500) return { url: null, error };
  // Whitespace, control characters and backslashes are read differently by browsers and servers; no authority
  // may carry credentials.
  if (/[\s\\\u0000-\u001f\u007f]/.test(text)) return { url: null, error };
  const match = /^https:\/\/([^/?#]+)([/?#][^\s]*)?$/i.exec(text);
  if (!match) return { url: null, error };
  const authority = match[1];
  if (authority.includes("@") || authority.includes("%")) return { url: null, error };
  if (authority.startsWith("[")) return { url: null, error }; // IPv6 literal
  const colon = authority.lastIndexOf(":");
  if (colon >= 0 && !/^\d{1,5}$/.test(authority.slice(colon + 1))) return { url: null, error };
  const hostname = colon >= 0 ? authority.slice(0, colon) : authority;
  if (!hostname || forbiddenHost(hostname)) return { url: null, error };
  return { url: text };
}

/** The Título stage of an account, from the paid donations already credited once. Never touches XP (DEC-042). */
export function computeTitleProgress(eligibleCents: number, confirmedCount: number): TitleProgress {
  const cents = Math.max(0, Math.trunc(Number.isFinite(eligibleCents) ? eligibleCents : 0));
  const count = Math.max(0, Math.trunc(Number.isFinite(confirmedCount) ? confirmedCount : 0));
  for (let i = TITLE_TIERS.length - 1; i >= 0; i--) {
    const tier = TITLE_TIERS[i];
    if (cents >= tier.minCents)
      return {
        eligibleCents: cents,
        confirmedCount: count,
        tier: tier.tier,
        tierLabel: tier.label,
        nextTierCents: tier.nextTierCents,
      };
  }
  return { eligibleCents: cents, confirmedCount: count, tier: 0, tierLabel: TITLE_TIERS[0].label, nextTierCents: TITLE_TIERS[0].nextTierCents };
}
