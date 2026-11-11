import { create } from "zustand";

import { COSMETICS, type Look, sanitizeLook, unlockedIds } from "@vila/shared/game/cosmetics";
import { applyEvent, EMPTY_PROGRESS, type Mission, type Progress } from "@vila/shared/game/progress";
import { events } from "./events";
import { useAuth } from "../lib/auth";
import { createProgressSync, type ProgressStatus } from "./account-progress";

export type Panel =
  | { kind: "account" }
  | { kind: "ngo-applications"; lotId?: string; review?: boolean }
  | { kind: "none" }
  | { kind: "welcome" }
  | { kind: "donation" }
  | { kind: "lot"; lotId: string }
  | { kind: "explore" }
  | { kind: "memory" }
  | { kind: "missions" }
  | { kind: "indicators" }
  | { kind: "environment" };

/** Closest interactive target near the avatar (drives the action button). */
export type Nearby = { kind: "tree" } | { kind: "lot"; lotId: string } | null;

// v2: mission ids were renamed to English in 0.2.0; v1 progress is discarded.
const STORAGE_KEY = "vila.progress.v2";

function loadProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...EMPTY_PROGRESS, ...(JSON.parse(raw) as Progress) };
  } catch {
    /* storage unavailable: progress lives for this session only */
  }
  return EMPTY_PROGRESS;
}

function saveProgress(p: Progress) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* same as above */
  }
}

// Chosen avatar look (cosmetic layer ids, PROPOSTA). Always re-checked against what progress unlocked.
const LOOK_KEY = "vila.look.v1";

function loadLook(p: Progress): Look {
  try {
    return sanitizeLook(JSON.parse(localStorage.getItem(LOOK_KEY) ?? "null"), p);
  } catch {
    return sanitizeLook(null, p);
  }
}

interface VilaState {
  panel: Panel;
  nearby: Nearby;
  /** Click/tap destination; null when idle or moving with the keyboard. */
  target: { x: number; z: number } | null;
  progress: Progress;
  progressStatus: ProgressStatus;
  retryProgress: () => void;
  look: Look;
  setLook: (patch: Partial<Look>) => void;
  toast: { id: number; text: string } | null;
  /** Optional camera tilt to look at the sky (PROPOSAL; the gameplay camera is OQ-05). Moving ends it. */
  skyView: boolean;
  setSkyView: (on: boolean) => void;
  open: (panel: Panel) => void;
  close: () => void;
  setNearby: (n: Nearby) => void;
  setTarget: (t: { x: number; z: number } | null) => void;
  record: (missionId: string, eventId: string) => void;
  notify: (text: string) => void;
}

let toastSeq = 0;

const initialProgress = loadProgress();
let guestProgress = initialProgress;

export const useVila = create<VilaState>((set, get) => ({
  panel: { kind: "welcome" },
  nearby: null,
  target: null,
  progress: initialProgress,
  progressStatus: "guest",
  retryProgress: () => progressSync.retry(),
  look: loadLook(initialProgress),
  setLook: (patch) => {
    const look = sanitizeLook({ ...get().look, ...patch }, get().progress);
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    } catch {
      /* storage unavailable: the look lasts for this session */
    }
    set({ look });
  },
  toast: null,
  skyView: false,
  setSkyView: (skyView) => set({ skyView }),
  open: (panel) => set({ panel }),
  close: () => set({ panel: { kind: "none" } }),
  setNearby: (nearby) => {
    const cur = get().nearby;
    if (cur?.kind === nearby?.kind && (cur?.kind !== "lot" || (nearby?.kind === "lot" && cur.lotId === nearby.lotId))) return;
    set({ nearby });
  },
  setTarget: (target) => set(target ? { target, skyView: false } : { target }),
  record: (missionId, eventId) => {
    const previous = get().progress;
    const { progress, completed } = applyEvent(previous, missionId, eventId);
    if (progress === get().progress) return;
    if (!progressSync.record(missionId, eventId)) { guestProgress = progress; saveProgress(progress); }
    set({ progress });
    if (completed) {
      // New cosmetics are a consequence of the mission, never a separate reward roll (PROPOSTA).
      const before = unlockedIds(previous);
      const fresh = COSMETICS.filter((c) => unlockedIds(progress).has(c.id) && !before.has(c.id));
      get().notify(missionDoneMessage(completed) + (fresh.length ? ` · Novo visual: ${fresh.map((c) => c.name).join(", ")}` : ""));
      events.emit({ type: "mission", missionId: completed.id });
    }
  },
  notify: (text) => set({ toast: { id: ++toastSeq, text } }),
}));

const missionDoneMessage = (m: Mission) => `Missão concluída: ${m.title} · +${m.xp} XP`;

const progressSync = createProgressSync({
  guest: () => guestProgress,
  progress: (progress) => useVila.setState((state) => ({ progress, look: sanitizeLook(state.look, progress) })),
  status: (progressStatus) => useVila.setState({ progressStatus }),
  accountChanged: () => { void useAuth.getState().refresh(); },
  unauthorized: () => { useAuth.getState().signedOut(); useVila.getState().notify("Sua sessão expirou. Entre novamente para sincronizar o progresso."); },
});
useAuth.subscribe((state) => { if (state.ready && !state.failed) progressSync.switchUser(state.user?.id ?? null); });
window.addEventListener("online", () => progressSync.retry());
