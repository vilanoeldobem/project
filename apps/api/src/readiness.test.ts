import { describe, expect, it, vi } from "vitest";

import { handleApi, type Env } from "./api";
import { READY_TIMEOUT_MS } from "./readiness";

const db = (first: () => Promise<unknown>) => ({ prepare: () => ({ first }) }) as unknown as D1Database;
const bucket = (head: (key: string) => Promise<unknown>) => ({ head }) as unknown as R2Bucket;
const ready = async (env: Env) => {
  const res = await handleApi(new Request("https://vila.test/ready"), env);
  return { status: res.status, cache: res.headers.get("cache-control"), body: (await res.json()) as { ok: boolean; checks: Record<string, string> } };
};

describe("GET /ready", () => {
  it("answers 200 when D1 answers, and leaves an unbound bucket as off", async () => {
    const r = await ready({ DB: db(async () => ({ one: 1 })) });
    expect(r).toEqual({ status: 200, cache: "no-store", body: { ok: true, checks: { db: "ok", files: "off" } } });
  });

  it("reads the bucket with a head of a key that is never stored", async () => {
    const keys: string[] = [];
    const r = await ready({ DB: db(async () => ({ one: 1 })), FILES: bucket(async (k) => void keys.push(k)) });
    expect(r.body).toEqual({ ok: true, checks: { db: "ok", files: "ok" } });
    expect(keys).toEqual(["readiness-probe"]);
  });

  it("answers 503 and names the dependency that failed, never the error", async () => {
    const r = await ready({ DB: db(async () => Promise.reject(new Error("D1_ERROR: secret detail"))), FILES: bucket(async () => null) });
    expect(r.status).toBe(503);
    expect(r.body).toEqual({ ok: false, checks: { db: "fail", files: "ok" } });
    expect(JSON.stringify(r.body)).not.toContain("secret");
    expect((await ready({})).body.checks.db).toBe("fail");
    expect((await ready({ DB: db(async () => 1), FILES: bucket(async () => Promise.reject(new Error("r2"))) })).status).toBe(503);
  });

  it("gives up on a dependency that hangs", async () => {
    vi.useFakeTimers();
    try {
      const pending = ready({ DB: db(() => new Promise(() => {})) });
      await vi.advanceTimersByTimeAsync(READY_TIMEOUT_MS + 1);
      expect((await pending).body.checks.db).toBe("fail");
    } finally {
      vi.useRealTimers();
    }
  });
});
