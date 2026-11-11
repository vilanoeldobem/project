/**
 * Missions and XP on the server (P14, DEC-040, DEC-042; IMPL-0011). The client records events locally and
 * sends them here when signed in; the (user, mission, event) primary key makes every event idempotent, and
 * progress is rebuilt by replaying them through the same shared `applyEvent` the client uses. Local
 * progress made before signing in is migrated by sending its events once (OQ-02).
 *
 *   GET  /progress                                      → {progress}
 *   POST /progress/events {events: [{missionId, eventId}]} → {progress}   (≤ 50 per request)
 *
 * Trust (PROPOSTA): the server checks mission ids, event id format and idempotency; it cannot prove that a
 * gift was found in the 3D scene. XP grants nothing that money could buy, and a donation grants no XP.
 */
import { applyEvent, EMPTY_PROGRESS, MISSIONS, type Progress } from "@vila/shared/game/progress";

import { HttpError, json, NO_STORE, readJson } from "./http";
import { requireUser } from "./session";
import type { Env } from "./api";

const EVENT_ID = /^[A-Za-z0-9:_.-]{1,64}$/;
const MAX_EVENTS = 50;
/** Every mission together needs a handful of events; this cap keeps a scripted client from growing the table. */
const MAX_EVENTS_PER_USER = 500;

export async function loadProgress(env: Env, userId: string): Promise<Progress> {
  const { results } = await env.DB!.prepare("SELECT mission_id, event_id FROM progress_events WHERE user_id = ? ORDER BY created_at, rowid")
    .bind(userId)
    .all<{ mission_id: string; event_id: string }>();
  return results.reduce((p, e) => applyEvent(p, e.mission_id, e.event_id).progress, EMPTY_PROGRESS);
}

export async function getProgress(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  return json({ progress: await loadProgress(env, user.id) }, { headers: NO_STORE });
}

export async function postEvents(request: Request, env: Env): Promise<Response> {
  const user = await requireUser(request, env);
  const body = await readJson(request);
  const events = Array.isArray(body.events) ? body.events : [];
  if (events.length === 0 || events.length > MAX_EVENTS) throw new HttpError(400, "bad_events");
  const valid = events.filter(
    (e): e is { missionId: string; eventId: string } =>
      !!e && typeof e === "object" && MISSIONS.some((m) => m.id === (e as { missionId?: unknown }).missionId) && EVENT_ID.test(String((e as { eventId?: unknown }).eventId))
  );
  if (valid.length !== events.length) throw new HttpError(400, "bad_events");
  const db = env.DB!;
  const stored = await db.prepare("SELECT COUNT(*) AS n FROM progress_events WHERE user_id = ?").bind(user.id).first<{ n: number }>();
  if ((stored?.n ?? 0) + valid.length > MAX_EVENTS_PER_USER) throw new HttpError(429, "too_many_events");
  await db.batch(valid.map((e) => db.prepare("INSERT OR IGNORE INTO progress_events (user_id, mission_id, event_id) VALUES (?, ?, ?)").bind(user.id, e.missionId, e.eventId)));
  return json({ progress: await loadProgress(env, user.id) }, { headers: NO_STORE });
}
