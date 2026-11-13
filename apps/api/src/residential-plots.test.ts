/**
 * Residential plots and the lots of the expanded village (IMPL-0024, PROPOSTA): the public read, the flag, the
 * seed of migration 0012 against the shared layout, and what the migration keeps of the lots that existed.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOTS, PLOT_TIERS, RESIDENTIAL_PLOTS } from "@vila/shared/game/world";

import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";

const ORIGIN = "https://play.example";
const NGO_ID = "a0000000-0000-4000-8000-000000000001";
let db: ReturnType<typeof createD1>;
let env: Env;

const get = (path: string, method = "GET", origin?: string) => handleApi(new Request(`https://api.example${path}`, { method, headers: origin ? { Origin: origin } : {} }), env);
interface Body {
  enabled: boolean;
  plots: Array<{ id: string; tier: string; slot: number; x: number; z: number; facing: number; state: string }>;
}
const plots = async () => (await (await get("/residential-plots")).json()) as Body;
const layout = RESIDENTIAL_PLOTS.map(({ id, tier, slot, x, z, facing }) => ({ id, tier, slot, x, z, facing }));

beforeEach(() => {
  db = createD1();
  env = { DB: db, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "false", RESIDENTIAL_PLOTS_ENABLED: "false", ALLOWED_ORIGINS: ORIGIN };
});

describe("migration 0012 against the shared layout", () => {
  it("seeds exactly the lots of the layout, in order", () => {
    const rows = db.sql("SELECT id, street, slot, x, z, state, ngo_id FROM lots ORDER BY slot");
    expect(rows).toEqual(LOTS.map((l) => ({ id: l.id, street: "plaza", slot: l.slot, x: l.x, z: l.z, state: "available", ngo_id: null })));
    expect(rows).toHaveLength(12);
  });

  it("seeds exactly the residential plots of the layout", () => {
    const rows = db.sql(`SELECT id, tier, slot, x, z, facing FROM residential_plots ORDER BY CASE tier WHEN 'premium' THEN 0 WHEN 'standard' THEN 1 ELSE 2 END, slot`);
    expect(rows).toEqual(layout);
    expect(PLOT_TIERS.map((t) => rows.filter((r) => r.tier === t).length)).toEqual([16, 32, 64]);
  });

  it("has no price and no ownership schema: the table holds an id, a tier and a position, nothing else (OQ-17)", () => {
    // Who may hold a plot is undecided: the ownership columns come with the migration that brings a claim route.
    expect(db.sql("PRAGMA table_info(residential_plots)").map((c) => c.name)).toEqual(["id", "tier", "slot", "x", "z", "facing"]);
    expect(db.sql("PRAGMA foreign_key_list(residential_plots)")).toEqual([]);
    expect(db.sql("SELECT name FROM sqlite_master WHERE tbl_name = 'residential_plots' AND type = 'index' AND sql IS NOT NULL")).toEqual([]);
  });

  it("moves the lots that existed and keeps their state and their NGO", async () => {
    // The schema just before it: the donation tables of 0011 are there and must come through untouched.
    const old = createD1({ upTo: 11 });
    await old.prepare("INSERT INTO ngos (id, name, cnpj, summary, status) VALUES (?, 'Associação Exemplo', '11222333000181', 'Resumo', 'published')").bind(NGO_ID).run();
    await old.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = 'plaza-03'").bind(NGO_ID).run();
    await old.prepare("UPDATE lots SET state = 'under_review' WHERE id = 'plaza-07'").run();
    expect(old.sql("SELECT COUNT(*) AS n FROM lots")).toEqual([{ n: 8 }]);
    await old.prepare("INSERT INTO ngo_payment_configs (ngo_id, payment_method, sub_account_id) VALUES (?, 'abacatepay', 'dev_sacc_11222333000181')").bind(NGO_ID).run();
    const before = old.sql("SELECT name, sql FROM sqlite_master WHERE name LIKE '%donation%' OR name LIKE '%payment%' OR name LIKE '%abacatepay%' ORDER BY name");
    expect(before.map((t) => t.name)).toEqual(expect.arrayContaining(["donation_settings", "ngo_payment_configs", "donations", "donation_redirects", "abacatepay_webhook_events"]));
    old.migrate("0012_village_expansion.sql");
    expect(old.sql("SELECT name, sql FROM sqlite_master WHERE name LIKE '%donation%' OR name LIKE '%payment%' OR name LIKE '%abacatepay%' ORDER BY name")).toEqual(before);
    expect(old.sql("SELECT ngo_id, payment_method, sub_account_id FROM ngo_payment_configs")).toEqual([{ ngo_id: NGO_ID, payment_method: "abacatepay", sub_account_id: "dev_sacc_11222333000181" }]);
    const rows = old.sql("SELECT id, slot, x, z, state, ngo_id FROM lots ORDER BY slot");
    expect(rows.map(({ id, slot, x, z }) => ({ id, slot, x, z }))).toEqual(LOTS.map(({ id, slot, x, z }) => ({ id, slot, x, z })));
    expect(rows.filter((r) => r.state !== "available")).toEqual([
      { id: "plaza-03", slot: 3, x: LOTS[2].x, z: LOTS[2].z, state: "published", ngo_id: NGO_ID },
      { id: "plaza-07", slot: 7, x: LOTS[6].x, z: LOTS[6].z, state: "under_review", ngo_id: null },
    ]);
    // The public projection follows: same NGO, same lot id.
    env.DB = old;
    const { lots } = (await (await get("/lots")).json()) as { lots: Array<Record<string, unknown>> };
    expect(lots).toHaveLength(12);
    expect(lots.find((l) => l.id === "plaza-03")).toMatchObject({ state: "published", ngo_id: NGO_ID, ngo_name: "Associação Exemplo", x: LOTS[2].x, z: LOTS[2].z });
    expect(lots.find((l) => l.id === "plaza-12")).toMatchObject({ state: "available", ngo_id: null, ngo_name: null });
  });
});

describe("a house on one of the four new lots and the donations of IMPL-0023", () => {
  const info = `/ngos/${NGO_ID}/donation-info`;
  const publishOn = async (lot: string) => {
    await db.prepare("INSERT INTO ngos (id, name, cnpj, summary, status) VALUES (?, 'Associação Exemplo', '11222333000181', 'Resumo', 'published')").bind(NGO_ID).run();
    await db.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = ?").bind(NGO_ID, lot).run();
  };

  it.each(["plaza-09", "plaza-10", "plaza-11", "plaza-12"])("on %s: no donation route with the flag off, the house's own donation with it on", async (lot) => {
    await publishOn(lot);
    // Off (production and staging): the route does not exist, and the public lot is as before.
    env.DONATIONS_ENABLED = "false";
    expect((await get(info)).status).toBe(404);
    expect((await get("/donations/config")).status).toBe(404);
    const { lots } = (await (await get("/lots")).json()) as { lots: Array<Record<string, unknown>> };
    expect(lots.find((l) => l.id === lot)).toMatchObject({ state: "published", ngo_id: NGO_ID, ngo_name: "Associação Exemplo" });
    // On, nothing configured by the administration yet: answered, and not enabled.
    env.DONATIONS_ENABLED = "true";
    const pending = await get(info);
    expect(pending.status).toBe(200);
    expect(await pending.json()).toMatchObject({ ngoId: NGO_ID, name: "Associação Exemplo", method: "abacatepay", enabled: false, confirmedDonations: 0, confirmedAmountCents: 0 });
    // On and configured: the same answer a house on one of the first eight lots gets.
    await db.prepare("INSERT INTO ngo_payment_configs (ngo_id, payment_method, sub_account_id) VALUES (?, 'abacatepay', 'dev_sacc_11222333000181')").bind(NGO_ID).run();
    expect(await (await get(info)).json()).toMatchObject({ ngoId: NGO_ID, method: "abacatepay", enabled: true });
  });

  it("answers the same for a house on an old lot: the donation follows the NGO, not the lot", async () => {
    await publishOn("plaza-12");
    env.DONATIONS_ENABLED = "true";
    const onNew = await (await get(info)).json();
    await db.prepare("UPDATE lots SET state = 'available', ngo_id = NULL WHERE id = 'plaza-12'").run();
    await db.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = 'plaza-01'").bind(NGO_ID).run();
    expect(await (await get(info)).json()).toEqual(onNew);
  });
});

describe("GET /residential-plots", () => {
  const unavailable = layout.map((p) => ({ ...p, state: "unavailable" }));
  const config = async () => ((await (await get("/config")).json()) as { residentialPlots: boolean }).residentialPlots;
  /** A database that fails every read, counting them. */
  const broken = (message: string) => {
    const db = { reads: 0, prepare: () => ({ all: async () => { db.reads++; throw new Error(message); } }) };
    return db;
  };

  it("answers every plot as unavailable while ownership is off, and never caches", async () => {
    const res = await get("/residential-plots");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ enabled: false, plots: unavailable });
  });

  it.each([["accounts off", "false", "true"], ["the flag off", "true", "false"]])("stays off with %s", async (_, accounts, flag) => {
    env.ACCOUNTS_ENABLED = accounts;
    env.RESIDENTIAL_PLOTS_ENABLED = flag;
    const body = await plots();
    expect(body.enabled).toBe(false);
    expect(new Set(body.plots.map((p) => p.state))).toEqual(new Set(["unavailable"]));
    expect(await config()).toBe(false);
  });

  it("does not read the database to answer a constant: off, the answer is the shared layout", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const [accounts, flag] of [["false", "false"], ["false", "true"], ["true", "false"]]) {
      const db = broken("D1_ERROR: disk I/O error");
      env = { ...env, DB: db as unknown as D1Database, ACCOUNTS_ENABLED: accounts, RESIDENTIAL_PLOTS_ENABLED: flag };
      const res = await get("/residential-plots");
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ enabled: false, plots: unavailable });
      expect(db.reads).toBe(0);
    }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("says a plot is available only with the flag on, and never who holds one: there is no holder to say", async () => {
    for (const on of [false, true]) {
      env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = on ? "true" : "false";
      const res = await get("/residential-plots");
      const text = await res.text();
      for (const word of ["owner", "claimed", "held", "user"]) expect(text, word).not.toContain(word);
      const body = JSON.parse(text) as Body;
      expect(body.enabled).toBe(on);
      expect(body.plots.map(({ state, ...plot }) => plot)).toEqual(layout);
      expect(new Set(body.plots.map((p) => p.state))).toEqual(new Set([on ? "available" : "unavailable"]));
      expect(Object.keys(body.plots[0]).sort()).toEqual(["facing", "id", "slot", "state", "tier", "x", "z"]);
      expect(await config()).toBe(on);
    }
  });

  it("answers every plot of the layout when rows are missing or unknown: the table only adds state", async () => {
    env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = "true";
    db.sql("DELETE FROM residential_plots WHERE tier = 'economy'");
    // A row the layout does not know (a plan that changed after the seed) and one whose position drifted.
    db.sql("INSERT INTO residential_plots (id, tier, slot, x, z, facing) VALUES ('economy-99', 'economy', 99, 1, 2, 0)");
    db.sql("UPDATE residential_plots SET x = 0, z = 0, slot = 77 WHERE id = 'premium-01'");
    const body = await plots();
    expect(body.plots.map(({ state, ...plot }) => plot)).toEqual(layout);
    expect(body.plots.filter((p) => p.state === "available").map((p) => p.id)).toEqual(RESIDENTIAL_PLOTS.filter((p) => p.tier !== "economy").map((p) => p.id));
    expect(new Set(body.plots.filter((p) => p.tier === "economy").map((p) => p.state))).toEqual(new Set(["unavailable"]));
    // Off, the same database answers the whole layout too (it is not read at all).
    env.RESIDENTIAL_PLOTS_ENABLED = "false";
    expect(await plots()).toEqual({ enabled: false, plots: unavailable });
    // An empty table: nothing to hold, the whole layout still answered.
    env.RESIDENTIAL_PLOTS_ENABLED = "true";
    db.sql("DELETE FROM residential_plots");
    expect(await plots()).toEqual({ enabled: true, plots: unavailable });
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11])("answers the shared layout, all unavailable, on schema v%i without the table (both flags on)", async (upTo) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    env.DB = createD1({ upTo });
    env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = "true";
    const res = await get("/residential-plots");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: true, plots: unavailable });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("answers the shared layout without a database", async () => {
    env.DB = undefined;
    env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = "true";
    expect(await plots()).toEqual({ enabled: true, plots: unavailable });
  });

  it.each(["D1_ERROR: disk I/O error", "D1_ERROR: Network connection lost.", "D1_ERROR: no such column: facing: SQLITE_ERROR", "D1_ERROR: no such table: residential_plots_old: SQLITE_ERROR"])(
    "answers the layout, every plot unavailable, when the database fails with the flags on (%s)",
    async (message) => {
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      const db = broken(message);
      env = { ...env, DB: db as unknown as D1Database, ACCOUNTS_ENABLED: "true", RESIDENTIAL_PLOTS_ENABLED: "true" };
      const res = await get("/residential-plots");
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toEqual({ enabled: true, plots: unavailable });
      expect(db.reads).toBe(1);
      // Logged by name only, never the message (it may quote SQL or data).
      expect(errors.mock.calls).toEqual([["residential_plots_read_failed", "Error"]]);
      errors.mockRestore();
    }
  );

  it.each([["v3", 3], ["v11", 11], ["v12", 12], ["no database", null]] as const)("`/config.residentialPlots` and `enabled` agree on %s, whatever the flags", async (_, upTo) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const accounts of ["false", "true"])
      for (const flag of ["false", "true"]) {
        env = { ...env, DB: upTo === null ? undefined : createD1({ upTo }), ACCOUNTS_ENABLED: accounts, RESIDENTIAL_PLOTS_ENABLED: flag };
        const on = accounts === "true" && flag === "true";
        const body = await plots();
        expect([body.enabled, await config()], `accounts ${accounts}, flag ${flag}`).toEqual([on, on]);
        // Whether a given plot can be held is its own state: only with the flags on and its row in the table.
        expect(new Set(body.plots.map((p) => p.state))).toEqual(new Set([on && upTo === 12 ? "available" : "unavailable"]));
      }
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("is read-only and follows the exact-origin CORS rule", async () => {
    for (const method of ["POST", "PUT", "DELETE"]) {
      const res = await get("/residential-plots", method);
      expect(res.status).toBe(405);
      expect(res.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
    }
    expect((await get("/residential-plots/economy-07")).status).toBe(404);
    expect((await get("/residential-plots/economy-07/claim", "POST")).status).toBe(405);
    expect((await get("/residential-plots", "HEAD")).status).toBe(200);
    expect((await get("/residential-plots", "GET", ORIGIN)).headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect((await get("/residential-plots", "GET", `${ORIGIN}.evil`)).headers.get("Access-Control-Allow-Origin")).toBeNull();
    // The session cookie has no business here: the public website may read it too.
    env.ACCOUNT_ORIGINS = "https://other.example";
    expect((await get("/residential-plots", "GET", ORIGIN)).headers.get("Access-Control-Allow-Credentials")).toBeNull();
  });
});
