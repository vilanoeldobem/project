/**
 * quests-v2 flag on the client: page flag AND `/config.questsV2`; the store applies events through the
 * catalog engine while v2 is on, and keeps the v1 path while it is off.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Config = { accounts: boolean; quests?: boolean; questsV2?: boolean };

function stubPage(config: Config) {
  const storage = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("location", { hash: "", search: "", hostname: "play.example", pathname: "/" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      const body = path === "/config" ? config : path === "/me" ? { user: null } : { progress: { xp: 0, counters: {}, completed: {}, seen: {} } };
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
}

async function load(buildFlag: boolean, v1Build = false) {
  // Environment flags are read at module import: re-import per scenario (test loading boundary).
  vi.stubEnv("VITE_QUESTS_V1_ENABLED", v1Build ? "true" : "false");
  vi.stubEnv("VITE_QUESTS_V2_ENABLED", buildFlag ? "true" : "false");
  vi.resetModules();
  const flag = await import("./questsV2Flag");
  const v1Flag = await import("./questsFlag");
  const account = await import("../lib/account");
  const { useVila } = await import("./store");
  return { ...flag, ...v1Flag, ...account, useVila };
}

beforeEach(() => stubPage({ accounts: false, quests: false, questsV2: false }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("quests-v2 flag", () => {
  it("stays off until both this page and the API say yes", async () => {
    stubPage({ accounts: false, questsV2: true });
    let page = await load(true);
    expect(page.questsV2Enabled()).toBe(false);
    await page.initAccount();
    expect(page.questsV2Enabled()).toBe(true);

    stubPage({ accounts: false, questsV2: true });
    page = await load(false);
    await page.initAccount();
    expect(page.questsV2Enabled()).toBe(false);

    stubPage({ accounts: false, quests: true });
    page = await load(true);
    await page.initAccount();
    expect(page.questsV2Enabled()).toBe(false);
  });

  it("stays off when the API cannot be reached", async () => {
    const page = await load(true);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await page.initAccount();
    expect(page.questsV2Enabled()).toBe(false);
  });

  it("records a v1 quest through the catalog engine while v2 is on", async () => {
    stubPage({ accounts: false, quests: true, questsV2: true });
    const page = await load(true, true);
    await page.initAccount();
    page.useVila.getState().record("harness-bells", "accept");
    expect(page.useVila.getState().progress.seen["harness-bells:accept"]).toBe(true);
  });

  it("keeps v1 event filtering and always sends quick missions", async () => {
    stubPage({ accounts: false, quests: false, questsV2: true });
    const page = await load(true);
    await page.initAccount();
    const events = [
      { missionId: "harness-bells", eventId: "accept" },
      { missionId: "play-memory", eventId: "win" },
    ];
    expect(page.sendableEvents(events)).toEqual([{ missionId: "play-memory", eventId: "win" }]);
    stubPage({ accounts: false, quests: true, questsV2: true });
    const v1 = await load(true, true);
    await v1.initAccount();
    expect(v1.sendableEvents(events)).toEqual(events);
  });
});
