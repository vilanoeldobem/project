/** Real local D1/Worker smoke. --seed prints SQL resetting only these synthetic local accounts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const owner = "e0000000-0000-4000-8000-000000000001";
const other = "e0000000-0000-4000-8000-000000000002";
const tokens = ["local-progress-device-one", "local-progress-device-two", "local-progress-other"];
const hash = (s) => createHash("sha256").update(s).digest("hex");
const event = (eventId, missionId = "harness-bells") => ({ missionId, eventId });
const chain = [event("accept"), event("bell-pine-north"), event("bell-pine-east"), event("turn-in"),
  event("accept", "route-memory-game"), event("memory-win", "route-memory-game"), event("turn-in", "route-memory-game"),
  event("accept", "charm-for-the-flight"), event("turn-in", "charm-for-the-flight")];

if (process.argv[2] === "--seed") {
  const expires = new Date(Date.now() + 3600_000).toISOString();
  console.log(`
DELETE FROM users WHERE id IN ('${owner}','${other}');
INSERT INTO users(id,name,nickname,nickname_key,city,email,verified_at)
VALUES('${owner}','Local player','local_progress_owner','local_progress_owner','Local','progress-owner@example.invalid','2026-01-01'),
('${other}','Local other','local_progress_other','local_progress_other','Local','progress-other@example.invalid','2026-01-01');
INSERT INTO sessions(token_hash,user_id,expires_at) VALUES
('${hash(tokens[0])}','${owner}','${expires}'),('${hash(tokens[1])}','${owner}','${expires}'),('${hash(tokens[2])}','${other}','${expires}');
`);
} else {
  const base = new URL(process.argv[2] ?? "http://127.0.0.1:8795");
  assert.equal(base.protocol, "http:");
  assert.ok(["127.0.0.1", "localhost"].includes(base.hostname), "Run only against a local Worker");
  const request = (device, events, accountId = owner) => fetch(new URL(events ? "/progress/events" : "/progress", base), {
    method: events ? "POST" : "GET",
    headers: { Origin: "http://localhost:8799", ...(device === null ? {} : { Cookie: `__Host-vila_session=${tokens[device]}` }),
      ...(events ? { "Content-Type": "application/json" } : {}) },
    ...(events ? { body: JSON.stringify({ accountId, events }) } : {}),
  });
  const ok = async (response) => {
    assert.equal(response.status, 200, await response.clone().text());
    return (await response.json()).progress;
  };
  assert.equal((await request(null)).status, 401);
  const early = await ok(await request(0, [event("bell-pine-north")]));
  assert.equal(early.seen["harness-bells:bell-pine-north"], undefined, "Inapplicable event must not enter the account log");
  for (const r of await Promise.all([request(0, [chain[0]]), request(1, [chain[0]])])) await ok(r);
  // Two simulated devices send different objectives plus the same accepted event concurrently.
  for (const r of await Promise.all([request(0, [chain[0], chain[1]]), request(1, [chain[0], chain[2]])])) await ok(r);
  const beforeTurnIn = await ok(await request(1));
  assert.equal(beforeTurnIn.counters["harness-bells"], 2);
  assert.equal(beforeTurnIn.xp, 0);
  for (const r of await Promise.all([request(0, [chain[3]]), request(1, [chain[3]])])) await ok(r);
  assert.equal((await ok(await request(1))).xp, 20);
  const completed = await ok(await request(0, chain.slice(4)));
  assert.equal(completed.xp, 100);
  assert.equal(Math.floor(completed.xp / 100) + 1, 2);
  assert.equal(completed.completed["charm-for-the-flight"], true);
  assert.deepEqual(await ok(await request(1, chain)), completed, "Replay must not duplicate XP");
  assert.deepEqual(await ok(await request(1)), completed, "Second session must recover saved progress");
  assert.equal((await request(2, chain, owner)).status, 409, "A different session cannot write this account");
  assert.equal((await ok(await request(2))).xp, 0);
  console.log("PASS: local D1 authoritative state, two-session concurrency, replay, 100 XP/level 2 and account isolation");
}
