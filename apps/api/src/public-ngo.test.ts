import { beforeEach, describe, expect, it } from "vitest";

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
