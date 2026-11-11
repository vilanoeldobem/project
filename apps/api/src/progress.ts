import { applyEvent, EMPTY_PROGRESS, MISSIONS, type Progress } from "@vila/shared/game/progress";
import { GIFTS } from "@vila/shared/game/world";
import { accountJson, localAuthAvailable, readBody, sessionUser, type AuthEnv } from "./auth";

interface Row { state_json: string; revision: number; guest_imported_at: number | null; }
type Counters = Record<string, number>;
const fields = (body: Record<string, unknown>, keys: string[]) => Object.keys(body).every((key) => keys.includes(key));

function countersOf(value: unknown): Counters | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const counters: Counters = {};
  for (const [key, count] of Object.entries(value)) {
    const mission = MISSIONS.find((m) => m.id === key);
    if (!mission || typeof count !== "number" || !Number.isInteger(count) || count < 0 || count > mission.target) return null;
    counters[key] = count;
  }
  return counters;
}

/** Import counters only; rewards and completion always come from the shared mission rules. */
function mergeGuest(progress: Progress, counters: Counters, giftIds: string[]): Progress {
  let next = progress;
  for (const mission of MISSIONS) {
    if (mission.id === "explore-gifts") {
      for (const id of giftIds) next = applyEvent(next, mission.id, id).progress;
      continue;
    }
    const target = Math.max(next.counters[mission.id] ?? 0, counters[mission.id] ?? 0);
    while ((next.counters[mission.id] ?? 0) < target) {
      const before = next;
      next = applyEvent(next, mission.id, `guest-import:${next.counters[mission.id] ?? 0}`).progress;
      if (next === before) break;
    }
  }
  return next;
}

export async function handleProgress(request: Request, env: AuthEnv): Promise<Response> {
  const path = new URL(request.url).pathname;
  const method = path === "/progress" ? "GET" : ["/progress/events", "/progress/import"].includes(path) ? "POST" : null;
  if (!method) return accountJson({ error: "not_found" }, 404);
  if (request.method !== method) return accountJson({ error: "method_not_allowed" }, 405, { Allow: method });
  if (!localAuthAvailable(request, env) || !env.DB) return accountJson({ error: "auth_unavailable" }, 503);
  const now = Math.floor(Date.now() / 1000);
  const user = await sessionUser(request, env.DB, now);
  if (!user) return accountJson({ error: "unauthorized" }, 401);
  if (request.headers.get("X-Account-ID") !== user.id) return accountJson({ error: "account_changed" }, 409);
  const db = env.DB;
  let event: { missionId: string; eventId: string } | null = null;
  let guest: Counters | null = null;
  let giftIds: string[] = [];
  if (method === "POST") {
    if (request.headers.get("Origin") !== env.AUTH_PAGE_ORIGIN || request.headers.get("Sec-Fetch-Site") === "cross-site") return accountJson({ error: "origin_forbidden" }, 403);
    const body = await readBody(request);
    if (!body) return accountJson({ error: "invalid_body" }, 400);
    if (path === "/progress/events") {
      if (!fields(body, ["missionId", "eventId"]) || !MISSIONS.some((m) => m.id === body.missionId) ||
        typeof body.eventId !== "string" || !/^[a-zA-Z0-9:_-]{1,128}$/.test(body.eventId) || body.eventId.startsWith("guest-import:")) return accountJson({ error: "invalid_event" }, 400);
      if (body.missionId === "explore-gifts" && !GIFTS.some((g) => g.id === body.eventId)) return accountJson({ error: "invalid_event" }, 400);
      event = { missionId: body.missionId as string, eventId: body.eventId };
    } else {
      guest = fields(body, ["counters", "giftIds"]) ? countersOf(body.counters) : null;
      const ids = body.giftIds ?? [];
      const giftTarget = MISSIONS.find((m) => m.id === "explore-gifts")!.target;
      if (!guest || !Array.isArray(ids) || ids.length > giftTarget || new Set(ids).size !== ids.length ||
        ids.some((id) => typeof id !== "string" || !GIFTS.some((g) => g.id === id)) || ids.length !== (guest["explore-gifts"] ?? 0)) return accountJson({ error: "invalid_import" }, 400);
      giftIds = ids as string[];
    }
  }
  await db.prepare("INSERT OR IGNORE INTO player_progress (user_id, state_json, revision, created_at, updated_at) VALUES (?, ?, 0, ?, ?)")
    .bind(user.id, JSON.stringify(EMPTY_PROGRESS), now, now).run();
  for (let attempt = 0; attempt < 5; attempt++) {
    const row = await db.prepare("SELECT state_json, revision, guest_imported_at FROM player_progress WHERE user_id = ?").bind(user.id).first<Row>();
    if (!row) throw new Error("progress_missing");
    const progress = JSON.parse(row.state_json) as Progress;
    if (method === "GET" || (guest && row.guest_imported_at !== null)) return accountJson({ progress, revision: row.revision, guestImported: row.guest_imported_at !== null });
    const next = event ? applyEvent(progress, event.missionId, event.eventId).progress : mergeGuest(progress, guest!, giftIds);
    if (event && next === progress) return accountJson({ progress, revision: row.revision, guestImported: row.guest_imported_at !== null });
    const result = await db.prepare(`UPDATE player_progress SET state_json = ?, revision = revision + 1,
      guest_imported_at = ?, updated_at = ? WHERE user_id = ? AND revision = ?`)
      .bind(JSON.stringify(next), guest ? now : row.guest_imported_at, now, user.id, row.revision).run();
    if (result.meta.changes === 1) return accountJson({ progress: next, revision: row.revision + 1, guestImported: guest !== null || row.guest_imported_at !== null });
  }
  return accountJson({ error: "progress_conflict" }, 409, { "Retry-After": "1" });
}
