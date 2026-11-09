import { describe, expect, it } from "vitest";

import { handleApi, type Env } from "./api";

const env = (db?: Partial<D1Database>): Env => ({
  ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher,
  DB: db as D1Database | undefined,
  ENVIRONMENT: "test",
});

const get = (path: string, e: Env, method = "GET") => handleApi(new Request(`https://vila.test${path}`, { method }), e);

describe("worker /api", () => {
  it("health reports db presence", async () => {
    const res = await get("/api/health", env());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, environment: "test", db: false });
  });

  it("indicators never invent numbers", async () => {
    const res = await get("/api/indicators", env());
    const body = (await res.json()) as { indicators: { key: string; value: number | null }[] };
    expect(body.indicators.every((i) => i.value === null)).toBe(true);
  });

  it("indicators count only published NGOs", async () => {
    let sql = "";
    const db = {
      prepare: (q: string) => {
        sql = q;
        return { first: async () => ({ n: 3 }) };
      },
    } as unknown as D1Database;
    const body = (await (await get("/api/indicators", env(db))).json()) as { indicators: { key: string; value: number | null }[] };
    expect(sql).toContain("FROM ngos WHERE status = 'published'");
    expect(body.indicators.find((i) => i.key === "approved_ngos")?.value).toBe(3);
    expect(body.indicators.find((i) => i.key === "confirmed_donations")?.value).toBeNull();
  });

  it("lots without db is 503", async () => {
    expect((await get("/api/lots", env())).status).toBe(503);
  });

  it("rejects writes and unknown routes", async () => {
    expect((await get("/api/lots", env(), "POST")).status).toBe(405);
    expect((await get("/api/nope", env())).status).toBe(404);
  });
});
