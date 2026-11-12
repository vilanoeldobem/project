/** Cross-app contract regression: the real client synchronizes through the real API and SQLite-backed D1. */
import { afterEach, expect, it, vi } from "../apps/api/node_modules/vitest/dist/index.js";

import { createD1 } from "../apps/api/test/d1.mjs";
import { handleApi } from "../apps/api/src/api.ts";
import { sha256Hex } from "../apps/api/src/crypto.ts";
import { applyEvent, EMPTY_PROGRESS } from "../packages/shared/src/game/progress.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("loads the account's 40 XP and active quest when guest progress conflicts, including after reload", async () => {
  const db = createD1();
  const origin = "https://play.example";
  const env = { DB: db, ALLOWED_ORIGINS: origin, ACCOUNTS_ENABLED: "true", QUESTS_V1_ENABLED: "true" };
  await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,verified_at) VALUES(?,?,?,?,?,?,?)")
    .bind("owner", "Synthetic player", "player", "player", "Recife", "player@example.invalid", "2026-01-01").run();
  await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
    .bind(await sha256Hex("synthetic-session"), "owner", "2099-01-01").run();
  const requests = [];
  const transport = async (url, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set("Origin", origin);
    headers.set("Cookie", "__Host-vila_session=synthetic-session");
    const response = await handleApi(new Request(url, { ...init, headers }), env);
    requests.push({ path: new URL(url).pathname, status: response.status });
    return response;
  };
  const seed = await transport("https://api.example/progress/events", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ accountId: "owner", events: [
      { missionId: "play-memory", eventId: "win" }, { missionId: "harness-bells", eventId: "accept" },
    ] }),
  });
  expect(seed.status).toBe(200);
  expect((await seed.json()).progress.xp).toBe(40);

  const storage = new Map([["vila.progress.v2", JSON.stringify(applyEvent(EMPTY_PROGRESS, "lake-lanterns", "accept").progress)]]);
  // Also cover a conflicting event that survived an earlier signed-in page.
  storage.set("vila.pending.v1:owner", JSON.stringify([{ missionId: "lake-lanterns", eventId: "accept" }]));
  vi.stubGlobal("localStorage", {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => void storage.set(key, value),
    removeItem: (key) => void storage.delete(key),
  });
  vi.stubGlobal("window", { addEventListener: () => {}, removeEventListener: () => {} });
  vi.stubGlobal("location", { hash: "", search: "", hostname: "play.example", pathname: "/" });
  vi.stubGlobal("fetch", transport);
  vi.stubEnv("VITE_QUESTS_V1_ENABLED", "true");

  for (let load = 0; load < 2; load++) {
    vi.resetModules();
    const account = await import("../apps/client/src/lib/account.ts");
    const { useVila } = await import("../apps/client/src/game/store.ts");
    await account.initAccount();
    expect(account.useAccount.getState().user?.id).toBe("owner");
    expect(account.useAccount.getState().sync).toBe("saved");
    expect(useVila.getState().progressOwner).toBe("owner");
    expect(useVila.getState().progress.xp).toBe(40);
    expect(useVila.getState().progress.seen["harness-bells:accept"]).toBe(true);
    expect(useVila.getState().progress.seen["lake-lanterns:accept"]).toBeUndefined();
    expect(storage.has("vila.pending.v1:owner")).toBe(false);
  }
  expect(requests.filter((r) => r.path === "/progress/events").map((r) => r.status)).toEqual([200, 200]);
  expect(db.sql("SELECT mission_id FROM progress_events ORDER BY rowid").map((r) => r.mission_id)).toEqual(["play-memory", "harness-bells"]);
});
