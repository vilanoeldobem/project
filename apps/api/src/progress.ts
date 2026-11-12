/**
 * Missions and XP on the server (P14, DEC-040, DEC-042; IMPL-0011). The client records events locally and
 * sends them here when signed in; the (user, mission, event) primary key makes every event idempotent, and
 * progress is rebuilt by replaying them through the same shared `applyEvent` the client uses. Local
 * progress made before signing in is migrated by sending its events once (OQ-02).
 *
 *   GET  /progress                                      → {progress}
 *   POST /progress/events {accountId, events: [{missionId, eventId}]} → {progress}   (≤ 50 per request)
 *
 * Quests (PROPOSTA quests-v1, IMPL-0013) are an order-dependent state machine, so a quest event is stored only
 * when it is a valid transition against the progress already stored (the batch is applied in order). An event
 * that is not applicable (an accept while another quest is active, an objective before its accept) is omitted,
 * and the response returns the account's authoritative progress. With `QUESTS_V1_ENABLED` off, quest
 * events are skipped and the rest of the batch is stored. The four missions are order-independent: every
 * whitelisted mission event is stored, as before.
 *
 * Trust (PROPOSTA): the server checks mission ids, that each event id exists for its mission (gift ids, lot
 * ids…), idempotency and, for quests, the order of the transitions; it cannot prove that a gift was found or
 * an NPC was visited in the 3D scene. XP grants nothing that money could buy, and a donation grants no XP.
 */
import { applyEvent, EMPTY_PROGRESS, type Progress } from "@vila/shared/game/progress";
import { QUESTS } from "@vila/shared/game/quests";
import { GIFTS, LOTS } from "@vila/shared/game/world";

import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { assertAccount, requireUser } from "./session";
import type { Env } from "./api";

/** The event ids the client can produce for each mission or quest. */
export const KNOWN_EVENTS: Record<string, ReadonlySet<string>> = {
  "explore-gifts": new Set(GIFTS.map((g) => g.id)),
  "play-memory": new Set(["win"]),
  "causes-visit-lot": new Set(LOTS.map((l) => l.id)),
  "causes-global-donation": new Set(["panel"]),
  ...Object.fromEntries(QUESTS.map((q) => [q.id, new Set(["accept", "turn-in", ...q.objectiveEventIds])])),
};
/** Quest events are stored only while the quests-v1 flag is on (the four missions are always stored). */
const QUEST_IDS = new Set(QUESTS.map((q) => q.id));
const isKnownEvent = (e: unknown): e is { missionId: string; eventId: string } => {
  const { missionId, eventId } = (e ?? {}) as { missionId?: unknown; eventId?: unknown };
  if (typeof missionId !== "string" || typeof eventId !== "string") return false;
  return Object.hasOwn(KNOWN_EVENTS, missionId) && KNOWN_EVENTS[missionId].has(eventId);
};
const MAX_EVENTS = 50;
/** Every mission together needs a handful of events; this cap keeps a scripted client from growing the table. */
const MAX_EVENTS_PER_USER = 500;
const MAX_WRITE_ATTEMPTS = 3;

type StoredEvent = { mission_id: string; event_id: string };
type Event = { missionId: string; eventId: string };
type SnapshotRow = { revision: number; blocked: number; mission_id: string | null; event_id: string | null; created_at: string | null };

/** The account's events in the order they were stored, which is the order they are replayed in. */
async function storedEvents(env: Env, userId: string): Promise<StoredEvent[]> {
  const { results } = await env.DB!.prepare("SELECT mission_id, event_id FROM progress_events WHERE user_id = ? ORDER BY created_at, rowid")
    .bind(userId)
    .all<StoredEvent>();
  return results;
}

const replay = (rows: StoredEvent[]): Progress => rows.reduce((p, e) => applyEvent(p, e.mission_id, e.event_id).progress, EMPTY_PROGRESS);

export async function loadProgress(env: Env, userId: string): Promise<Progress> {
  return replay(await storedEvents(env, userId));
}

export async function getProgress(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ progress: await loadProgress(env, user.id) }, { headers: NO_STORE });
}

/** One SELECT observes the revision and ordered log together, never a revision from a newer snapshot. */
async function snapshot(db: D1Database, userId: string) {
  const { results } = await db.prepare(
    `SELECT w.revision, u.blocked, e.mission_id, e.event_id, e.created_at
       FROM progress_writes w JOIN users u ON u.id = w.user_id LEFT JOIN progress_events e ON e.user_id = w.user_id
      WHERE w.user_id = ? ORDER BY e.created_at, e.rowid`
  ).bind(userId).all<SnapshotRow>();
  if (!results.length) throw new HttpError(401, "not_signed_in");
  // Blocked after the session check (IMPL-0021): the claim below refuses in SQL, and the retry stops here.
  if (results[0].blocked) throw new HttpError(403, "session_blocked");
  return {
    revision: results[0].revision,
    events: results.filter((r): r is SnapshotRow & StoredEvent & { created_at: string } => r.mission_id !== null),
  };
}

const keyOf = (e: Event) => `${e.missionId}:${e.eventId}`;
const response = (progress: Progress): Response => json({ progress }, { headers: NO_STORE });

export async function postEvents(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  assertAccount(body, user);
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0 || events.length > MAX_EVENTS) throw new HttpError(400, "bad_events");
  const valid = events.filter(isKnownEvent);
  if (valid.length !== events.length) throw new HttpError(400, "bad_events");
  const db = env.DB!;
  const questsOn = env.QUESTS_V1_ENABLED === "true";
  await db.prepare("INSERT OR IGNORE INTO progress_writes(user_id) SELECT id FROM users WHERE id = ?").bind(user.id).run();
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    // Let a competing writer finish before reading a fresh snapshot; never spin on one stale claim.
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 20)));
    const saved = await snapshot(db, user.id);
    const existing = new Set(saved.events.map((e) => `${e.mission_id}:${e.event_id}`));
    let progress = replay(saved.events);
    const planned = new Map<string, Event>();
    for (const e of valid) {
      const isQuest = QUEST_IDS.has(e.missionId);
      if (isQuest && !questsOn) continue;
      const next = applyEvent(progress, e.missionId, e.eventId).progress;
      if (isQuest && next === progress) continue;
      progress = next;
      // Accepted quest rows never move. Only an old ignored row, now a valid transition, can be replaced.
      if (isQuest || !existing.has(keyOf(e))) planned.set(keyOf(e), e);
    }
    const additions = [...planned.keys()].filter((key) => !existing.has(key)).length;
    if (saved.events.length + additions > MAX_EVENTS_PER_USER) throw new HttpError(429, "too_many_events");
    if (!planned.size) return response(progress);

    const token = newId();
    // Keep the established timestamp,rowid order, even if another Worker clock was ahead of this one.
    const at = saved.events.reduce((latest, e) => e.created_at > latest ? e.created_at : latest, new Date().toISOString());
    const writes = [db.prepare(`UPDATE progress_writes SET revision = revision + 1, write_token = ? WHERE user_id = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = progress_writes.user_id AND u.blocked = 0)`)
      .bind(token, user.id, saved.revision)];
    for (const e of planned.values()) {
      const verb = QUEST_IDS.has(e.missionId) ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
      writes.push(db.prepare(`${verb} INTO progress_events(user_id, mission_id, event_id, created_at)
        SELECT ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM progress_writes WHERE user_id = ? AND write_token = ?)`)
        .bind(user.id, e.missionId, e.eventId, at, user.id, token));
    }
    // D1 batch is atomic: a stale claim writes no events; any failure rolls back the claim and the log.
    const [claim] = await db.batch(writes);
    if (claim.meta.changes) return response(await loadProgress(env, user.id));
  }
  throw new HttpError(409, "progress_conflict");
}
