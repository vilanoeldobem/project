import { describe, expect, it } from "vitest";

import {
  computeDonationSplit,
  computeTitleProgress,
  DEFAULT_FIXED_FEE_CENTS,
  DEFAULT_NGO_PERCENT_BPS,
  formatBrl,
  MAX_DONATION_CENTS,
  MIN_DONATION_CENTS,
  parseBrlToCents,
  parseDecimal,
  validateExternalDonationUrl,
  validateSplitConfig,
} from "./contract";

const SPLIT = { ngoPercentBps: DEFAULT_NGO_PERCENT_BPS, fixedFeeCents: DEFAULT_FIXED_FEE_CENTS };

describe("donation split (IMPL-0022, PROPOSTA)", () => {
  it("splits the R$ 2,00 minimum exactly as the provider needs", () => {
    expect(computeDonationSplit(200, SPLIT)).toEqual({
      amountCents: 200,
      ngoPercentBps: 9500,
      fixedFeeCents: 80,
      ngoShareCents: 110,
      vilaShareCents: 90,
    });
  });

  it("keeps integer cents that always add up to the donation", () => {
    for (const amount of [200, 201, 333, 999, 5000, 12345, MAX_DONATION_CENTS])
      for (const bps of [100, 5000, 9500, 9900])
        for (const fee of [80, 120, 190]) {
          if (Object.keys(validateSplitConfig({ ngoPercentBps: bps, fixedFeeCents: fee })).length) continue;
          const split = computeDonationSplit(amount, { ngoPercentBps: bps, fixedFeeCents: fee });
          expect(split.ngoShareCents + split.vilaShareCents).toBe(amount);
          expect(split.ngoShareCents).toBeGreaterThanOrEqual(1);
          expect(split.vilaShareCents).toBeGreaterThanOrEqual(80);
        }
  });

  it("refuses amounts outside the Pix window", () => {
    for (const amount of [MIN_DONATION_CENTS - 1, 0, -200, 199.5, MAX_DONATION_CENTS + 1, Number.NaN])
      expect(() => computeDonationSplit(amount, SPLIT)).toThrow(RangeError);
  });

  it("refuses a configuration the provider would reject", () => {
    expect(validateSplitConfig(SPLIT)).toEqual({});
    expect(validateSplitConfig({ ngoPercentBps: 99, fixedFeeCents: 80 })).toHaveProperty("ngoPercentBps");
    expect(validateSplitConfig({ ngoPercentBps: 10001, fixedFeeCents: 80 })).toHaveProperty("ngoPercentBps");
    expect(validateSplitConfig({ ngoPercentBps: 9500, fixedFeeCents: 79 })).toHaveProperty("fixedFeeCents");
    expect(validateSplitConfig({ ngoPercentBps: 9500, fixedFeeCents: 191 })).toHaveProperty("fixedFeeCents");
    const impossible = validateSplitConfig({ ngoPercentBps: 100, fixedFeeCents: 80 });
    expect(impossible.split).toBe("Na doação mínima de R$ 2,00, a parcela da ONG precisa ser de pelo menos R$ 0,01 e a retenção mínima de R$ 0,80.");
    expect(() => computeDonationSplit(200, { ngoPercentBps: 100, fixedFeeCents: 80 })).toThrow(RangeError);
  });
});

describe("external donation link", () => {
  it("accepts a public HTTPS page of the organisation", () => {
    expect(validateExternalDonationUrl(" https://ong.org.br/doar ")).toEqual({ url: "https://ong.org.br/doar" });
    expect(validateExternalDonationUrl("https://doacoes.ong.org.br/pix?campanha=natal").url).not.toBeNull();
    expect(validateExternalDonationUrl("https://ong.org.br?campanha=natal")).toEqual({ url: "https://ong.org.br?campanha=natal" });
    expect(validateExternalDonationUrl("https://ong.org.br#doar").url).not.toBeNull();
  });

  it("refuses anything the Vila must not send a donor to", () => {
    for (const bad of [
      "",
      "   ",
      "http://ong.org.br/doar",
      "javascript:alert(1)",
      "data:text/html,<p>doar</p>",
      "https://user:secret@ong.org.br/doar",
      "https://localhost/doar",
      "https://127.0.0.1/doar",
      "https://127.1/doar",
      "https://0x7f.0.0.1/doar",
      "https://0177.0.0.1/doar",
      "https://10.0.0.8/doar",
      "https://192.168.0.2/doar",
      "https://[::1]/doar",
      "https://ong.local/doar",
      "https://intranet/doar",
      "https://ong.org.br/" + "a".repeat(600),
      "not a url",
      "https://ong.org.br/doar\u0000extra",
    ]) {
      const result = validateExternalDonationUrl(bad);
      expect([bad.slice(0, 30), result.url, result.error]).toEqual([
        bad.slice(0, 30),
        null,
        "Informe um link HTTPS público válido da organização (ex.: https://ong.org.br/doar).",
      ]);
    }
    expect(validateExternalDonationUrl(42).url).toBeNull();
  });
});

describe("Título (DEC-041, DEC-042; PROPOSTA)", () => {
  it("starts with no active title and each threshold opens the next stage", () => {
    expect(computeTitleProgress(0, 0)).toEqual({ eligibleCents: 0, confirmedCount: 0, tier: 0, tierLabel: "Sem título ativo", nextTierCents: 200 });
    expect(computeTitleProgress(200, 1)).toMatchObject({ tier: 1, tierLabel: "Faixa I — Símbolo de Natal", nextTierCents: 1000 });
    expect(computeTitleProgress(999, 2)).toMatchObject({ tier: 1, nextTierCents: 1000 });
    expect(computeTitleProgress(1000, 2)).toMatchObject({ tier: 2, tierLabel: "Faixa II — Moldura Dourada" });
    expect(computeTitleProgress(5000, 3)).toMatchObject({ tier: 3, tierLabel: "Faixa III — Guirlanda de Estrelas" });
    expect(computeTitleProgress(15000, 5)).toMatchObject({ tier: 4, tierLabel: "Faixa IV — Brasão Iluminado", nextTierCents: null });
    expect(computeTitleProgress(999999, 99)).toMatchObject({ tier: 4, nextTierCents: null });
  });

  it("never returns a negative or fractional total", () => {
    expect(computeTitleProgress(-1, -3)).toEqual({ eligibleCents: 0, confirmedCount: 0, tier: 0, tierLabel: "Sem título ativo", nextTierCents: 200 });
    expect(computeTitleProgress(199.9, 1.9)).toMatchObject({ eligibleCents: 199, confirmedCount: 1, tier: 0 });
    expect(computeTitleProgress(Number.NaN, Number.POSITIVE_INFINITY)).toMatchObject({ eligibleCents: 0, confirmedCount: 0 });
  });
});

describe("money text", () => {
  it("prints cents as pt-BR reais", () => {
    for (const [cents, text] of [
      [0, "R$ 0,00"],
      [80, "R$ 0,80"],
      [200, "R$ 2,00"],
      [123456, "R$ 1.234,56"],
      [5_000_000, "R$ 50.000,00"],
      [-200, "-R$ 2,00"],
    ] as const)
      expect([cents, formatBrl(cents)]).toEqual([cents, text]);
  });

  it("parses the amounts people type with a comma or a dot", () => {
    expect(parseDecimal("95,5")).toBe(95.5);
    expect(parseDecimal("95.5")).toBe(95.5);
    expect(parseDecimal(" 80 ")).toBe(80);
    expect(parseDecimal("abc")).toBeNull();
    expect(parseDecimal("")).toBeNull();
    expect([parseBrlToCents("2,00"), parseBrlToCents("2.00"), parseBrlToCents("0,80")]).toEqual([200, 200, 80]);
    expect(parseBrlToCents("2,001")).toBeNull();
    expect(parseBrlToCents("2,00abc")).toBeNull();
  });
});
