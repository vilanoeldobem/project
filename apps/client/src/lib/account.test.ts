/**
 * Accounts and progress sync on the client (IMPL-0011): quest events are always queued and sent (IMPL-0037).
 * Runs in Node with a stubbed `fetch`, `localStorage` and `window`; modules are re-imported per test because
 * the guest progress is read once per page load.
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

/** A fresh page load: the modules read the guest storage once per page. */
async function load() {
  vi.resetModules();
  const account = await import("./account");
  const { useVila } = await import("../game/store");
  return { ...account, useVila };
}

/** Guest progress left in this browser: one mission event and one accepted quest. */
const guestProgress = () =>
  storage.set("vila.progress.v2", JSON.stringify({ ...EMPTY, seen: { "play-memory:win": true, "harness-bells:accept": true } }));

beforeEach(() => stubPage({ accounts: false, quests: false }));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("progress sync and quest events", () => {
  it("retains a pending batch after 409 and resends it after a reload before clearing it", async () => {
    stubPage({ accounts: true, quests: true });
    const queued = [{ missionId: "harness-bells", eventId: "accept" }];
    const saved = { ...EMPTY, counters: { "harness-bells": 0 }, seen: { "harness-bells:accept": true } };
    storage.set("vila.pending.v1:u1", JSON.stringify(queued));
    let ready = false;
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      if (path === "/progress/events" && init?.method === "POST") {
        posted.push(JSON.parse(String(init.body)).events);
        return Response.json(ready ? { progress: saved } : { error: "progress_conflict" }, { status: ready ? 200 : 409 });
      }
      return Response.json(path === "/config" ? { accounts: true, quests: true } :
        path === "/me" ? { user: USER } : { progress: ready ? saved : EMPTY });
    }));
    let page = await load();
    await page.initAccount();
    expect(page.useAccount.getState().sync).toBe("pending");
    expect(JSON.parse(storage.get("vila.pending.v1:u1")!)).toEqual(queued);

    ready = true;
    page = await load();
    await page.initAccount();
    expect(posted).toEqual([queued, queued]);
    expect(storage.get("vila.pending.v1:u1")).toBeUndefined();
    expect(page.useAccount.getState().sync).toBe("saved");
    expect(page.useVila.getState().progress).toEqual(saved);
  });

  it("sends guest quest events on sign-in", async () => {
    stubPage({ accounts: true });
    guestProgress();
    const { initAccount } = await load();
    await initAccount();
    expect(posted).toEqual([[{ missionId: "play-memory", eventId: "win" }, { missionId: "harness-bells", eventId: "accept" }]]);
  });

  it("queues and sends a new quest event while signed in", async () => {
    stubPage({ accounts: true });
    const { initAccount, useVila } = await load();
    await initAccount();
    useVila.setState({ progress: { ...EMPTY, seen: { "lake-lanterns:accept": true, "causes-global-donation:panel": true } } });
    await vi.waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toHaveLength(2);
    expect(posted[0]).toEqual(expect.arrayContaining([
      { missionId: "causes-global-donation", eventId: "panel" },
      { missionId: "lake-lanterns", eventId: "accept" },
    ]));
  });
});

describe("pending account erasure", () => {
  it("refreshes again when a pre-deletion account read was already in flight", async () => {
    stubPage({accounts:true,quests:false});
    const page=await load(); await page.initAccount();
    let release!:()=>void, reads=0;
    const paused=new Promise<void>((resolve)=>{release=resolve;});
    vi.stubGlobal("fetch",vi.fn(async (_url:string,init?:RequestInit)=>{
      if(init?.method==="POST") return new Response(JSON.stringify({error:"account_changed"}),{status:409});
      if(init?.method==="DELETE") return new Response(JSON.stringify({error:"internal"}),{status:500});
      if(++reads===1) { await paused; return new Response(JSON.stringify({user:{...USER,deletionPending:false}})); }
      return new Response(JSON.stringify({user:{...USER,deletionPending:true}}));
    }));
    await expect(page.api.updateMe(USER)).rejects.toMatchObject({code:"account_changed"});
    const deletion=page.deleteAccount();
    const rejected=expect(deletion).rejects.toMatchObject({code:"internal"});
    release(); await rejected;
    expect(reads).toBe(2);
    expect(page.useAccount.getState().user?.deletionPending).toBe(true);
  });

  it("refreshes the visible deletion state after storage failure and allows a later retry", async () => {
    stubPage({ accounts:true,quests:false });
    const page=await load();
    await page.initAccount();
    let pending=false, deleted=false;
    vi.stubGlobal("fetch",vi.fn(async (_url:string,init?:RequestInit)=>{
      if(init?.method==="DELETE") {
        if(!pending) { pending=true; return new Response(JSON.stringify({error:"internal"}),{status:500}); }
        deleted=true; return new Response(null,{status:204});
      }
      return new Response(JSON.stringify({user:deleted?null:{...USER,deletionPending:pending}}));
    }));
    await expect(page.deleteAccount()).rejects.toMatchObject({code:"internal"});
    expect(page.useAccount.getState().user).toMatchObject({id:USER.id,deletionPending:true});
    const {createElement}=await import("react");
    const {renderToStaticMarkup}=await import("react-dom/server");
    // Zustand's server snapshot is the initial signed-out state. Render the real component with the
    // current state produced by the failed DELETE, as the subscribed browser hook would observe it.
    vi.doMock("./account",()=>({...page,useAccount:(select:(state:ReturnType<typeof page.useAccount.getState>)=>unknown)=>select(page.useAccount.getState())}));
    const {Account}=await import("../ui/Account");
    const markup=renderToStaticMarkup(createElement(Account));
    vi.doUnmock("./account");
    expect(markup).toContain('data-state="deletion-pending"');
    expect(markup).toContain("Tentar concluir exclusão");
    expect(markup).toContain("a exclusão não pode ser cancelada");
    expect(markup).not.toContain("Confirmar exclusão");
    await page.deleteAccount();
    expect(page.useAccount.getState().user).toBeNull();
  });
});

describe("local account actions (#65)", () => {
  function localPage(guest = false) {
    let queue: Promise<unknown> = Promise.resolve();
    vi.stubGlobal("navigator", { locks: { request: (_: string, callback: () => void) => {
      const acquired = queue.then(callback);
      queue = acquired.catch(() => undefined);
      return acquired;
    } } });
    stubPage({ accounts: true, quests: true, localAccountActions: true });
    vi.stubGlobal("location", { hash: "", search: "", hostname: "localhost", pathname: "/" });
    if (guest) vi.stubGlobal("fetch", vi.fn(async (url: string) => Response.json(
      new URL(url).pathname === "/config" ? { accounts: true, quests: true, localAccountActions: true } : { user: null }
    )));
  }

  it("never applies the comparison on a public hostname, even with a misconfigured API", async () => {
    stubPage({ accounts: true, localAccountActions: true });
    const page = await load();
    await page.initAccount();
    expect(page.useVila.getState().localActor).toBeNull();
    page.useVila.getState().open({ kind: "memory" });
    expect(page.useVila.getState().panel.kind).toBe("memory");
  });

  it.each([
    ["staging", "https://play-staging.vilanoeldobem.com.br", true, true],
    ["staging", "https://play-staging.vilanoeldobem.com.br", false, false],
    ["development", "https://play-staging.vilanoeldobem.com.br", true, false],
    ["production", "https://play-staging.vilanoeldobem.com.br", true, false],
    ["staging", "http://play-staging.vilanoeldobem.com.br", true, false],
    ["staging", "https://play.vilanoeldobem.com.br", true, false],
    ["production", "https://play.vilanoeldobem.com.br", true, false],
  ])("checks the staging build, origin and API opt-in (%s, %s, %s)", async (mode, origin, flag, enabled) => {
    vi.stubEnv("MODE", String(mode));
    stubPage({ accounts: true, stagingAccountActions: flag, localAccountActions: true });
    vi.stubGlobal("location", new URL(String(origin)));
    const page = await load();
    await page.initAccount();
    expect(Boolean(page.useVila.getState().localActor)).toBe(enabled);
  });

  it("never invites a staging visitor to an unavailable account service", async () => {
    vi.stubEnv("MODE", "staging");
    stubPage({ accounts: false, stagingAccountActions: true });
    vi.stubGlobal("location", new URL("https://play-staging.vilanoeldobem.com.br"));
    const page = await load();
    await page.initAccount();
    expect(page.useVila.getState().localActor).toBeNull();
    page.useVila.getState().open({ kind: "memory" });
    expect(page.useVila.getState().panel.kind).toBe("memory");
  });

  it.each([true, false])("keeps exploration open while staging config is unreadable, then honors opt-in %s", async (enabled) => {
    vi.stubEnv("MODE", "staging");
    vi.stubGlobal("location", new URL("https://play-staging.vilanoeldobem.com.br"));
    const page = await load();
    const config = vi.spyOn(page.api, "config").mockRejectedValueOnce(new TypeError("Offline"))
      .mockResolvedValueOnce({} as Awaited<ReturnType<typeof page.api.config>>)
      .mockResolvedValue({ accounts: true, stagingAccountActions: enabled });
    vi.spyOn(page.api, "me").mockResolvedValue({ user: null });
    const state = page.useVila.getState;
    await page.initAccount();
    state().open({ kind: "lot", lotId: "plaza-01" });
    state().record("explore-gifts", "gift-bench");
    state().record("causes-visit-lot", "plaza-01");
    expect(state().panel.kind).toBe("lot");
    expect(state().progress.xp).toBe(0);
    expect(state().progress.seen["explore-gifts:gift-bench"]).toBe(true);
    state().claimMission("causes-visit-lot");
    expect(page.useAccount.getState().actionConfigUnavailable).toBe(true);
    await page.initAccount();
    expect(page.useAccount.getState().actionConfigUnavailable).toBe(true);
    await page.initAccount();
    expect(config).toHaveBeenCalledTimes(3);
    expect(page.useAccount.getState().actionConfigUnavailable).toBe(false);
    expect(state().panel.kind).toBe("none");
    expect(state().progress.seen["explore-gifts:gift-bench"]).toBe(true);
    expect(state().progress.xp).toBe(0);
    state().open({ kind: "memory" });
    expect(state().panel.kind).toBe(enabled ? "account" : "memory");
  });

  it("releases local exploration when the API switches the comparison off, even if session restoration is slow", async () => {
    localPage();
    let finish!: () => void;
    const slow = new Promise<void>(resolve => { finish = resolve; });
    const page = await load();
    vi.spyOn(page.api, "config").mockResolvedValue({ accounts:true, localAccountActions:false });
    vi.spyOn(page.api, "me").mockImplementation(async () => { await slow; return { user:null }; });
    const startup = page.initAccount();
    await Promise.resolve();
    expect(page.useAccount.getState()).toMatchObject({ configReady:true, ready:false });
    expect(page.useVila.getState().localActor).toBeNull();
    finish();
    await startup;
  });

  it("leaves exploration available and captures only mission completion, including the last narrative turn-in", async () => {
    localPage(true);
    const page = await load();
    await page.initAccount();
    const state = page.useVila.getState;
    state().open({ kind: "lot", lotId: "lot-01" });
    state().record("causes-visit-lot", "lot-01");
    expect(state().panel.kind).toBe("lot");
    expect(state().progress.xp).toBe(0);
    state().claimMission("causes-visit-lot");
    expect(state().panel).toEqual({ kind: "account", reason: "mission" });
    state().close();
    for (const event of ["accept", "bell-pine-north", "bell-pine-east", "turn-in"]) state().record("harness-bells", event);
    expect(state().panel).toEqual({ kind: "account", reason: "mission" });
    expect(state().progress.counters["harness-bells"]).toBe(2);
    expect(state().progress.seen["harness-bells:turn-in"]).toBeUndefined();
    expect(state().progress.xp).toBe(0);
  });

  it("validates the current account, recalculates a ready mission and credits it once", async () => {
    localPage();
    const page = await load();
    await page.initAccount();
    const state = page.useVila.getState;
    state().record("causes-visit-lot", "lot-01");
    page.useAccount.getState().setUser({ ...USER, id: "another" });
    state().claimMission("causes-visit-lot");
    expect(state().progress.xp).toBe(0);
    page.useAccount.getState().setUser(USER);
    state().claimMission("causes-visit-lot");
    state().claimMission("causes-visit-lot");
    expect(state().progress.xp).toBe(20);
    for (const event of ["accept", "bell-pine-north", "bell-pine-east", "turn-in", "turn-in"]) state().record("harness-bells", event);
    expect(state().progress.xp).toBe(40);
  });

  it("reserves persisted guest progress once across two already open tabs signing in as different accounts", async () => {
    localPage();
    guestProgress();
    const a = await load();
    const b = await load();
    expect(a.useVila.getState().progress.seen).toEqual(b.useVila.getState().progress.seen);
    let waiting = 0;
    let release!: () => void;
    const concurrent = new Promise<void>(resolve => { release = resolve; });
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      if (path === "/config") return Response.json({ accounts:true, quests:true, localAccountActions:true });
      if (path === "/me") return Response.json({ user:null });
      if (path === "/progress" && ++waiting < 2) await concurrent;
      else release();
      return Response.json({ progress:EMPTY });
    }));
    await Promise.all([a.initAccount(), b.initAccount()]);
    await Promise.all([a.signedIn(USER), b.signedIn({ ...USER, id:"other" })]);
    const counts = [a.useAccount.getState().localImportCount, b.useAccount.getState().localImportCount].sort();
    expect(counts).toEqual([0, 2]);
    expect([...storage.keys()].filter(k => k.startsWith("vila.local-import.v1:"))).toHaveLength(1);
    expect(posted).toEqual([]);
  });

  it("a stale visitor tab records only its new gesture after another tab reserved the old events", async () => {
    localPage(true);
    guestProgress();
    const a = await load();
    const b = await load();
    await Promise.all([a.initAccount(), b.initAccount()]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ progress: EMPTY })));
    await a.signedIn(USER);
    b.useVila.getState().record("explore-gifts","fresh");
    expect(b.useVila.getState().progress.seen).toEqual({ "explore-gifts:fresh":true });
    await b.signedIn({ ...USER, id:"other" });
    expect(JSON.parse(storage.get("vila.local-import.v1:other")!)).toEqual([{ missionId:"explore-gifts", eventId:"fresh" }]);
  });

  it("recovers an interrupted reservation for its original owner, even when the next login belongs to someone else", async () => {
    localPage(true);
    guestProgress();
    const a = await load();
    const b = await load();
    await Promise.all([a.initAccount(), b.initAccount()]);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ progress: EMPTY })));
    const write = vi.spyOn(localStorage, "setItem").mockImplementationOnce((key, value) => {
      // Source was atomically reserved. The next storage write, to A's holding queue, fails.
      storage.set(key, value);
      write.mockImplementationOnce(() => { throw new Error("unavailable"); });
    });
    await a.signedIn(USER);
    expect(a.useAccount.getState().sync).toBe("pending");
    await b.signedIn({ ...USER, id:"other" });
    expect(b.useAccount.getState().localImportCount).toBe(0);
    expect(JSON.parse(storage.get("vila.local-import.v1:u1")!)).toHaveLength(2);
    expect(storage.has("vila.local-import.v1:other")).toBe(false);
  });

  it("verifying a link does not credit a guest event that would complete a mission on this account", async () => {
    localPage();
    storage.set("vila.progress.v2", JSON.stringify({ ...EMPTY, counters: { "explore-gifts": 1 }, seen: { "explore-gifts:second": true } }));
    const first = { ...EMPTY, counters: { "explore-gifts": 1 }, seen: { "explore-gifts:first": true } };
    const done = { xp: 30, counters: { "explore-gifts": 2 }, completed: { "explore-gifts": true }, seen: { ...first.seen, "explore-gifts:second": true } };
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      const path = new URL(url).pathname;
      requests.push(path);
      if (path === "/auth/verify") return Response.json({ user: USER });
      if (path === "/config") return Response.json({ accounts: true, localAccountActions: true });
      return Response.json({ progress: path === "/progress/events" ? done : first });
    }));
    window.__vilaLoginToken = "local-test-link";
    const page = await load();
    await page.initAccount();
    expect(requests).toEqual(["/config", "/auth/verify", "/progress"]);
    expect(page.useVila.getState().progress.xp).toBe(0);
    expect(page.useVila.getState().panel.kind).toBe("none");
    expect(page.useAccount.getState().localImportCount).toBe(1);
    await page.confirmLocalImport("another");
    expect(requests).not.toContain("/progress/events");
    await page.confirmLocalImport(USER.id);
    expect(page.useVila.getState().progress.xp).toBe(30);
    await page.confirmLocalImport(USER.id);
    expect(requests.filter(path => path === "/progress/events")).toHaveLength(1);
  });
});
