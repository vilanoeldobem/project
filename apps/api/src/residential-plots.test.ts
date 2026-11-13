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
const USER_ID = "b0000000-0000-4000-8000-000000000001";
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

  it("seeds exactly the residential plots of the layout, held by nobody", () => {
    const rows = db.sql(`SELECT id, tier, slot, x, z, facing FROM residential_plots ORDER BY CASE tier WHEN 'premium' THEN 0 WHEN 'standard' THEN 1 ELSE 2 END, slot`);
    expect(rows).toEqual(layout);
    expect(PLOT_TIERS.map((t) => rows.filter((r) => r.tier === t).length)).toEqual([16, 32, 64]);
    expect(db.sql("SELECT COUNT(*) AS n FROM residential_plots WHERE owner_id IS NOT NULL OR claimed_at IS NOT NULL")).toEqual([{ n: 0 }]);
  });

  it("has no price: the table holds a position and who holds the plot, nothing else", () => {
    expect(db.sql("PRAGMA table_info(residential_plots)").map((c) => c.name)).toEqual(["id", "tier", "slot", "x", "z", "facing", "owner_id", "claimed_at"]);
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

describe("GET /residential-plots", () => {
  it("answers every plot as unavailable while ownership is off, and never caches", async () => {
    const res = await get("/residential-plots");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ enabled: false, plots: layout.map((p) => ({ ...p, state: "unavailable" })) });
  });

  it.each([["accounts off", "false", "true"], ["the flag off", "true", "false"]])("stays off with %s", async (_, accounts, flag) => {
    env.ACCOUNTS_ENABLED = accounts;
    env.RESIDENTIAL_PLOTS_ENABLED = flag;
    const body = await plots();
    expect(body.enabled).toBe(false);
    expect(new Set(body.plots.map((p) => p.state))).toEqual(new Set(["unavailable"]));
    expect(((await (await get("/config")).json()) as { residentialPlots: boolean }).residentialPlots).toBe(false);
  });

  it("never says who holds a plot, with the flag off or on", async () => {
    await db.prepare("INSERT INTO users (id, name, nickname, nickname_key, city, email) VALUES (?, 'Ana Lima', 'ana_lima', 'ana_lima', 'Recife', 'ana@example.org')").bind(USER_ID).run();
    await db.prepare("UPDATE residential_plots SET owner_id = ?, claimed_at = '2026-11-12T10:00:00.000Z' WHERE id = 'economy-07'").bind(USER_ID).run();
    for (const on of [false, true]) {
      env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = on ? "true" : "false";
      const res = await get("/residential-plots");
      const text = await res.text();
      for (const secret of [USER_ID, "ana_lima", "Ana Lima", "ana@example.org", "owner", "claimed", "2026-11-12"]) expect(text, secret).not.toContain(secret);
      const body = JSON.parse(text) as Body;
      expect(body.enabled).toBe(on);
      expect(body.plots.find((p) => p.id === "economy-07")?.state).toBe(on ? "occupied" : "unavailable");
      expect(body.plots.find((p) => p.id === "economy-08")?.state).toBe(on ? "available" : "unavailable");
      expect(Object.keys(body.plots[0]).sort()).toEqual(["facing", "id", "slot", "state", "tier", "x", "z"]);
      expect(((await (await get("/config")).json()) as { residentialPlots: boolean }).residentialPlots).toBe(on);
    }
    // Deleting the account frees the plot instead of blocking the deletion.
    await db.prepare("DELETE FROM users WHERE id = ?").bind(USER_ID).run();
    expect(db.sql("SELECT owner_id FROM residential_plots WHERE id = 'economy-07'")).toEqual([{ owner_id: null }]);
  });

  it.each([3, 4, 5, 6, 7, 8, 9, 10, 11])("answers the shared layout, all unavailable, on schema v%i without the table (both flags on)", async (upTo) => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    env.DB = createD1({ upTo });
    env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = "true";
    const res = await get("/residential-plots");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ enabled: false, plots: layout.map((p) => ({ ...p, state: "unavailable" })) });
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("answers the shared layout without a database", async () => {
    env.DB = undefined;
    env.ACCOUNTS_ENABLED = env.RESIDENTIAL_PLOTS_ENABLED = "true";
    expect(await plots()).toEqual({ enabled: false, plots: layout.map((p) => ({ ...p, state: "unavailable" })) });
  });

  it("does not hide another database error behind the fallback", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    env.DB = { prepare: () => ({ all: async () => { throw new Error("D1_ERROR: disk I/O error"); } }) } as unknown as D1Database;
    const res = await get("/residential-plots");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "internal" });
    expect(errors).toHaveBeenCalledWith("api_error", "/residential-plots", "Error");
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
