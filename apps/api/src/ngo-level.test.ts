/**
 * The level of an NGO's building in `GET /lots` (IMPL-0032, PROPOSTA): the confirmed donation total of a
 * published NGO turned into a level from 1 to 5, behind `NGO_LEVELS_ENABLED` and `DONATIONS_ENABLED`. The level
 * goes out; the amount never does.
 */
import { beforeEach, describe, expect, it } from "vitest";

import { NGO_LEVEL_FROM_CENTS } from "@vila/shared/game/ngo-level";

import { configuredVars, devVar } from "../test/config.mjs";
import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";

const ORIGIN = "https://play.example";
const NGO = "a0000000-0000-4000-8000-000000000001", OTHER = "a0000000-0000-4000-8000-000000000002";
let db: ReturnType<typeof createD1>;
let env: Env;

const get = (path: string) => handleApi(new Request(`https://api.example${path}`, { headers: { Origin: ORIGIN } }), env);
const lots = async () => ((await (await get("/lots")).json()) as { lots: Array<Record<string, unknown>> }).lots;
const lot = async (id: string) => (await lots()).find((l) => l.id === id)!;
const publish = async (ngo: string, lotId: string, cnpj: string) => {
  await db.prepare("INSERT INTO ngos (id, name, cnpj, summary, status) VALUES (?, 'Associação Exemplo', ?, 'Resumo', 'published')").bind(ngo, cnpj).run();
  await db.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = ?").bind(ngo, lotId).run();
};
let seq = 0;
const donate = (ngo: string | null, cents: number, status = "paid", provider = "abacatepay") =>
  db
    .prepare(
      `INSERT INTO donations (id, target_kind, ngo_id, recipient_name, provider, provider_charge_id, amount_cents, ngo_share_cents, vila_share_cents, ngo_percent_bps, fixed_fee_cents, status)
       VALUES (?, ?, ?, 'Associação Exemplo', ?, ?, ?, ?, 0, 9500, 80, ?)`
    )
    .bind(`d-${++seq}`, ngo ? "ngo" : "global", ngo, provider, `charge-${seq}`, cents, cents, status)
    .run();

beforeEach(() => {
  seq = 0;
  db = createD1();
  env = { DB: db, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "false", DONATIONS_ENABLED: "true", NGO_LEVELS_ENABLED: "true", ALLOWED_ORIGINS: ORIGIN };
});

describe("the level of a published house", () => {
  it("is 1 with no donation and climbs at each threshold of the confirmed total", async () => {
    await publish(NGO, "plaza-03", "11222333000181");
    expect((await lot("plaza-03")).ngo_level).toBe(1);
    let total = 0;
    for (let level = 2; level <= NGO_LEVEL_FROM_CENTS.length; level++) {
      // One cent short of the threshold keeps the level; reaching it climbs.
      const short = NGO_LEVEL_FROM_CENTS[level - 1] - 200 - total;
      await donate(NGO, short);
      total += short;
      expect((await lot("plaza-03")).ngo_level, `R$ ${total / 100}`).toBe(level - 1);
      await donate(NGO, 200);
      total += 200;
      expect((await lot("plaza-03")).ngo_level, `R$ ${total / 100}`).toBe(level);
    }
    await donate(NGO, 100_000_000);
    expect((await lot("plaza-03")).ngo_level).toBe(5);
  });

  it("counts only confirmed donations of that NGO: not pending, expired, cancelled, refunded or disputed ones, not another NGO's, not the global one", async () => {
    await publish(NGO, "plaza-03", "11222333000181");
    await publish(OTHER, "ring2-05", "11444777000161");
    for (const status of ["pending", "expired", "cancelled", "refunded", "under_dispute"]) await donate(NGO, 5_000_000, status);
    await donate(null, 5_000_000);
    await donate(OTHER, NGO_LEVEL_FROM_CENTS[2]);
    expect((await lot("plaza-03")).ngo_level).toBe(1);
    expect((await lot("ring2-05")).ngo_level).toBe(3);
    // A proof an administrator entered for an NGO's own payment page is a confirmed donation of that NGO (the
    // same sum `/ngos/:id/donation-info` shows): whether it should count is OQ-23.
    await donate(NGO, NGO_LEVEL_FROM_CENTS[1], "paid", "external_proof");
    expect((await lot("plaza-03")).ngo_level).toBe(2);
  });

  it("goes down when a donation is refunded: the level follows the confirmed total, both ways", async () => {
    await publish(NGO, "plaza-03", "11222333000181");
    await donate(NGO, NGO_LEVEL_FROM_CENTS[2]);
    expect((await lot("plaza-03")).ngo_level).toBe(3);
    await db.prepare("UPDATE donations SET status = 'refunded' WHERE ngo_id = ?").bind(NGO).run();
    expect((await lot("plaza-03")).ngo_level).toBe(1);
  });

  it("sends the level and never the amount", async () => {
    await publish(NGO, "plaza-03", "11222333000181");
    await donate(NGO, 1_234_567);
    const row = await lot("plaza-03");
    expect(Object.keys(row).sort()).toEqual(["id", "ngo_id", "ngo_level", "ngo_logo", "ngo_name", "ngo_summary", "slot", "state", "street", "x", "z"]);
    expect(JSON.stringify(await lots())).not.toMatch(/1234567|12345\.67|confirmed|amount|cents/);
  });

  it("is null for a lot with no published house, whatever was donated to the NGO that asked for it", async () => {
    await db.prepare("INSERT INTO ngos (id, name, cnpj, summary, status) VALUES (?, 'Em análise', '11222333000181', 'Resumo', 'under_review')").bind(NGO).run();
    await db.prepare("UPDATE lots SET state = 'under_review', ngo_id = ? WHERE id = 'plaza-03'").bind(NGO).run();
    await donate(NGO, 5_000_000);
    expect(await lot("plaza-03")).toMatchObject({ state: "under_review", ngo_id: null, ngo_name: null, ngo_level: null });
    expect((await lots()).every((l) => l.ngo_level === null)).toBe(true);
  });
});

describe("the flags of the level", () => {
  const off: Array<[string, Partial<Env>]> = [
    ["levels off", { NGO_LEVELS_ENABLED: "false" }],
    ["levels unset", { NGO_LEVELS_ENABLED: undefined }],
    ["donations off", { DONATIONS_ENABLED: "false" }],
    ["both off (production and staging)", { NGO_LEVELS_ENABLED: "false", DONATIONS_ENABLED: "false" }],
  ];

  it.each(off)("answers null for every lot with %s, and says so in /config", async (_, vars) => {
    await publish(NGO, "plaza-03", "11222333000181");
    await donate(NGO, 5_000_000);
    Object.assign(env, vars);
    expect((await lot("plaza-03")).ngo_level).toBeNull();
    expect(((await (await get("/config")).json()) as { ngoLevels: boolean }).ngoLevels).toBe(false);
  });

  it("says it is on in /config only with both flags, and needs no account", async () => {
    expect(((await (await get("/config")).json()) as { ngoLevels: boolean; accounts: boolean })).toMatchObject({ ngoLevels: true, accounts: false });
  });

  it("answers the lots without levels on a database that has no donations table yet, never a 500", async () => {
    db = createD1({ upTo: 10 });
    env.DB = db;
    await publish(NGO, "plaza-03", "11222333000181");
    const response = await get("/lots");
    expect(response.status).toBe(200);
    expect(await lot("plaza-03")).toMatchObject({ state: "published", ngo_name: "Associação Exemplo", ngo_level: null });
  });

  it("is off in production and staging, and on only in the local dev script", () => {
    expect(configuredVars("NGO_LEVELS_ENABLED")).toEqual(["false", "false"]);
    expect(devVar("NGO_LEVELS_ENABLED")).toBe("true");
  });
});
