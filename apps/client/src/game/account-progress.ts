import { applyEvent, EMPTY_PROGRESS, MISSIONS, type Progress } from "@vila/shared/game/progress";
import { GIFTS } from "@vila/shared/game/world";
import { SERVICES } from "../lib/services";

export type ProgressStatus = "guest" | "loading" | "saving" | "saved" | "offline";
interface Event { missionId: string; eventId: string; }
interface Snapshot { progress: Progress; pending: Event[]; }
interface Reply { progress: Progress; guestImported: boolean; }

/** One serial queue per active account; guest storage is never used as an account cache. */
export function createProgressSync(hooks: {
  guest: () => Progress;
  progress: (progress: Progress) => void;
  status: (status: ProgressStatus) => void;
  unauthorized: () => void;
  accountChanged: () => void;
}) {
  let userId: string | null = null;
  let generation = 0;
  let running: number | null = null;
  let pending: Event[] = [];
  let progress = EMPTY_PROGRESS;
  const key = (id: string) => `vila.account-progress.v1:${id}`;
  function save() {
    if (!userId) return;
    try { localStorage.setItem(key(userId), JSON.stringify({ progress, pending })); } catch { /* queue lasts this session */ }
  }
  function display(canonical: Progress) {
    progress = pending.reduce((p, event) => applyEvent(p, event.missionId, event.eventId).progress, canonical);
    save();
    hooks.progress(progress);
  }
  async function request(path = "", body?: unknown): Promise<Reply> {
    const response = await fetch(`${SERVICES.api}/progress${path}`, {
      method: body === undefined ? "GET" : "POST", credentials: "include", cache: "no-store",
      headers: { "X-Account-ID": userId!, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({})) as { error?: string };
      throw new Error(response.status === 401 ? "session_expired" : error.error === "account_changed" ? "account_changed" : "progress_unavailable");
    }
    return response.json() as Promise<Reply>;
  }
  async function sync() {
    if (!userId || running === generation) return;
    const current = generation;
    running = current;
    hooks.status("saving");
    try {
      let state = await request();
      if (current !== generation) return;
      if (!state.guestImported) {
        const guest = hooks.guest();
        const giftIds = GIFTS.filter((g) => guest.seen?.[`explore-gifts:${g.id}`]).map((g) => g.id).slice(0, MISSIONS.find((m) => m.id === "explore-gifts")!.target);
        const counters = Object.fromEntries(MISSIONS.map((m) => {
          const value = guest.counters?.[m.id];
          return [m.id, m.id === "explore-gifts" ? giftIds.length : Number.isInteger(value) ? Math.max(0, Math.min(value, m.target)) : 0];
        }));
        state = await request("/import", { counters, giftIds });
        if (current !== generation) return;
      }
      display(state.progress);
      while (pending.length) {
        const event = pending[0];
        state = await request("/events", event);
        if (current !== generation) return;
        pending.shift();
        display(state.progress);
      }
      hooks.status("saved");
    } catch (error) {
      if (current !== generation) return;
      hooks.status("offline");
      if (error instanceof Error && error.message === "session_expired") hooks.unauthorized();
      if (error instanceof Error && error.message === "account_changed") hooks.accountChanged();
    } finally {
      if (running === current) running = null;
    }
  }
  return {
    isAccount: () => userId !== null,
    switchUser(id: string | null) {
      if (id === userId) return;
      save();
      generation++;
      userId = id;
      pending = [];
      progress = EMPTY_PROGRESS;
      if (!id) { hooks.progress(hooks.guest()); hooks.status("guest"); return; }
      try {
        const stored = JSON.parse(localStorage.getItem(key(id)) ?? "null") as Snapshot | null;
        if (stored && stored.progress && Array.isArray(stored.pending)) { progress = stored.progress; pending = stored.pending; }
      } catch { /* no valid account cache */ }
      hooks.progress(progress);
      hooks.status("loading");
      void sync();
    },
    record(missionId: string, eventId: string) {
      if (!userId) return false;
      if (!pending.some((event) => event.missionId === missionId && event.eventId === eventId)) pending.push({ missionId, eventId });
      progress = applyEvent(progress, missionId, eventId).progress;
      save();
      void sync();
      return true;
    },
    retry: () => { void sync(); },
  };
}
