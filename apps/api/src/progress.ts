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
 * that is not valid yet (an accept while another quest is active, an objective before its accept) is answered
 * 200 and left out, so the same id can be sent again once it is valid. With `QUESTS_V1_ENABLED` off, quest
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

type StoredEvent = { mission_id: string; event_id: string };

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
  const stored = await storedEvents(env, user.id);
  let progress = replay(stored);
  const writes: D1PreparedStatement[] = [];
  for (const e of valid) {
    const isQuest = QUEST_IDS.has(e.missionId);
    if (isQuest && !questsOn) continue;
    const next = applyEvent(progress, e.missionId, e.eventId).progress;
    // Quest event that changes nothing: already applied, or not a valid transition yet. Not stored, so the
    // same id can be sent again later.
    if (isQuest && next === progress) continue;
    progress = next;
    // A valid quest transition goes to the end of the log: REPLACE also moves a row that was stored before
    // it was valid (two requests racing), which would otherwise replay as a no-op forever.
    const verb = isQuest ? "INSERT OR REPLACE" : "INSERT OR IGNORE";
    writes.push(db.prepare(`${verb} INTO progress_events (user_id, mission_id, event_id) VALUES (?, ?, ?)`).bind(user.id, e.missionId, e.eventId));
  }
  if (stored.length + writes.length > MAX_EVENTS_PER_USER) throw new HttpError(429, "too_many_events");
  if (writes.length) await db.batch(writes);
  return json({ progress: await loadProgress(env, user.id) }, { headers: NO_STORE });
}
