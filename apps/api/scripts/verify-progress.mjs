/** Real local D1/Worker smoke. --seed prints SQL resetting only these synthetic local accounts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const owner = "e0000000-0000-4000-8000-000000000001";
const other = "e0000000-0000-4000-8000-000000000002";
const tokens = ["local-progress-device-one", "local-progress-device-two", "local-progress-other"];
const hash = (s) => createHash("sha256").update(s).digest("hex");
const event = (eventId, missionId) => ({ missionId, eventId });
// Book I is public in both catalog modes; the v1 epilogue roots now wait for `b05-c3-04` when v2 is on.
const C1 = "b01-c1-01", C2 = "b01-c1-02", C3 = "b01-c1-03", C4 = "b01-c1-04", C2_1 = "b01-c2-01";
const chain = [
  event("accept", C1), event("talk-anselmo-arrival", C1), event("turn-in", C1),
  event("accept", C2), event("bell-part-clapper", C2), event("bell-part-rope-west", C2), event("bell-part-rope-east", C2), event("turn-in", C2),
  event("accept", C3), event("talk-guida-name", C3), event("talk-nivaldo-name", C3), event("talk-filo-name", C3), event("turn-in", C3),
  event("accept", C4), event("ring-bell", C4), event("turn-in", C4),
];

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
  const early = await ok(await request(0, [event("bell-part-clapper", C2)]));
  assert.equal(early.seen[`${C2}:bell-part-clapper`], undefined, "Inapplicable event must not enter the account log");
  // Two simulated devices open and finish the first Book I quest together.
  for (const r of await Promise.all([request(0, [event("accept", C1)]), request(1, [event("accept", C1)])])) await ok(r);
  for (const r of await Promise.all([request(0, [event("talk-anselmo-arrival", C1)]), request(1, [event("talk-anselmo-arrival", C1)])])) await ok(r);
  for (const r of await Promise.all([request(0, [event("turn-in", C1)]), request(1, [event("turn-in", C1)])])) await ok(r);
  assert.equal((await ok(await request(1))).xp, 20);
  for (const r of await Promise.all([request(0, [event("accept", C2)]), request(1, [event("accept", C2)])])) await ok(r);
  // Two simulated devices send different objectives of the same quest concurrently.
  for (const r of await Promise.all([request(0, [event("bell-part-clapper", C2)]), request(1, [event("bell-part-rope-west", C2)])])) await ok(r);
  await ok(await request(0, [event("bell-part-rope-east", C2)]));
  const beforeTurnIn = await ok(await request(1));
  assert.equal(beforeTurnIn.counters[C2], 3);
  assert.equal(beforeTurnIn.xp, 20);
  for (const r of await Promise.all([request(0, [event("turn-in", C2)]), request(1, [event("turn-in", C2)])])) await ok(r);
  assert.equal((await ok(await request(1))).xp, 45);
  const completed = await ok(await request(0, chain.slice(8)));
  assert.equal(completed.xp, 125);
  assert.equal(Math.floor(completed.xp / 100) + 1, 2);
  assert.equal(completed.completed[C2], true);
  assert.equal(completed.completed[C4], true);
  assert.deepEqual(await ok(await request(1, chain)), completed, "Replay must not duplicate XP");
  assert.deepEqual(await ok(await request(1)), completed, "Second session must recover saved progress");
  assert.equal((await request(2, chain, owner)).status, 409, "A different session cannot write this account");
  assert.equal((await ok(await request(2))).xp, 0);
  console.log("PASS: local D1 authoritative state, two-session concurrency, replay, 125 XP/level 2 and account isolation");

  if (process.argv.includes("--book-one")) {
    const questId = C2_1;
    const events = ["accept", "talk-bete-empty-stall", "turn-in"].map((id) => event(id, questId));
    const afterBook = await ok(await request(0, events));
    assert.equal(afterBook.xp, completed.xp + 20);
    assert.deepEqual(afterBook.completed, { ...completed.completed, [questId]: true });
    assert.deepEqual(afterBook.seen, {
      ...completed.seen,
      [`${questId}:accept`]: true,
      [`${questId}:talk-bete-empty-stall`]: true,
      [`${questId}:turn-in`]: true,
    });
    assert.deepEqual(await ok(await request(1)), afterBook, "Second session recovers the first Book I chapter 2 quest");
    assert.deepEqual(await ok(await request(1, events)), afterBook, "Repeating Book I grants no additional XP");
    assert.deepEqual(await ok(await request(0)), afterBook, "Replay preserves both generations of progress in D1");
    console.log("PASS: Book I chapter 2 persisted across sessions, 125 prior XP + 20 XP, 145 XP after replay");
  }
}
