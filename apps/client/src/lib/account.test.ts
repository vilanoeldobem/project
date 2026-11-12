/**
 * quests-v1 flag on the client (PROPOSTA; IMPL-0013): quest features need this build's flag AND the API's
 * `/config.quests`, and quest events are neither queued nor sent while either side is off.
 * Runs in Node with a stubbed `fetch`, `localStorage` and `window`; modules are re-imported per test because
 * the build flag and the guest progress are read once per page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const USER = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "player" as const };
const EMPTY = { xp: 0, counters: {}, completed: {}, seen: {} };
type Sent = { missionId: string; eventId: string };

let storage: Map<string, string>;
/** Bodies of every `POST /progress/events`, in order. */
let posted: Sent[][];

function stubPage(config: object) {
  storage = new Map();
  posted = [];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal("window", { addEventListener: () => undefined, removeEventListener: () => undefined });
  vi.stubGlobal("location", { hash: "", search: "", hostname: "play.example", pathname: "/" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (init?.method === "POST" && path === "/progress/events") posted.push((JSON.parse(String(init.body)) as { events: Sent[] }).events);
      const body = path === "/config" ? config : path === "/me" ? { user: USER } : { progress: EMPTY };
      return new Response(JSON.stringify(body), { status: 200 });
    })
  );
}

/** A fresh page load: the build flag, then the modules that read it. */
async function load(buildFlag: boolean) {
  vi.stubEnv("VITE_QUESTS_V1_ENABLED", buildFlag ? "true" : "false");
  vi.resetModules();
  const flag = await import("../game/questsFlag");
  const account = await import("./account");
  const { useVila } = await import("../game/store");
  return { ...flag, ...account, useVila };
}

/** Guest progress left in this browser: one mission event and one accepted quest. */
const guestProgress = () =>
  storage.set("vila.progress.v2", JSON.stringify({ ...EMPTY, seen: { "play-memory:win": true, "harness-bells:accept": true } }));

beforeEach(() => stubPage({ accounts: false, quests: false }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("quests flag (build AND server)", () => {
  it("stays off until the API says quests are on, even with the build flag", async () => {
    stubPage({ accounts: false, quests: true });
    const { initAccount, questsEnabled } = await load(true);
    expect(questsEnabled()).toBe(false);
    await initAccount();
    expect(questsEnabled()).toBe(true);
  });

  it("stays off when only one side is on, or when /config has no quests field", async () => {
    stubPage({ accounts: false, quests: false });
    let page = await load(true);
    await page.initAccount();
    expect(page.questsEnabled()).toBe(false);

    stubPage({ accounts: false, quests: true });
    page = await load(false);
    await page.initAccount();
    expect(page.questsEnabled()).toBe(false);

    stubPage({ accounts: false });
    page = await load(true);
    await page.initAccount();
    expect(page.questsEnabled()).toBe(false);
  });

  it("stays off when the API cannot be reached", async () => {
    const { initAccount, questsEnabled } = await load(true);
    vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
    await initAccount();
    expect(questsEnabled()).toBe(false);
  });
});

describe("progress sync and quest events", () => {
  it("does not send or queue quest events while quests are off", async () => {
    stubPage({ accounts: true, quests: false });
    guestProgress();
    const { initAccount, useVila } = await load(true);
    await initAccount();
    expect(posted).toEqual([[{ missionId: "play-memory", eventId: "win" }]]);

    // Signed in: a new quest event is not queued, a new mission event is sent as usual.
    useVila.setState({ progress: { ...EMPTY, seen: { "lake-lanterns:accept": true, "causes-global-donation:panel": true } } });
    await vi.waitFor(() => expect(posted).toHaveLength(2));
    expect(posted[1]).toEqual([{ missionId: "causes-global-donation", eventId: "panel" }]);
    expect(storage.get("vila.pending.v1:u1")).toBeUndefined();
  });

  it("sends quest events when the build and the API both have quests on", async () => {
    stubPage({ accounts: true, quests: true });
    guestProgress();
    const { initAccount } = await load(true);
    await initAccount();
    expect(posted).toEqual([[{ missionId: "play-memory", eventId: "win" }, { missionId: "harness-bells", eventId: "accept" }]]);
  });
});
