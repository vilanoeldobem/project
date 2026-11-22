/**
 * Missions and XP on the server (P14, DEC-040, DEC-042; IMPL-0011; quests-v2 PROPOSTA). The client records
 * events locally and sends them here when signed in; the (user, mission, event) primary key makes every event
 * idempotent, and progress is rebuilt by replaying them through the same shared engine the client uses.
 *
 *   GET  /progress                                      → {progress}
 *   POST /progress/events {accountId, events: [{missionId, eventId}]} → {progress}   (≤ 50 per request)
 *
 * Quests (v1 epilogue and v2 books) are an order-dependent state machine, so a quest event is stored only when
 * it is a valid transition against the progress already stored (the batch is applied in order). An event that
 * is not applicable is omitted and the response returns the account's authoritative progress. With
 * `QUESTS_V1_ENABLED` off, v1 quest events are skipped; with `QUESTS_V2_ENABLED` off, v2 events are skipped.
 * The four quick missions are order-independent and always stored.
 *
 * Trust (PROPOSTA): the server checks mission ids, that each event id exists for its mission, idempotency and,
 * for quests, the order of the transitions; it cannot prove that a gift was found or an NPC was visited in the
 * 3D scene. XP grants nothing that money could buy, and a donation grants no XP.
 */
import { EMPTY_PROGRESS, type Progress } from "@vila/shared/game/progress";
import { applyEventIn, catalogFor, STORY_CATALOG } from "@vila/shared/game/quests-v2/catalog";
import type { StoryCatalog } from "@vila/shared/game/quests-v2/types";
import { QUESTS } from "@vila/shared/game/quests";
import { GIFTS, LOTS } from "@vila/shared/game/world";

import { newId } from "./crypto";
import { HttpError, json, NO_STORE, readJson } from "./http";
import { assertAccount, requireUser } from "./session";
import type { Env } from "./api";

/** The event ids the client can produce for each mission or quest. */
export function knownEventsFor(catalog: StoryCatalog): Record<string, ReadonlySet<string>> {
  return {
    "explore-gifts": new Set(GIFTS.map((g) => g.id)),
    "play-memory": new Set(["win"]),
    "causes-visit-lot": new Set(LOTS.map((l) => l.id)),
    "causes-global-donation": new Set(["panel"]),
    ...Object.fromEntries(catalog.quests.map((q) => [q.id, new Set(["accept", "turn-in", ...q.objectiveEventIds])])),
  };
}

export const KNOWN_EVENTS: Record<string, ReadonlySet<string>> = knownEventsFor(STORY_CATALOG);

const V1_QUEST_IDS = new Set(QUESTS.map((q) => q.id));
const V2_QUEST_IDS = new Set(STORY_CATALOG.quests.filter((q) => "book" in q).map((q) => q.id));
const QUEST_IDS = new Set([...V1_QUEST_IDS, ...V2_QUEST_IDS]);
const isKnownEvent = (e: unknown): e is { missionId: string; eventId: string } => {
  const { missionId, eventId } = (e ?? {}) as { missionId?: unknown; eventId?: unknown };
  if (typeof missionId !== "string" || typeof eventId !== "string") return false;
  return Object.hasOwn(KNOWN_EVENTS, missionId) && KNOWN_EVENTS[missionId].has(eventId);
};
const MAX_EVENTS = 50;
/** The saga has 484 entries and about 1,500 events; 500 would block it. */
const MAX_EVENTS_PER_USER = 5000;
const MAX_WRITE_ATTEMPTS = 3;

type StoredEvent = { mission_id: string; event_id: string };
type Event = { missionId: string; eventId: string };
type SnapshotRow = { revision: number | null; blocked: number; mission_id: string | null; event_id: string | null; created_at: string | null };

export interface ProgressFlags {
  v1: boolean;
  v2: boolean;
}

const keyOf = (e: Event) => `${e.missionId}:${e.eventId}`;
const isQuestId = (missionId: string) => QUEST_IDS.has(missionId);

/**
 * Replays the stored log and plans the valid part of one incoming batch. Pure and testable with a synthetic
 * catalog; the route calls it with `STORY_CATALOG`. Saved events replay through `catalog`, so a v1-only
 * account keeps its epilogue progress; new events may use `applyCatalog` (the v2-gated catalog).
 */
export function planProgress(
  catalog: StoryCatalog,
  saved: StoredEvent[],
  valid: Event[],
  flags: ProgressFlags,
  applyCatalog: StoryCatalog = catalog
): { progress: Progress; planned: Map<string, Event> } {
  const existing = new Set(saved.map((e) => `${e.mission_id}:${e.event_id}`));
  let progress = saved.reduce((p, e) => applyEventIn(catalog, p, e.mission_id, e.event_id).progress, EMPTY_PROGRESS);
  const planned = new Map<string, Event>();
  const v2Ids = new Set(catalog.quests.filter((quest) => "book" in quest).map((quest) => quest.id));
  const questIds = new Set([...V1_QUEST_IDS, ...v2Ids]);
  for (const e of valid) {
    const isQuest = questIds.has(e.missionId);
    if (V1_QUEST_IDS.has(e.missionId) && !flags.v1) continue;
    if (v2Ids.has(e.missionId) && !flags.v2) continue;
    const next = applyEventIn(applyCatalog, progress, e.missionId, e.eventId).progress;
    if (isQuest && next === progress) continue;
    progress = next;
    // Accepted quest rows never move. Only an old ignored row, now a valid transition, can be replaced.
    if (isQuest || !existing.has(keyOf(e))) planned.set(keyOf(e), e);
  }
  return { progress, planned };
}

/** The account's events in the order they were stored, which is the order they are replayed in. */
async function storedEvents(env: Env, userId: string): Promise<StoredEvent[]> {
  const { results } = await env.DB!.prepare("SELECT mission_id, event_id FROM progress_events WHERE user_id = ? ORDER BY created_at, rowid")
    .bind(userId)
    .all<StoredEvent>();
  return results;
}

const replay = (rows: StoredEvent[]): Progress =>
  rows.reduce((p, e) => applyEventIn(STORY_CATALOG, p, e.mission_id, e.event_id).progress, EMPTY_PROGRESS);

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
       FROM users u LEFT JOIN progress_writes w ON w.user_id = u.id LEFT JOIN progress_events e ON e.user_id = u.id
      WHERE u.id = ? ORDER BY e.created_at, e.rowid`
  ).bind(userId).all<SnapshotRow>();
  if (!results.length) throw new HttpError(401, "not_signed_in");
  // Blocked after the session check (IMPL-0021): the claim below refuses in SQL, and the retry stops here. The
  // account may then have no write counter at all: it is not created for a blocked account either.
  if (results[0].blocked) throw new HttpError(403, "session_blocked");
  return {
    revision: results[0].revision,
    events: results.filter((r): r is SnapshotRow & StoredEvent & { created_at: string } => r.mission_id !== null),
  };
}

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
  const flags = { v1: env.QUESTS_V1_ENABLED === "true", v2: env.QUESTS_V2_ENABLED === "true" };
  await db.prepare("INSERT OR IGNORE INTO progress_writes(user_id) SELECT id FROM users WHERE id = ? AND blocked = 0").bind(user.id).run();
  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    // Let a competing writer finish before reading a fresh snapshot; never spin on one stale claim.
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 20 * attempt + Math.floor(Math.random() * 20)));
    const saved = await snapshot(db, user.id);
    const existing = new Set(saved.events.map((e) => `${e.mission_id}:${e.event_id}`));
    const applyCatalog = flags.v1 && flags.v2 ? catalogFor(true, true) : STORY_CATALOG;
    const { progress, planned } = planProgress(STORY_CATALOG, saved.events, valid, flags, applyCatalog);
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
      const verb = isQuestId(e.missionId) ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
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
