import { beforeEach, describe, expect, it, vi } from "vitest";

import { LOTS, RESIDENTIAL_PLOTS } from "@vila/shared/game/world";

import { createD1 } from "../test/d1.mjs";
import { createR2 } from "../test/r2.mjs";
import { handleApi, type Env } from "./api";

const NGO_ID = "a0000000-0000-4000-8000-000000000001";
const UNKNOWN_ID = "a0000000-0000-4000-8000-000000000002";
const PATH = `/ngos/${NGO_ID}`;
const ORIGIN = "https://play.example";
let db: ReturnType<typeof createD1>;
let env: Env;

const get = (path = PATH, method = "GET", origin?: string) => handleApi(new Request(`https://api.example${path}`, {
  method, headers: origin ? { Origin: origin } : {},
}), env);

beforeEach(async () => {
  db = createD1();
  env = { DB: db, ENVIRONMENT: "test", ACCOUNTS_ENABLED: "false", ALLOWED_ORIGINS: ORIGIN };
  await db.prepare(
    `INSERT INTO ngos (id, name, cnpj, summary, description, city, tags, projects, status,
      requested_lot_id, funds_confirmation, declarations, review_note)
      VALUES (?, 'Associação Exemplo', '11222333000181', 'Resumo público', 'Descrição aprovada', 'Recife', ?, ?,
      'published', 'plaza-01', 'PRIVATE_FUNDS', '{"private":"PRIVATE_DECLARATION"}', 'PRIVATE_REVIEW')`
  ).bind(NGO_ID, '["education","children"]', '[{"title":"Leitura","description":"Projeto aprovado"}]').run();
  await db.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = 'plaza-01'").bind(NGO_ID).run();
});

describe("public NGO profile", () => {
  it("lets a signed-out visitor discover a published profile while accounts are disabled", async () => {
    const lots = await (await get("/lots")).json() as { lots: Array<Record<string, unknown>> };
    expect(lots.lots.find((lot) => lot.id === "plaza-01")).toMatchObject({ ngo_id: NGO_ID, ngo_name: "Associação Exemplo", ngo_summary: "Resumo público" });
    const res = await get();
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.json()).toEqual({ ngo: {
      id: NGO_ID, name: "Associação Exemplo", summary: "Resumo público", description: "Descrição aprovada",
      tags: ["education", "children"], projects: [{ title: "Leitura", description: "Projeto aprovado" }], lotId: "plaza-01", photos: [],
    } });
  });

  it.each(["submitted", "under_review", "changes_requested", "rejected"])("hides a %s NGO in both public routes", async (status) => {
    await db.prepare("UPDATE ngos SET status = ? WHERE id = ?").bind(status, NGO_ID).run();
    const hidden = await get();
    const missing = await get(`/ngos/${UNKNOWN_ID}`);
    expect(hidden.status).toBe(404);
    expect(await hidden.json()).toEqual(await missing.json());
    expect(hidden.headers.get("Cache-Control")).toBe("no-store");
    const { lots } = await (await get("/lots")).json() as { lots: Array<Record<string, unknown>> };
    expect(lots.find((lot) => lot.id === "plaza-01")).toMatchObject({ ngo_id: null, ngo_name: null, ngo_summary: null });
  });

  it.each(["available", "application_sent", "under_review"])("hides a published NGO when its lot is %s", async (state) => {
    await db.prepare("UPDATE lots SET state = ? WHERE id = 'plaza-01'").bind(state).run();
    expect((await get()).status).toBe(404);
    const { lots } = await (await get("/lots")).json() as { lots: Array<Record<string, unknown>> };
    expect(lots.find((lot) => lot.id === "plaza-01")).toMatchObject({ ngo_id: null, ngo_name: null, ngo_summary: null });
  });

  it("uses the real published lot association rather than the requested lot", async () => {
    await db.prepare("UPDATE lots SET state = 'available', ngo_id = NULL WHERE id = 'plaza-01'").run();
    expect((await get()).status).toBe(404);
    await db.prepare("UPDATE lots SET state = 'published', ngo_id = ? WHERE id = 'plaza-02'").bind(NGO_ID).run();
    expect(await (await get()).json()).toMatchObject({ ngo: { lotId: "plaza-02" } });
  });

  it("stops serving a profile as soon as it is unpublished", async () => {
    expect((await get()).status).toBe(200);
    await db.prepare("UPDATE ngos SET status = 'under_review' WHERE id = ?").bind(NGO_ID).run();
    const res = await get();
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("projects nested JSON onto public fields instead of leaking additional properties", async () => {
    await db.prepare("UPDATE ngos SET tags = ?, projects = ? WHERE id = ?").bind(
      '["education",{"secret":"PRIVATE_TAG"},"PRIVATE_UNKNOWN_TAG",null]',
      '[{"title":"Leitura","description":"Projeto aprovado","private":"PRIVATE_PROJECT"},null,{},"PRIVATE_INVALID_PROJECT"]', NGO_ID
    ).run();
    const res = await get();
    const text = await res.text();
    expect(JSON.parse(text).ngo).toMatchObject({ tags: ["education"], projects: [{ title: "Leitura", description: "Projeto aprovado" }] });
    expect(text).not.toContain("PRIVATE_");
    expect(text).not.toContain("11222333000181");
    expect(Object.keys(JSON.parse(text).ngo).sort()).toEqual(["description", "id", "lotId", "name", "photos", "projects", "summary", "tags"]);
  });

  it.each([null, "not-json", '{"private":"PRIVATE_VALUE"}', "null"])("handles legacy or malformed JSON without exposing it: %s", async (value) => {
    await db.prepare("UPDATE ngos SET summary = NULL, city = NULL, description = NULL, tags = ?, projects = ? WHERE id = ?").bind(value, value, NGO_ID).run();
    const res = await get();
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ngo: { summary: null, description: null, tags: [], projects: [] } });
  });

  it.each(["not-an-id", "", `${NGO_ID}/private`, "%27OR%201=1"])("returns the same not-found result for invalid ids: %s", async (id) => {
    const res = await get(`/ngos/${id}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("reports database unavailability without returning a profile", async () => {
    env.DB = undefined;
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).toEqual({ error: "db_unavailable" });
  });

  it("keeps the public method and exact-origin CORS rules", async () => {
    const ok = await get(PATH, "GET", ORIGIN);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe(ORIGIN);
    expect((await get(PATH, "GET", `${ORIGIN}.evil`)).headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect((await get(PATH, "HEAD")).status).toBe(200);
    expect((await get(PATH, "OPTIONS", ORIGIN)).status).toBe(204);
    const post = await get(PATH, "POST");
    expect(post.status).toBe(405);
    expect(post.headers.get("Allow")).toBe("GET, HEAD, OPTIONS");
  });
});


it.each(Array.from({length:16},(_,i)=>i))("serves the v3 public profile across flag/bucket combination %i", async (flags) => {
  db = createD1({ upTo: 3 }); env.DB = db;
  env.ACCOUNTS_ENABLED = flags & 1 ? "true" : "false";
  env.NGO_FILES_ENABLED = flags & 2 ? "true" : "false";
  env.NGO_PHOTOS_ENABLED = flags & 4 ? "true" : "false";
  env.FILES = flags & 8 ? createR2() : undefined;
  await db.prepare("INSERT INTO ngos(id,name,cnpj,summary,status) VALUES(?, 'Public NGO', '11222333000181', 'Public summary', 'published')").bind(NGO_ID).run();
  await db.prepare("UPDATE lots SET ngo_id=?,state='published' WHERE id='plaza-01'").bind(NGO_ID).run();
  const response = await get();
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ ngo: { id: NGO_ID, name: "Public NGO", summary: "Public summary", description: null, tags: [], projects: [], lotId: "plaza-01", photos: [] } });
  expect((await get(`/ngos/${UNKNOWN_ID}`)).status).toBe(404);
});

// Production's database is at migration 0003 and every flag is off there: the always-on public routes must answer
// on any schema the code may meet (v3 to v11), whatever the flags and the bucket, and never with a 500. None of them
// may read a table from a later migration: neither the withdrawal ledger (0009, IMPL-0020), anything 0010 adds
// (the account block and the moderation tickets, IMPL-0021), nor the donation tables (0011, IMPL-0023) is part of
// any public read while their flags are off. The residential plots (0011, IMPL-0023) are the one public read of a
// newer table, and it answers the shared layout, every plot "unavailable", wherever the table is missing.
it.each([3, 4, 5, 6, 7, 8, 9, 10, 11])("answers every always-on public route on schema v%i in all flag/bucket combinations", async (upTo) => {
  const errors = vi.spyOn(console, "error").mockImplementation(() => {});
  const wrong: string[] = [];
  for (let flags = 0; flags < 512; flags++) for (const published of [true, false]) {
    db = createD1({ upTo });
    env = {
      DB: db, ENVIRONMENT: "test", ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: flags & 1 ? "true" : "false",
      NGO_FILES_ENABLED: flags & 2 ? "true" : "false", NGO_PHOTOS_ENABLED: flags & 4 ? "true" : "false",
      FILES: flags & 8 ? createR2() as unknown as R2Bucket : undefined,
      NGO_WITHDRAWAL_ENABLED: flags & 16 ? "true" : "false",
      ACCOUNT_BLOCK_ENABLED: flags & 32 ? "true" : "false", PRESENCE_MODERATION_ENABLED: flags & 64 ? "true" : "false",
      RESIDENTIAL_PLOTS_ENABLED: flags & 128 ? "true" : "false",
      DONATIONS_ENABLED: flags & 256 ? "true" : "false",
    };
    await db.prepare("INSERT INTO ngos(id,name,cnpj,summary,status) VALUES(?, 'Public NGO', '11222333000181', 'Public summary', ?)").bind(NGO_ID, published ? "published" : "submitted").run();
    await db.prepare("UPDATE lots SET ngo_id=?,state=? WHERE id='plaza-01'").bind(NGO_ID, published ? "published" : "application_sent").run();
    const expected: Record<string, number> = {
      "/health": 200, "/config": 200, "/indicators": 200, "/lots": 200, "/environment": 200, "/residential-plots": 200,
      [PATH]: published ? 200 : 404, [`/ngos/${UNKNOWN_ID}`]: 404, [`${PATH}/logo`]: 404, [`${PATH}/photos/${UNKNOWN_ID}`]: 404,
    };
    for (const [path, status] of Object.entries(expected)) {
      const response = await get(path);
      if (response.status !== status) wrong.push(`flags=${flags} published=${published} ${path}: ${response.status}`);
    }
    const { lots } = await (await get("/lots")).json() as { lots: Array<Record<string, unknown>> };
    expect(lots.find((lot) => lot.id === "plaza-01")).toMatchObject(published
      ? { ngo_id: NGO_ID, ngo_name: "Public NGO", ngo_summary: "Public summary", ngo_logo: null }
      : { ngo_id: null, ngo_name: null, ngo_summary: null, ngo_logo: null });
    const { indicators } = await (await get("/indicators")).json() as { indicators: Array<{ key: string; value: number | null }> };
    expect(indicators.find((indicator) => indicator.key === "approved_ngos")?.value).toBe(published ? 1 : 0);
    if (published) expect(await (await get()).json()).toEqual({ ngo: { id: NGO_ID, name: "Public NGO", summary: "Public summary", description: null, tags: [], projects: [], lotId: "plaza-01", photos: [] } });
    // `/config` is computed from the flags alone, on every schema.
    const accounts = Boolean(flags & 1);
    expect(await (await get("/config")).json()).toEqual({
      accounts, quests: false, files: accounts && Boolean(flags & 2) && Boolean(flags & 8), withdrawal: accounts && Boolean(flags & 16),
      moderation: { block: accounts && Boolean(flags & 32), presence: accounts && Boolean(flags & 64) },
      residentialPlots: accounts && Boolean(flags & 128),
      donations: Boolean(flags & 256),
    });
    // `/lots` keeps its shape and its rows: the eight lots of 0002 everywhere, twelve once 0011 is applied.
    expect(lots.map((lot) => lot.id)).toEqual(LOTS.slice(0, upTo >= 11 ? LOTS.length : 8).map((lot) => lot.id));
    expect(Object.keys(lots[0]).sort()).toEqual(["id", "ngo_id", "ngo_logo", "ngo_name", "ngo_summary", "slot", "state", "street", "x", "z"]);
    // Residential plots: the same layout on every schema; something to hold only with the table and both flags.
    const plots = await (await get("/residential-plots")).json() as { enabled: boolean; plots: Array<Record<string, unknown>> };
    const open = upTo >= 11 && accounts && Boolean(flags & 128);
    expect(plots.enabled).toBe(open);
    expect(plots.plots.map((plot) => plot.id)).toEqual(RESIDENTIAL_PLOTS.map((plot) => plot.id));
    expect(new Set(plots.plots.map((plot) => plot.state))).toEqual(new Set([open ? "available" : "unavailable"]));
    expect(Object.keys(plots.plots[0]).sort()).toEqual(["facing", "id", "slot", "state", "tier", "x", "z"]);
  }
  expect(wrong).toEqual([]);
  expect(errors).not.toHaveBeenCalled();
  errors.mockRestore();
});

it("counts in the public indicator only what the village shows: published NGOs on a published lot", async () => {
  const approved = async () => ((await (await get("/indicators")).json()) as { indicators: Array<{ key: string; value: number | null }> }).indicators.find((indicator) => indicator.key === "approved_ngos")?.value;
  expect(await approved()).toBe(1);
  await db.prepare("INSERT INTO ngos(id,name,cnpj,status) VALUES(?, 'No lot', '11444777000161', 'published')").bind(UNKNOWN_ID).run();
  expect(await approved()).toBe(1);
  await db.prepare("UPDATE lots SET state='published', ngo_id=? WHERE id='plaza-02'").bind(UNKNOWN_ID).run();
  expect(await approved()).toBe(2);
  await db.prepare("UPDATE lots SET state='available', ngo_id=NULL WHERE id='plaza-01'").run();
  expect(await approved()).toBe(1);
});
