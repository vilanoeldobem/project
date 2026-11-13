/**
 * Moderation mode and the blocked account on the client (IMPL-0021), on the real stores: who can turn the mode
 * on, what turns it off, the removal of a visitor from the ticket to the room's answer, and a blocked account
 * that syncs nothing. Runs in Node with a stubbed `fetch`, `WebSocket`, `localStorage` and `window`; modules are
 * re-imported per test because each test is a fresh page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PLAYER = { id: "u1", name: "Ana Lima", nickname: "ana_lima", city: "Recife", email: "ana@example.com", role: "player" as const };
const ADMIN = { ...PLAYER, id: "a1", nickname: "ana_admin", role: "admin" as const };
const BLOCK = { message: "Conta bloqueada por uso indevido do nickname.", at: "2026-11-12T13:00:00.000Z" };
const EMPTY = { xp: 0, counters: {}, completed: {}, seen: {} };
const TICKET = "abcdefghijklmnopqrstuvwxyzABCD_-";
const ALL_ON = { accounts: true, quests: false, files: true, withdrawal: true, moderation: { presence: true, block: true } };

type Me = typeof PLAYER | typeof ADMIN | (typeof PLAYER & { blocked: typeof BLOCK });
type Route = (init: RequestInit | undefined) => { status?: number; body: unknown } | undefined;

class FakeSocket {
  static readonly OPEN = 1;
  static all: FakeSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: ((ev: { code: number }) => void) | null = null;
  constructor(public url: string) {
    FakeSocket.all.push(this);
  }
  send(msg: string) {
    this.sent.push(msg);
  }
  close() {
    this.readyState = 3;
  }
  /** Welcomed as connection 7 of room 2, with visitor 9 standing at (1, 1). */
  welcome() {
    this.readyState = 1;
    this.onopen?.();
    this.onmessage?.({ data: '["w",7,2]' });
    this.onmessage?.({ data: `["s",${Date.now()},[[9,1,1,0,0,0]]]` });
  }
  say(data: string) {
    this.onmessage?.({ data });
  }
}

/** Every request the page made: "METHOD /path". */
let requests: string[];
let bodies: Record<string, unknown[]>;
let routes: Record<string, Route>;
let me: Me | null;
let storage: Map<string, string>;

function stubPage(user: Me | null, config: object = ALL_ON) {
  me = user;
  requests = [];
  bodies = {};
  routes = {};
  storage = new Map();
  FakeSocket.all = [];
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => storage.get(k) ?? null,
    setItem: (k: string, v: string) => void storage.set(k, v),
    removeItem: (k: string) => void storage.delete(k),
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { hidden: false }));
  vi.stubGlobal("location", { hash: "", search: "", hostname: "play.example", pathname: "/" });
  vi.stubGlobal("WebSocket", FakeSocket);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const path = new URL(url).pathname;
      const key = `${init?.method ?? "GET"} ${path}`;
      requests.push(key);
      if (init?.body) (bodies[key] ??= []).push(JSON.parse(String(init.body)));
      const answer = routes[key]?.(init) ?? { body: path === "/config" ? config : path === "/me" ? { user: me } : path.startsWith("/progress") ? { progress: EMPTY } : {} };
      return answer.status === 204 ? new Response(null, { status: 204 }) : new Response(JSON.stringify(answer.body), { status: answer.status ?? 200 });
    })
  );
}

/** A fresh page load, signed in as whoever `/me` answers. */
async function load() {
  vi.resetModules();
  const account = await import("./account");
  const moderation = await import("./moderation");
  const net = await import("../net/multiplayer");
  const { useVila } = await import("../game/store");
  await account.initAccount();
  return { ...account, ...moderation, ...net, useVila, mode: () => moderation.useModeration.getState() };
}

/** A click ray that passes through the avatar standing at (x, z). */
const rayAt = (x: number, z: number) => [{ x, y: 10, z: z + 10 }, { x: 0, y: -1, z: -1 }] as const;
/** Lets the pending requests and their continuations run (no time passes). */
const flush = async () => {
  for (let i = 0; i < 5; i++) await vi.advanceTimersByTimeAsync(0);
};
const adminCalls = () => requests.filter((r) => r.includes("/admin/"));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-12T15:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("who gets moderation mode", () => {
  it("is off on every page load, administrator included", async () => {
    stubPage(ADMIN);
    const page = await load();
    expect(page.canModerate(page.useAccount.getState().user)).toBe(true);
    expect(page.mode()).toMatchObject({ on: false, selected: null, askedAt: null });
    expect(adminCalls()).toEqual([]); // and nothing is read from the admin API by loading the page
  });

  it("cannot be turned on by a signed-out visitor or a non-admin account, whatever the store is told", async () => {
    for (const user of [null, PLAYER]) {
      stubPage(user);
      const page = await load();
      const disconnect = page.connectPresence();
      FakeSocket.all[0].welcome();
      page.mode().setOn(true);
      expect([user?.role, page.mode().on]).toEqual([user?.role, false]);
      expect(page.moderating(page.useAccount.getState().user, true)).toBe(false);
      // Even with the flag forced into the store, no action exists for this account.
      page.useModeration.setState({ on: true });
      expect(page.selectVisitorAt(...rayAt(1, 1))).toBe(false);
      page.mode().select(9);
      page.mode().ask();
      await page.mode().confirm();
      expect(page.mode()).toMatchObject({ selected: null, askedAt: null, sending: false, notice: null });
      expect(adminCalls()).toEqual([]);
      expect(FakeSocket.all[0].sent.filter((m) => m.startsWith('["m"'))).toEqual([]);
      disconnect();
    }
  });

  it("is turned on and off by an administrator", async () => {
    stubPage(ADMIN);
    const page = await load();
    page.mode().setOn(true);
    expect(page.mode().on).toBe(true);
    page.mode().setOn(false);
    expect(page.mode().on).toBe(false);
  });

  it("goes off when the administrator signs out", async () => {
    stubPage(ADMIN);
    const page = await load();
    page.mode().setOn(true);
    await page.signOut();
    expect(page.mode().on).toBe(false);
    page.mode().setOn(true);
    expect(page.mode().on).toBe(false);
  });

  it("goes off when an admin call answers 403 admin_only (the role was taken away)", async () => {
    stubPage(ADMIN);
    const page = await load();
    page.mode().setOn(true);
    me = { ...ADMIN, role: "player" };
    routes["GET /admin/applications/x"] = () => ({ status: 403, body: { error: "admin_only" } });
    await expect(page.api.adminApplication("x")).rejects.toMatchObject({ code: "admin_only" });
    await flush();
    expect(page.useAccount.getState().user?.role).toBe("player");
    expect(page.mode().on).toBe(false);
  });

  it("goes off when the session ended somewhere else: a 401 not_signed_in re-reads /me once and the page is signed out", async () => {
    stubPage(ADMIN);
    const page = await load();
    const disconnect = page.connectPresence();
    FakeSocket.all[0].welcome();
    page.mode().setOn(true);
    // Signed out in another tab (or the session was ended): every account route now answers 401.
    me = null;
    routes["POST /admin/moderation/ticket"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    routes["GET /admin/applications/x"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    page.mode().select(9);
    page.mode().ask();
    await vi.advanceTimersByTimeAsync(700);
    await page.mode().confirm();
    await flush();
    expect(page.useAccount.getState().user).toBeNull();
    expect(page.mode()).toMatchObject({ on: false, selected: null, askedAt: null, sending: false, notice: null });
    expect(page.useVila.getState().toast?.text).toBe("Sua sessão terminou. Entre de novo.");
    expect(page.SESSION_ENDED_NOTICE).toBe("Sua sessão terminou. Entre de novo.");
    page.mode().setOn(true);
    expect(page.mode().on).toBe(false);
    // Signed out now: more refusals read nothing again.
    const reads = () => requests.filter((r) => r === "GET /me").length;
    expect(reads()).toBe(2); // the page load, and the one re-read
    await expect(page.api.adminApplication("x")).rejects.toMatchObject({ code: "not_signed_in" });
    await flush();
    expect(reads()).toBe(2);
    disconnect();
  });

  it("is refused to a blocked administrator account", async () => {
    stubPage({ ...ADMIN, blocked: BLOCK } as Me);
    const page = await load();
    page.mode().setOn(true);
    expect(page.mode().on).toBe(false);
  });
});

describe("removing a visitor from the room (PROPOSTA)", () => {
  async function room(config: object = ALL_ON) {
    stubPage(ADMIN, config);
    routes["POST /admin/moderation/ticket"] = () => ({ body: { ticket: TICKET, expiresAt: "2026-11-12T15:00:30.000Z" } });
    const page = await load();
    const disconnect = page.connectPresence();
    const socket = FakeSocket.all[0];
    socket.welcome();
    return { page, socket, disconnect, removals: () => socket.sent.filter((m) => m.startsWith('["m"')) };
  }

  it("does nothing while moderation mode is off: a click on a visitor still walks", async () => {
    const { page, removals, disconnect } = await room();
    expect(page.selectVisitorAt(...rayAt(1, 1))).toBe(false);
    page.mode().select(9);
    page.mode().ask();
    await page.mode().confirm();
    expect(page.mode()).toMatchObject({ selected: null, askedAt: null });
    expect(adminCalls()).toEqual([]);
    expect(removals()).toEqual([]);
    disconnect();
  });

  it("is not offered when /config says moderation.presence is off", async () => {
    const { page, removals, disconnect } = await room({ ...ALL_ON, moderation: { presence: false, block: true } });
    page.mode().setOn(true);
    expect(page.useAccount.getState().presenceModeration).toBe(false);
    expect(page.selectVisitorAt(...rayAt(1, 1))).toBe(false);
    page.mode().select(9);
    expect(page.mode().selected).toBeNull();
    expect(adminCalls()).toEqual([]);
    expect(removals()).toEqual([]);
    disconnect();
  });

  it("in moderation mode a click on a visitor selects it, and a click on empty ground does not", async () => {
    const { page, disconnect } = await room();
    page.mode().setOn(true);
    expect(page.selectVisitorAt(...rayAt(5, 5))).toBe(false); // the scene then walks there
    expect(page.mode().selected).toBeNull();
    expect(page.selectVisitorAt(...rayAt(1, 1))).toBe(true);
    expect(page.mode().selected).toBe(9);
    expect(adminCalls()).toEqual([]); // selecting asks nothing of the API
    disconnect();
  });

  it("sends nothing before the confirmation, then ticket → message → answer, and says removed only on ok: true", async () => {
    const { page, socket, removals, disconnect } = await room();
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((level) => vi.spyOn(console, level).mockImplementation(() => undefined));
    page.mode().setOn(true);
    page.mode().selectNext(); // the keyboard way: the nearest visitor
    expect(page.mode().selected).toBe(9);
    await page.mode().confirm(); // not asked yet: nothing happens
    expect(adminCalls()).toEqual([]);
    page.mode().ask();
    expect(page.mode().askedAt).toBe(Date.now());
    expect(adminCalls()).toEqual([]);
    expect(removals()).toEqual([]);

    const done = page.mode().confirm();
    expect(page.mode()).toMatchObject({ sending: true, askedAt: null });
    await flush();
    expect(bodies["POST /admin/moderation/ticket"]).toEqual([{ accountId: "a1", room: 2, target: 9 }]);
    expect(removals()).toEqual([`["m",9,"${TICKET}"]`]);
    expect(page.mode().notice).toBeNull(); // no "removido" before the room says so
    socket.say('["l",9]');
    socket.say('["m",9,1]');
    await done;
    expect(page.mode()).toMatchObject({ sending: false, selected: null, notice: { ok: true, text: "Visitante nº 9 removido da sala." } });
    // The ticket is nowhere: not in any store, not in storage, not in a log.
    const everything = JSON.stringify([page.mode(), page.useAccount.getState(), page.useVila.getState().toast, [...storage]]);
    expect(everything).not.toContain(TICKET);
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    disconnect();
  });

  it("says it could not remove, never 'removido', when the room answers ok: false", async () => {
    const { page, socket, disconnect } = await room();
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    const done = page.mode().confirm();
    await flush();
    socket.say('["m",9,0]');
    await done;
    const notice = page.mode().notice!;
    expect(notice.ok).toBe(false);
    expect(notice.text).toMatch(/^Não foi possível remover agora\./);
    expect(notice.text).not.toContain("removido da sala");
    expect(page.mode().selected).toBe(9); // still there: the administrator may try again
    disconnect();
  });

  it("treats 5 s without an answer as a failure", async () => {
    const { page, disconnect } = await room();
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    const done = page.mode().confirm();
    await vi.advanceTimersByTimeAsync(5_000);
    await done;
    expect(page.mode().notice).toEqual({ ok: false, text: "Não foi possível remover agora. A sala não respondeu a tempo." });
    disconnect();
  });

  it("gives the API's reason when the ticket is refused, and sends nothing to the room", async () => {
    const cases: Array<[number, string, string]> = [
      [429, "too_many_requests", "Não foi possível remover agora. Muitas tentativas seguidas. Espere um minuto e tente de novo."],
      [404, "not_found", "Não foi possível remover agora. A remoção de visitantes está desligada."],
      [403, "admin_only", "Não foi possível remover agora. Esta ação é só para administradores. Seu papel pode ter mudado; atualize a página."],
    ];
    for (const [status, error, text] of cases) {
      const { page, removals, disconnect } = await room();
      routes["POST /admin/moderation/ticket"] = () => ({ status, body: { error } });
      page.mode().setOn(true);
      page.mode().select(9);
      page.mode().ask();
      await page.mode().confirm();
      expect([error, page.mode().notice]).toEqual([error, { ok: false, text }]);
      expect(removals()).toEqual([]);
      expect(page.removalText(9, { ok: false, reason: "ticket", error: new page.ApiError(status, error) })).toBe(text);
      disconnect();
    }
  });

  it("is single flight: a second confirmation while one waits sends no second ticket or message", async () => {
    const { page, socket, removals, disconnect } = await room();
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    const first = page.mode().confirm();
    await flush();
    page.mode().ask();
    await page.mode().confirm();
    page.mode().select(null); // nor can the selection change under it
    expect(page.mode().selected).toBe(9);
    expect(bodies["POST /admin/moderation/ticket"]).toHaveLength(1);
    expect(removals()).toHaveLength(1);
    socket.say('["m",9,1]');
    await first;
    disconnect();
  });

  it("drops the result of a removal sent before the mode was switched off and on: the open confirmation keeps naming the visitor it was opened for", async () => {
    const { page, socket, removals, disconnect } = await room();
    socket.say(`["s",${Date.now()},[[9,1,1,0,0,0],[8,5,5,0,0,0]]]`);
    let release!: (answer: { status?: number; body: unknown }) => void;
    const held = new Promise<{ status?: number; body: unknown }>((resolve) => (release = resolve));
    let answer: { status?: number; body: unknown } | undefined;
    // The ticket request of the first removal hangs (slow network), then fails.
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const key = `${init?.method ?? "GET"} ${new URL(url).pathname}`;
        requests.push(key);
        if (key === "POST /admin/moderation/ticket") {
          if (init?.body) (bodies[key] ??= []).push(JSON.parse(String(init.body)));
          const now = answer ?? (await held);
          return new Response(JSON.stringify(now.body), { status: now.status ?? 200 });
        }
        return new Response(JSON.stringify({ user: ADMIN }), { status: 200 });
      })
    );
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    await vi.advanceTimersByTimeAsync(700);
    const first = page.mode().confirm();
    await flush();
    expect(page.mode()).toMatchObject({ selected: 9, sending: true });

    // Stuck on "Removendo…", the administrator switches the mode off and on and picks another visitor.
    page.mode().setOn(false);
    page.mode().setOn(true);
    page.mode().select(8);
    page.mode().ask();
    const asked = page.mode().askedAt;
    expect(page.mode()).toMatchObject({ selected: 8, sending: false });
    expect(asked).not.toBeNull(); // on screen: "Remover o visitante nº 8 da sala?"
    await vi.advanceTimersByTimeAsync(700); // and armed

    // Now the old request fails. Its result is about a screen that is gone: nothing changes, nothing is said.
    release({ status: 429, body: { error: "too_many_requests" } });
    await first;
    await flush();
    expect(page.mode()).toMatchObject({ selected: 8, askedAt: asked, sending: false, notice: null });
    expect(page.useVila.getState().toast).toBeNull();

    // One click on the armed confirmation removes the visitor it names, nobody else.
    answer = { body: { ticket: TICKET, expiresAt: "2026-11-12T15:00:30.000Z" } };
    const second = page.mode().confirm();
    await flush();
    await vi.advanceTimersByTimeAsync(1_200);
    expect(bodies["POST /admin/moderation/ticket"]).toEqual([
      { accountId: "a1", room: 2, target: 9 },
      { accountId: "a1", room: 2, target: 8 },
    ]);
    expect(removals()).toEqual([`["m",8,"${TICKET}"]`]);
    socket.say('["m",8,1]');
    await second;
    expect(page.mode().notice).toEqual({ ok: true, text: "Visitante nº 8 removido da sala." });
    disconnect();
  });

  it("drops a late success too, and the result of a removal sent by an account that is no longer here", async () => {
    const { page, socket, disconnect } = await room();
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    const first = page.mode().confirm();
    await flush();
    page.mode().setOn(false);
    page.mode().setOn(true);
    socket.say('["m",9,1]');
    await first;
    expect(page.mode()).toMatchObject({ on: true, selected: null, askedAt: null, sending: false, notice: null });

    socket.say(`["s",${Date.now()},[[11,2,2,0,0,0]]]`);
    page.mode().select(11);
    page.mode().ask();
    await vi.advanceTimersByTimeAsync(1_200);
    const second = page.mode().confirm();
    await flush();
    await page.signOut();
    socket.say('["m",11,0]');
    await second;
    expect(page.mode()).toMatchObject({ on: false, selected: null, askedAt: null, sending: false, notice: null });
    disconnect();
  });

  it("closes the confirmation whenever the selection changes: the visitor it names cannot be swapped under it", async () => {
    const { page, socket, disconnect } = await room();
    socket.say(`["s",${Date.now()},[[9,1,1,0,0,0],[8,5,5,0,0,0]]]`);
    page.mode().setOn(true);
    const open = () => {
      page.mode().select(9);
      page.mode().ask();
      expect(page.mode()).toMatchObject({ selected: 9, askedAt: Date.now() });
    };
    const changes: Array<[string, () => unknown, number | null]> = [
      ["another visitor is picked", () => page.mode().select(8), 8],
      ["the next visitor is picked", () => page.mode().selectNext(), 8],
      ["a click picks another visitor", () => page.selectVisitorAt(...rayAt(5, 5)), 8],
      ["the selection is cleared", () => page.mode().select(null), null],
      ["the visitor leaves", () => socket.say('["l",9]'), null],
    ];
    for (const [what, change, selected] of changes) {
      open();
      change();
      expect([what, page.mode().selected, page.mode().askedAt]).toEqual([what, selected, null]);
      await page.mode().confirm(); // nothing is armed: nothing is sent
      expect([what, adminCalls()]).toEqual([what, []]);
      socket.say(`["s",${Date.now()},[[9,1,1,0,0,0]]]`); // visitor 9 is (back) in the room for the next case
    }
    disconnect();
  });

  it("tells a visitor who left before the message was sent, and a ticket the API did not answer in time", async () => {
    const { page, socket, removals, disconnect } = await room();
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (new URL(url).pathname === "/admin/moderation/ticket") {
          await Promise.race([held, new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))]);
        }
        return original(url, init);
      })
    );
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    const first = page.mode().confirm();
    await flush();
    socket.say('["l",9]');
    release();
    await first;
    expect(page.mode()).toMatchObject({ selected: null, sending: false, notice: { ok: false, text: "O visitante nº 9 já saiu da sala: nenhum pedido de remoção foi enviado." } });
    expect(removals()).toEqual([]);
    expect(page.removalText(9, { ok: false, reason: "ticket_timeout" })).toBe("Não foi possível remover agora. A Vila não respondeu a tempo; nada foi enviado à sala.");
    expect(page.removalText(9, { ok: false, reason: "waiting" })).toBe("Não foi possível remover agora. A sala ainda não respondeu ao pedido anterior; espere a resposta antes de tentar de novo.");
    expect(page.removalText(9, { ok: false, reason: "limit" })).toBe("Não foi possível remover agora. Você chegou ao limite de remoções por minuto; espere um pouco.");
    disconnect();
  });

  it("gives up a ticket request that hangs: the request is aborted and the controls come back", async () => {
    const { page, removals, disconnect } = await room();
    const signals: AbortSignal[] = [];
    const original = fetch;
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string, init?: RequestInit) => {
        if (new URL(url).pathname !== "/admin/moderation/ticket") return original(url, init);
        requests.push("POST /admin/moderation/ticket");
        signals.push(init!.signal!);
        return new Promise((_, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))));
      })
    );
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    const done = page.mode().confirm();
    await vi.advanceTimersByTimeAsync(4_999);
    expect(page.mode().sending).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await done;
    expect(signals.map((signal) => signal.aborted)).toEqual([true]);
    expect(page.mode()).toMatchObject({ selected: 9, sending: false, notice: { ok: false, text: "Não foi possível remover agora. A Vila não respondeu a tempo; nada foi enviado à sala." } });
    expect(removals()).toEqual([]);
    disconnect();
  });

  it("drops the selection when the visitor leaves or the connection ends", async () => {
    const { page, socket, disconnect } = await room();
    page.mode().setOn(true);
    page.mode().select(9);
    page.mode().ask();
    socket.say('["l",9]');
    expect(page.mode()).toMatchObject({ selected: null, askedAt: null, notice: { ok: false, text: "O visitante nº 9 saiu da sala." } });
    socket.say(`["s",${Date.now()},[[11,2,2,0,0,0]]]`);
    page.mode().select(11);
    disconnect();
    expect(page.mode().selected).toBeNull();
  });
});

describe("blocked account (PROPOSTA)", () => {
  const blocked = { ...PLAYER, blocked: BLOCK };
  const event = { ...EMPTY, seen: { "play-memory:win": true as const } };

  it("signs in to the restricted state: the message is there, nothing is synced", async () => {
    stubPage(blocked);
    storage.set("vila.progress.v2", JSON.stringify(event)); // guest progress in this browser
    storage.set("vila.pending.v1:u1", JSON.stringify([{ missionId: "play-memory", eventId: "win" }]));
    const page = await load();
    expect(page.useAccount.getState().user?.blocked).toEqual(BLOCK);
    expect(page.useAccount.getState().sync).toBe("saved");
    expect(requests).toEqual(["GET /config", "GET /me"]); // no /progress, no application, no files
    expect(page.useVila.getState().progressOwner).toBeNull();
    // Playing goes on as a guest: a new event stays in this browser and is not sent.
    page.useVila.getState().record("causes-visit-lot", "plaza-01");
    window.dispatchEvent(new Event("online"));
    await flush();
    expect(requests).toEqual(["GET /config", "GET /me"]);
    expect(storage.get("vila.pending.v1:u1")).toBeDefined(); // kept for when the block is lifted
  });

  it("reaches the same state from a 403 session_blocked on any route, and stops syncing", async () => {
    stubPage(PLAYER);
    const page = await load();
    expect(page.useVila.getState().progressOwner).toBe("u1");
    const before = requests.length;

    // The block is recorded while the page is open: the next write is refused.
    me = blocked;
    routes["POST /progress/events"] = () => ({ status: 403, body: { error: "session_blocked" } });
    routes["GET /progress"] = () => ({ status: 403, body: { error: "session_blocked" } });
    page.useVila.setState({ progress: event });
    await flush();
    expect(page.useAccount.getState().user?.blocked).toEqual(BLOCK);
    expect(page.useAccount.getState().sync).toBe("saved"); // not an error left on screen
    expect(page.useVila.getState().progressOwner).toBeNull();
    expect(page.useVila.getState().toast?.text).toBe("Sua conta está bloqueada pela administração. Abra a conta para ler a mensagem.");

    // From here on nothing is sent: not for new events, not when the connection comes back.
    const after = requests.length;
    expect(requests.slice(before)).toContain("GET /me");
    page.useVila.getState().record("causes-visit-lot", "plaza-02");
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(requests).toHaveLength(after);
  });

  it("a session ended by the block (401 not_signed_in on an open page) signs the page out: nothing stays pending, nothing is retried", async () => {
    stubPage(PLAYER);
    const page = await load();
    expect(page.useVila.getState().progressOwner).toBe("u1");
    // The block deleted the sessions of the account: the cookie of this page is worth nothing now.
    me = null;
    routes["GET /progress"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    routes["POST /progress/events"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    page.useVila.getState().record("causes-visit-lot", "plaza-01");
    await flush();
    expect(page.useAccount.getState()).toMatchObject({ user: null, sync: "saved" });
    expect(page.useVila.getState().progressOwner).toBeNull();
    expect(page.useVila.getState().toast?.text).toBe("Sua sessão terminou. Entre de novo.");
    expect(storage.get("vila.pending.v1:u1")).toBeDefined(); // kept for the next sign-in of this account
    const after = requests.length;
    page.useVila.getState().record("causes-visit-lot", "plaza-02");
    window.dispatchEvent(new Event("online"));
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(requests).toHaveLength(after);
  });

  it("shows the block when /me still knows the account after a 401 (the session survived, the account is blocked)", async () => {
    stubPage(PLAYER);
    const page = await load();
    me = blocked;
    routes["GET /progress"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    page.useVila.getState().record("causes-visit-lot", "plaza-01");
    await flush();
    expect(page.useAccount.getState().user?.blocked).toEqual(BLOCK);
    expect(page.useAccount.getState().sync).toBe("saved");
    expect(page.useVila.getState().toast?.text).toBe("Sua conta está bloqueada pela administração. Abra a conta para ler a mensagem.");
  });

  it("does not loop when the API contradicts itself (401 not_signed_in while /me still answers the account): one re-read, then at most one a minute", async () => {
    stubPage(ADMIN);
    const page = await load();
    page.mode().setOn(true);
    routes["GET /admin/applications/x"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    routes["GET /progress"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    const reads = () => requests.filter((r) => r === "GET /me").length;
    expect(reads()).toBe(1);
    for (let i = 0; i < 5; i++) {
      await expect(page.api.adminApplication("x")).rejects.toMatchObject({ code: "not_signed_in" });
      page.useVila.getState().record("causes-visit-lot", `plaza-0${i + 1}`);
      await flush();
    }
    expect(reads()).toBe(2);
    // Nothing was decided on a contradiction: the account and the mode stay, and no session notice is shown.
    expect(page.useAccount.getState().user?.id).toBe("a1");
    expect(page.mode().on).toBe(true);
    expect(page.useVila.getState().toast?.text ?? "").not.toMatch(/sessão|conta/);
    await vi.advanceTimersByTimeAsync(page.SESSION_RECHECK_MS - 1);
    await expect(page.api.adminApplication("x")).rejects.toMatchObject({ code: "not_signed_in" });
    await flush();
    expect(reads()).toBe(2);
    // A session that really ends later is still noticed.
    await vi.advanceTimersByTimeAsync(1);
    me = null;
    await expect(page.api.adminApplication("x")).rejects.toMatchObject({ code: "not_signed_in" });
    await flush();
    expect(reads()).toBe(3);
    expect(page.useAccount.getState().user).toBeNull();
    expect(page.mode().on).toBe(false);
  });

  it("reads nothing again for a 401 while nobody is signed in on the page", async () => {
    stubPage(null);
    const page = await load();
    routes["GET /ngo/application"] = () => ({ status: 401, body: { error: "not_signed_in" } });
    await expect(page.api.application()).rejects.toMatchObject({ code: "not_signed_in" });
    await flush();
    expect(requests).toEqual(["GET /config", "GET /me", "GET /ngo/application"]);
    expect(page.useVila.getState().toast).toBeNull();
  });

  it("also from a refused application read", async () => {
    stubPage(PLAYER);
    const page = await load();
    me = blocked;
    routes["GET /ngo/application"] = () => ({ status: 403, body: { error: "session_blocked" } });
    await expect(page.api.application()).rejects.toMatchObject({ code: "session_blocked" });
    await flush();
    expect(page.useAccount.getState().user?.blocked).toEqual(BLOCK);
    expect(page.useVila.getState().progressOwner).toBeNull();
  });

  it("still signs out and deletes the account", async () => {
    stubPage(blocked);
    let page = await load();
    await page.signOut();
    expect(requests).toContain("POST /auth/logout");
    expect(page.useAccount.getState().user).toBeNull();

    stubPage(blocked);
    page = await load();
    routes["DELETE /me"] = () => ({ status: 204, body: null });
    await page.deleteAccount();
    expect(requests).toContain("DELETE /me");
    expect(page.useAccount.getState().user).toBeNull();
    expect(storage.get("vila.pending.v1:u1")).toBeUndefined();
  });

  it("resumes syncing when the block is lifted while the page is open", async () => {
    stubPage(blocked);
    const page = await load();
    me = PLAYER;
    routes["POST /me"] = () => ({ status: 409, body: { error: "account_changed" } }); // any refusal that re-reads /me
    await expect(page.api.updateMe(PLAYER)).rejects.toMatchObject({ code: "account_changed" });
    await flush();
    expect(page.useAccount.getState().user?.blocked).toBeUndefined();
    expect(requests).toContain("GET /progress");
    expect(page.useVila.getState().progressOwner).toBe("u1");
  });
});
