import { describe, expect, it } from "vitest";

import { parseSnapshot } from "@vila/shared/environment/config";
import { handleApi, type Env } from "./api";

const env = (db?: Partial<D1Database>): Env => ({
  DB: db as D1Database | undefined,
  ENVIRONMENT: "test",
});

const get = (path: string, e: Env, method = "GET") => handleApi(new Request(`https://vila.test${path}`, { method }), e);

describe("worker /api", () => {
  it("health reports db presence and whether the mail key is set, never the key", async () => {
    const res = await get("/health", env());
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, environment: "test", db: false, mail: false });
    const withKey = await (await get("/health", { ...env(), RESEND_API_KEY: "re_test_secret" })).text();
    expect(JSON.parse(withKey).mail).toBe(true);
    expect(withKey).not.toContain("re_test_secret");
  });

  it("indicators never invent numbers", async () => {
    const res = await get("/indicators", env());
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
    const body = (await (await get("/indicators", env(db))).json()) as { indicators: { key: string; value: number | null }[] };
    expect(sql).toContain("FROM ngos WHERE status = 'published'");
    expect(body.indicators.find((i) => i.key === "approved_ngos")?.value).toBe(3);
    expect(body.indicators.find((i) => i.key === "confirmed_donations")?.value).toBeNull();
  });

  it("environment is the clock authority and never cached", async () => {
    const before = Date.now();
    const res = await get("/environment", env());
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    const body = (await res.json()) as Record<string, unknown>;
    expect(body).toMatchObject({
      type: "environment.snapshot",
      timezone: "America/Sao_Paulo",
      timeScale: 1,
      weatherAlgorithmVersion: 1,
    });
    expect(body.serverTimeMs as number).toBeGreaterThanOrEqual(before);
    expect(parseSnapshot(body)).not.toBeNull();
  });

  it("lots without db is 503", async () => {
    expect((await get("/lots", env())).status).toBe(503);
  });

  it("rejects writes and unknown routes", async () => {
    expect((await get("/lots", env(), "POST")).status).toBe(405);
    expect((await get("/nope", env())).status).toBe(404);
  });

  it("sends CORS headers only to allowed origins", async () => {
    const e = { ...env(), ALLOWED_ORIGINS: "https://play.example" };
    const ok = await handleApi(new Request("https://vila.test/health", { headers: { Origin: "https://play.example" } }), e);
    expect(ok.headers.get("Access-Control-Allow-Origin")).toBe("https://play.example");
    const bad = await handleApi(new Request("https://vila.test/health", { headers: { Origin: "https://evil.example" } }), e);
    expect(bad.headers.get("Access-Control-Allow-Origin")).toBeNull();
    const pre = await handleApi(new Request("https://vila.test/lots", { method: "OPTIONS", headers: { Origin: "https://play.example" } }), e);
    expect(pre.status).toBe(204);
  });
});
