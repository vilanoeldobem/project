import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { EMPTY_PROGRESS, MISSIONS } from "@vila/shared/game/progress";
import { GIFTS } from "@vila/shared/game/world";
import { database } from "./test-database";
import { handleApi, type Env } from "./api";

const api = "http://localhost:8787";
const page = "http://localhost:8799";
describe("account-owned canonical progress", () => {
  let store: ReturnType<typeof database>;
  let env: Env;
  let sessions: string[];
  let ids: string[];
  beforeEach(async () => {
    store = database();
    env = { DB: store.db, ENVIRONMENT: "development", AUTH_MODE: "local", AUTH_API_ORIGIN: api, AUTH_PAGE_ORIGIN: page, ALLOWED_ORIGINS: page };
    sessions = [];
    ids = [];
    for (let n = 0; n < 2; n++) {
      const response = await handleApi(new Request(`${api}/auth/request`, { method: "POST", headers: { Origin: page, "Content-Type": "application/json" }, body: JSON.stringify({ mode: "signup", name: "Test Person", nickname: `person_${n}`, city: "Test City", email: `person${n}@example.test` }) }), env);
      const browser = response.headers.get("Set-Cookie")!.split(";")[0];
      const row = store.sqlite.prepare("SELECT link FROM auth_local_outbox WHERE recipient = ?").get(`person${n}@example.test`)!;
      const confirm = await handleApi(new Request(`${api}/auth/confirm`, { method: "POST", headers: { Origin: page, "Content-Type": "application/json", Cookie: browser }, body: JSON.stringify({ token: new URL(String(row.link)).hash.slice(7) }) }), env);
      sessions.push(confirm.headers.get("Set-Cookie")!.split(";")[0]);
      ids.push(String(store.sqlite.prepare("SELECT id FROM auth_users WHERE nickname = ?").get(`person_${n}`)!.id));
    }
  });
  afterEach(() => store.sqlite.close());
  const call = (path = "", body?: unknown, who = 0, origin = page) => handleApi(new Request(`${api}/progress${path}`, {
    method: body === undefined ? "GET" : "POST", headers: { Origin: origin, Cookie: sessions[who] ?? "", "Content-Type": "application/json", "X-Account-ID": ids[who] ?? "" }, body: body === undefined ? undefined : JSON.stringify(body),
  }), env);
  const event = (missionId = "play-memory", eventId = "one") => ({ missionId, eventId });
  const state = async (who = 0) => (await (await call("", undefined, who)).json()) as { progress: typeof EMPTY_PROGRESS; revision: number; guestImported: boolean };

  it("uses session identity, isolates accounts and rejects missing, revoked and expired sessions", async () => {
    expect((await call("", undefined, 9)).status).toBe(401);
    await call("/events", event());
    expect((await state()).progress.xp).toBe(40);
    expect((await state(1)).progress.xp).toBe(0);
    expect((await call("/events", { ...event(), userId: "other" })).status).toBe(400);
    store.sqlite.exec("UPDATE auth_sessions SET expires_at = 0");
    expect((await call()).status).toBe(401);
    store.sqlite.exec("DELETE FROM auth_sessions");
    expect((await call("/events", event())).status).toBe(401);
  });

  it("rejects another tab's cookie change before writing to the new account", async () => {
    const response = await handleApi(new Request(`${api}/progress/events`, { method: "POST", headers: {
      Origin: page, Cookie: sessions[1], "Content-Type": "application/json", "X-Account-ID": ids[0],
    }, body: JSON.stringify(event()) }), env);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "account_changed" });
    expect(store.sqlite.prepare("SELECT COUNT(*) AS n FROM player_progress").get()!.n).toBe(0);
  });

  it("computes rewards, deduplicates retries and bounds concurrent mission completions", async () => {
    const responses = await Promise.all([call("/events", event()), call("/events", event()), call("/events", event("explore-gifts", GIFTS[0].id)), call("/events", event("explore-gifts", GIFTS[1].id))]);
    expect(responses.every((r) => r.ok)).toBe(true);
    const result = await state();
    expect(result.progress.xp).toBe(70);
    expect(result.progress.counters["explore-gifts"]).toBe(2);
    await call("/events", event("explore-gifts", GIFTS[2].id));
    expect((await state()).progress.xp).toBe(70);
    expect((await call("/events", { ...event(), xp: 9999 })).status).toBe(400);
    expect((await call("/events", event("missing"))).status).toBe(400);
    expect((await call("/events", event("play-memory", "x".repeat(129)))).status).toBe(400);
    expect((await call("/events", event("play-memory", "guest-import:0"))).status).toBe(400);
  });

  it("imports bounded counters once, merges with live events and computes the catalog XP ceiling", async () => {
    const counters = Object.fromEntries(MISSIONS.map((m) => [m.id, m.target]));
    await Promise.all([call("/import", { counters, giftIds: GIFTS.slice(0, 2).map((g) => g.id) }), call("/events", event()), call("/import", { counters, giftIds: GIFTS.slice(0, 2).map((g) => g.id) })]);
    const result = await state();
    expect(result.guestImported).toBe(true);
    expect(result.progress.xp).toBe(MISSIONS.reduce((sum, m) => sum + m.xp, 0));
    await call("/import", { counters: {} });
    expect((await state()).progress).toEqual(result.progress);
    expect((await state(1)).guestImported).toBe(false);
    expect(store.sqlite.prepare("SELECT COUNT(*) AS n FROM player_progress").get()!.n).toBe(2);
  });

  it("preserves partial guest gift identity so replay cannot complete the mission", async () => {
    const first = GIFTS[0].id;
    const imported = await call("/import", { counters: { "explore-gifts": 1 }, giftIds: [first] });
    expect(imported.ok).toBe(true);
    expect((await state()).progress.seen[`explore-gifts:${first}`]).toBe(true);
    await call("/events", event("explore-gifts", first));
    expect((await state()).progress.counters["explore-gifts"]).toBe(1);
    expect((await state()).progress.xp).toBe(0);
    await call("/events", event("explore-gifts", GIFTS[1].id));
    expect((await state()).progress.xp).toBe(30);
    expect((await call("/events", event("explore-gifts", "arbitrary"))).status).toBe(400);
  });

  it("rejects arbitrary state, invalid import counters and cross-origin writes", async () => {
    for (const counters of [{ unknown: 1 }, { "play-memory": 2 }, { "play-memory": -1 }, { "play-memory": 0.5 }, []]) expect((await call("/import", { counters, giftIds: GIFTS.slice(0, 2).map((g) => g.id) })).status).toBe(400);
    expect((await call("/import", { counters: {}, state: EMPTY_PROGRESS })).status).toBe(400);
    expect((await call("/events", event(), 0, "https://evil.test")).status).toBe(403);
    const response = await call();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true");
    expect((await response.json() as { progress: unknown }).progress).toEqual(EMPTY_PROGRESS);
    env.ENVIRONMENT = "production";
    expect((await call()).status).toBe(503);
  });
});
