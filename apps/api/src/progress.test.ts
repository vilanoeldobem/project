import { beforeEach, describe, expect, it, vi } from "vitest";

import { levelOf, type Progress } from "@vila/shared/game/progress";
import { createD1 } from "../test/d1.mjs";
import { handleApi, type Env } from "./api";
import { sha256Hex } from "./crypto";

type Event = { missionId: string; eventId: string };
const ORIGIN = "https://play.example";
const quest = (eventId: string, missionId = "harness-bells"): Event => ({ missionId, eventId });
const mission = (missionId = "play-memory", eventId = "win"): Event => ({ missionId, eventId });
let db: ReturnType<typeof createD1>;
let env: Env;

const post = (events: Event[], token = "owner-one", accountId = "owner") => handleApi(new Request("https://api.example/progress/events", {
  method: "POST", headers: { Origin: ORIGIN, Cookie: `__Host-vila_session=${token}`, "Content-Type": "application/json" },
  body: JSON.stringify({ accountId, events }),
}), env);
const get = (token = "owner-one") => handleApi(new Request("https://api.example/progress", {
  headers: { Origin: ORIGIN, Cookie: `__Host-vila_session=${token}` },
}), env);
const progress = async (token?: string) => (await (await get(token)).json() as { progress: Progress }).progress;

/** Hold one request before its transaction, while another session commits against the same snapshot. */
function pauseNextBatch() {
  const original = db.batch.bind(db);
  let enter!: () => void, release!: () => void, paused = false;
  const entered = new Promise<void>((resolve) => { enter = resolve; });
  const held = new Promise<void>((resolve) => { release = resolve; });
  db.batch = async (statements) => {
    if (!paused) { paused = true; enter(); await held; }
    return original(statements);
  };
  return { entered, release };
}

beforeEach(async () => {
  db = createD1();
  env = { DB: db, ALLOWED_ORIGINS: ORIGIN, ACCOUNTS_ENABLED: "true", QUESTS_V1_ENABLED: "true" };
  for (const id of ["owner", "other"]) {
    await db.prepare("INSERT INTO users(id,name,nickname,nickname_key,city,email,verified_at) VALUES(?,?,?,?,?,?,?)")
      .bind(id, id, id, id, "Recife", `${id}@example.invalid`, "2026-01-01").run();
  }
  for (const [token, owner] of [["owner-one", "owner"], ["owner-two", "owner"], ["other", "other"]])
    await db.prepare("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)")
      .bind(await sha256Hex(token), owner, "2099-01-01").run();
});

describe("saved progress across sessions", () => {
  it("recovers missions, XP and level through a different session and idempotent resend", async () => {
    const chain = [quest("accept"), quest("bell-pine-north"), quest("bell-pine-east"), quest("turn-in"),
      quest("accept", "route-memory-game"), quest("memory-win", "route-memory-game"), quest("turn-in", "route-memory-game"),
      quest("accept", "charm-for-the-flight"), quest("turn-in", "charm-for-the-flight")];
    expect((await post(chain)).status).toBe(200);
    const saved = await progress("owner-two");
    expect(saved.xp).toBe(100); expect(levelOf(saved.xp)).toBe(2);
    expect(saved.completed["charm-for-the-flight"]).toBe(true);
    expect((await post(chain, "owner-two")).status).toBe(200);
    expect(await progress()).toEqual(saved);
    expect(db.sql("SELECT * FROM progress_events WHERE user_id='owner'")).toHaveLength(chain.length);
  });

  it("returns authoritative progress while omitting an inapplicable quest event", async () => {
    const early = await post([quest("bell-pine-north")]);
    expect(early.status).toBe(200);
    expect(early.headers.get("Cache-Control")).toBe("no-store");
    expect((await progress()).seen).toEqual({});
    expect((await post([quest("accept")])).status).toBe(200);
    expect((await post([quest("bell-pine-north")])).status).toBe(200);
    expect((await progress()).counters["harness-bells"]).toBe(1);
  });

  it("commits valid events in a mixed batch and safely handles an explicit resend", async () => {
    const events = [quest("bell-pine-north"), quest("accept"), mission()];
    expect((await post(events)).status).toBe(200);
    expect((await progress()).seen).toEqual({ "harness-bells:accept": true, "play-memory:win": true });
    expect((await post(events)).status).toBe(200);
    const saved = await progress();
    expect(saved.counters["harness-bells"]).toBe(1); expect(saved.xp).toBe(40);
    expect(db.sql("SELECT * FROM progress_events")).toHaveLength(3);
  });

  it("acknowledges harmless earlier no-ops after the same batch completes their quest", async () => {
    expect((await post([quest("turn-in"), quest("accept"), quest("bell-pine-north"), quest("bell-pine-east"), quest("turn-in")])).status).toBe(200);
    expect((await progress()).xp).toBe(20);
    expect((await post([quest("accept"), quest("bell-pine-north"), quest("turn-in")])).status).toBe(200);
    expect((await progress()).xp).toBe(20);
  });

  it("keeps another account and a stale account assertion isolated", async () => {
    expect((await post([mission()])).status).toBe(200);
    expect((await progress("other")).xp).toBe(0);
    expect((await post([mission()], "other", "owner")).status).toBe(409);
    expect((await progress("other")).xp).toBe(0);
    expect((await get("missing")).status).toBe(401);
  });

  it("counts only new unique stored events at the account limit", async () => {
    for (let i = 0; i < 499; i++)
      db.sql("INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','legacy',?)", `old-${i}`);
    expect((await post([mission(), mission(), mission()])).status).toBe(200);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events WHERE user_id='owner'")[0].n).toBe(500);
    expect((await post([mission()])).status).toBe(200);
    expect((await post([mission("causes-global-donation", "panel")])).status).toBe(429);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events WHERE user_id='owner'")[0].n).toBe(500);
  });

  it("never moves a delayed duplicate accept after an objective saved by another session", async () => {
    const gate = pauseNextBatch();
    const delayed = post([quest("accept")]);
    await gate.entered;
    try {
      expect((await post([quest("accept")], "owner-two")).status).toBe(200);
      expect((await post([quest("bell-pine-north")], "owner-two")).status).toBe(200);
    } finally { gate.release(); }
    expect((await delayed).status).toBe(200);
    const saved = await progress();
    expect(saved.seen["harness-bells:accept"]).toBe(true);
    expect(saved.seen["harness-bells:bell-pine-north"]).toBe(true);
    expect(saved.counters["harness-bells"]).toBe(1);
    expect(db.sql("SELECT event_id FROM progress_events ORDER BY created_at,rowid").map((r) => r.event_id)).toEqual(["accept", "bell-pine-north"]);
  });

  it("does not persist two competing active quests from the same stale snapshot", async () => {
    const gate = pauseNextBatch();
    const delayed = post([quest("accept")]);
    await gate.entered;
    try { expect((await post([quest("accept", "lake-lanterns")], "owner-two")).status).toBe(200); }
    finally { gate.release(); }
    expect((await delayed).status).toBe(200);
    expect(db.sql("SELECT mission_id FROM progress_events")).toEqual([{ mission_id: "lake-lanterns" }]);
    expect((await progress()).seen).toEqual({ "lake-lanterns:accept": true });
  });

  it("revalidates simultaneous distinct objectives and awards completion XP only once", async () => {
    await post([quest("accept")]);
    const gate = pauseNextBatch();
    const delayed = post([quest("bell-pine-north")]);
    await gate.entered;
    try { expect((await post([quest("bell-pine-east")], "owner-two")).status).toBe(200); }
    finally { gate.release(); }
    expect((await delayed).status).toBe(200);
    expect((await progress()).counters["harness-bells"]).toBe(2);
    expect((await post([quest("turn-in")])).status).toBe(200);
    expect((await post([quest("turn-in")], "owner-two")).status).toBe(200);
    expect((await progress()).xp).toBe(20);
  });

  it("appends after accepted progress even when its timestamp is ahead of the current clock", async () => {
    await post([quest("accept")]);
    db.sql("UPDATE progress_events SET created_at='2090-01-01T00:00:00.000Z'");
    expect((await post([quest("bell-pine-north")])).status).toBe(200);
    expect((await progress()).counters["harness-bells"]).toBe(1);
  });

  it("enforces the account cap after a competing request consumes the last slot", async () => {
    for (let i = 0; i < 499; i++)
      db.sql("INSERT INTO progress_events(user_id,mission_id,event_id) VALUES('owner','legacy',?)", `old-${i}`);
    const gate = pauseNextBatch();
    const delayed = post([mission()]);
    await gate.entered;
    try { expect((await post([mission("causes-global-donation", "panel")], "owner-two")).status).toBe(200); }
    finally { gate.release(); }
    expect((await delayed).status).toBe(429);
    expect(db.sql("SELECT COUNT(*) AS n FROM progress_events WHERE user_id='owner'")[0].n).toBe(500);
  });

  it("bounds contention retries without acknowledging or writing the losing request", async () => {
    const original = db.batch.bind(db); let attempts = 0;
    db.batch = async (statements) => {
      attempts++;
      db.sql("UPDATE progress_writes SET revision=revision+1 WHERE user_id='owner'");
      return original(statements);
    };
    const conflict = await post([mission()]);
    expect(conflict.status).toBe(409); expect(await conflict.json()).toEqual({ error: "progress_conflict" });
    expect(attempts).toBe(3); expect(db.sql("SELECT * FROM progress_events")).toHaveLength(0);
    db.batch = original;
    expect((await post([mission()])).status).toBe(200);
    expect((await progress()).xp).toBe(40);
  });

  it("rolls back the claim and every event on a database failure, then allows a safe retry", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await db.exec("CREATE TRIGGER fail_progress BEFORE INSERT ON progress_events WHEN NEW.event_id='win' BEGIN SELECT RAISE(FAIL,'test failure'); END");
    try {
      expect((await post([quest("accept"), mission()])).status).toBe(500);
      expect(db.sql("SELECT * FROM progress_events")).toHaveLength(0);
      expect(db.sql("SELECT revision,write_token FROM progress_writes")).toEqual([{ revision: 0, write_token: null }]);
    } finally { log.mockRestore(); }
    await db.exec("DROP TRIGGER fail_progress");
    expect((await post([quest("accept"), mission()])).status).toBe(200);
    expect(db.sql("SELECT * FROM progress_events")).toHaveLength(2);
  });
});
