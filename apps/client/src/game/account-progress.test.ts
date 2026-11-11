import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { applyEvent, EMPTY_PROGRESS, type Progress } from "@vila/shared/game/progress";
import { createProgressSync } from "./account-progress";

const earned = applyEvent(EMPTY_PROGRESS, "play-memory", "win").progress;
const response = (progress = EMPTY_PROGRESS, guestImported = true) => Response.json({ progress, guestImported });
describe("account progress queue", () => {
  let data: Map<string, string>;
  beforeEach(() => {
    data = new Map();
    vi.stubGlobal("localStorage", { getItem: (key: string) => data.get(key) ?? null, setItem: (key: string, value: string) => data.set(key, value) });
  });
  afterEach(() => vi.unstubAllGlobals());
  function setup(guest = EMPTY_PROGRESS) {
    let shown: Progress = guest;
    let status = "guest";
    const changed = vi.fn();
    const sync = createProgressSync({ guest: () => guest, progress: (p) => { shown = p; }, status: (s) => { status = s; }, unauthorized: vi.fn(), accountChanged: changed });
    return { sync, shown: () => shown, status: () => status, changed };
  }

  it("restores the guest snapshot on logout and never writes account progress into guest storage", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response(earned)));
    const state = setup();
    state.sync.switchUser("A");
    await vi.waitFor(() => expect(state.status()).toBe("saved"));
    expect(state.shown().xp).toBe(40);
    expect(data.has("vila.progress.v2")).toBe(false);
    state.sync.switchUser(null);
    expect(state.shown()).toEqual(EMPTY_PROGRESS);
    expect(state.status()).toBe("guest");
  });

  it("ignores stale account responses after a different account becomes active", async () => {
    let old!: (value: Response) => void;
    const fetcher = vi.fn().mockImplementationOnce(() => new Promise<Response>((resolve) => { old = resolve; })).mockResolvedValue(response());
    vi.stubGlobal("fetch", fetcher);
    const state = setup();
    state.sync.switchUser("A");
    state.sync.switchUser("B");
    await vi.waitFor(() => expect(state.status()).toBe("saved"));
    old(response(earned));
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(state.shown().xp).toBe(0);
    expect(fetcher.mock.calls[1][1].headers["X-Account-ID"]).toBe("B");
  });

  it("keeps failed events under their account, then replays the persistent queue after reconnect", async () => {
    const fetcher = vi.fn(async (_url: string, options: RequestInit) => {
      if (options.method === "POST") throw new Error("offline");
      return response();
    });
    vi.stubGlobal("fetch", fetcher);
    const first = setup();
    first.sync.switchUser("A");
    await vi.waitFor(() => expect(first.status()).toBe("saved"));
    first.sync.record("play-memory", "win");
    await vi.waitFor(() => expect(first.status()).toBe("offline"));
    expect(JSON.parse(data.get("vila.account-progress.v1:A")!).pending).toHaveLength(1);
    first.sync.switchUser(null);
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => { calls.push(url); return url.endsWith("/events") ? response(earned) : response(); }));
    const resumed = setup();
    resumed.sync.switchUser("A");
    await vi.waitFor(() => expect(resumed.status()).toBe("saved"));
    expect(resumed.shown().xp).toBe(40);
    expect(calls.filter((url) => url.endsWith("/events"))).toHaveLength(1);
    expect(JSON.parse(data.get("vila.account-progress.v1:A")!).pending).toEqual([]);
  });

  it("pauses an old tab after another tab changes the session account, retaining its queue", async () => {
    const state = setup();
    vi.stubGlobal("fetch", vi.fn(async () => response()));
    state.sync.switchUser("A");
    await vi.waitFor(() => expect(state.status()).toBe("saved"));
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "account_changed" }, { status: 409 })));
    state.sync.record("play-memory", "win");
    await vi.waitFor(() => expect(state.changed).toHaveBeenCalledOnce());
    expect(state.status()).toBe("offline");
    expect(JSON.parse(data.get("vila.account-progress.v1:A")!).pending).toHaveLength(1);
  });
});
