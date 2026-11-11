import { create } from "zustand";

import { applyEvent, EMPTY_PROGRESS, type Mission, type Progress } from "./progress";
import { events } from "./events";

export type Panel =
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

interface VilaState {
  panel: Panel;
  nearby: Nearby;
  /** Click/tap destination; null when idle or moving with the keyboard. */
  target: { x: number; z: number } | null;
  progress: Progress;
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

export const useVila = create<VilaState>((set, get) => ({
  panel: { kind: "welcome" },
  nearby: null,
  target: null,
  progress: loadProgress(),
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
    const { progress, completed } = applyEvent(get().progress, missionId, eventId);
    if (progress === get().progress) return;
    saveProgress(progress);
    set({ progress });
    if (completed) {
      get().notify(missionDoneMessage(completed));
      events.emit({ type: "mission", missionId: completed.id });
    }
  },
  notify: (text) => set({ toast: { id: ++toastSeq, text } }),
}));

const missionDoneMessage = (m: Mission) => `Missão concluída: ${m.title} · +${m.xp} XP`;
