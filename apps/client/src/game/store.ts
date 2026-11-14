import { create } from "zustand";

import { COSMETICS, type Look, sanitizeLook, unlockedIds } from "@vila/shared/game/cosmetics";
import { applyEvent, EMPTY_PROGRESS, type Mission, type Progress } from "@vila/shared/game/progress";
import type { NpcId } from "@vila/shared/game/quests";
import { events } from "./events";
import { planWalk, sim } from "./sim";

export type Panel =
  | { kind: "none" }
  | { kind: "donation" }
  | { kind: "lot"; lotId: string }
  | { kind: "explore" }
  | { kind: "memory" }
  | { kind: "missions" }
  | { kind: "indicators" }
  | { kind: "environment" }
  | { kind: "account"; then?: Panel }
  | { kind: "ngo"; lotId?: string }
  | { kind: "npc"; npcId: NpcId }
  // The expanded village (IMPL-0024, PROPOSTA): panels that say what is there today, no purchase and no claim.
  | { kind: "plot"; plotId: string }
  | { kind: "shop"; shopId: string }
  | { kind: "billboard"; billboardId: string };

/**
 * The game menu (PROPOSTA, IMPL-0022): null = closed, otherwise the view on screen. It is not a `Panel` on
 * purpose: the frame loop reads `panel` only, so the menu pauses nothing.
 */
export type MenuView = "root" | "settings" | "controls" | "help" | "leave";

/**
 * Closest interactive target near the avatar: it drives the one contextual action of the HUD (`ui/Hud.tsx`).
 * The last three are the places of the expanded village (IMPL-0024, PROPOSTA): a residential plot, a shop door
 * and a billboard, offered only when nothing else is in reach (`scene/Player.tsx`).
 */
export type Nearby =
  | { kind: "tree" }
  | { kind: "lot"; lotId: string }
  | { kind: "npc"; npcId: NpcId }
  | { kind: "quest"; interactionId: string }
  | { kind: "donation-panel" }
  | { kind: "plot"; plotId: string }
  | { kind: "shop"; shopId: string }
  | { kind: "billboard"; billboardId: string }
  | null;

/** Two targets are the same thing: same kind and, where a kind has many, same id. Allocates nothing. */
export function sameNearby(a: Nearby, b: Nearby): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  switch (a.kind) {
    case "lot":
      return b.kind === "lot" && a.lotId === b.lotId;
    case "npc":
      return b.kind === "npc" && a.npcId === b.npcId;
    case "quest":
      return b.kind === "quest" && a.interactionId === b.interactionId;
    case "plot":
      return b.kind === "plot" && a.plotId === b.plotId;
    case "shop":
      return b.kind === "shop" && a.shopId === b.shopId;
    case "billboard":
      return b.kind === "billboard" && a.billboardId === b.billboardId;
    case "tree":
    case "donation-panel":
      return a.kind === b.kind;
  }
}

// v2: mission ids were renamed to English in 0.2.0; v1 progress is discarded. This key holds GUEST progress
// only: a signed-in account's progress lives on the server (and in memory), so on a shared browser the next
// person never inherits it (IMPL-0011).
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

// Camera zoom (OQ-05 study): a per-browser convenience, never progress.
const ZOOM_KEY = "vila.zoom.v1";
export const ZOOM_MIN = 0.55;
export const ZOOM_MAX = 1.6;
const clampZoom = (z: number) => (Number.isFinite(z) ? Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z)) : 1);

function loadZoom(): number {
  try {
    return clampZoom(Number(localStorage.getItem(ZOOM_KEY) ?? 1));
  } catch {
    return 1;
  }
}

// The "click or tap the ground to walk" line (IMPL-0022): a per-browser convenience, never progress. The key
// holds only "1", written at the first walk, whether or not the line was still on screen.
const MOVED_KEY = "vila.moved.v1";

/** How long the line stays once the scene is on screen, if the visitor does not walk. */
export const MOVE_HINT_MS = 20_000;

function loadMoved(): boolean {
  try {
    return localStorage.getItem(MOVED_KEY) === "1";
  } catch {
    return false;
  }
}

/** This browser has walked: read once per page load, then true from the first walk on. */
let moved = loadMoved();

function rememberMoved() {
  if (moved) return;
  moved = true;
  try {
    localStorage.setItem(MOVED_KEY, "1");
  } catch {
    /* storage unavailable: the line shows again on the next visit */
  }
}

interface VilaState {
  /** The panel over the village; the visitor arrives with none (IMPL-0022). */
  panel: Panel;
  menu: MenuView | null;
  /** Opens the game menu on its list. Nothing happens while a panel is open: the panel is the layer on top. */
  openMenu: () => void;
  /** Moves between the views of the open menu. */
  showMenu: (view: MenuView) => void;
  closeMenu: () => void;
  /** Show the line that says how to walk: true until the first walk in this browser, or until it times out. */
  moveHint: boolean;
  /** Hides the line for this page load; it comes back on the next visit if the visitor never walked. */
  dismissMoveHint: () => void;
  /** The 3D scene is on screen (`sceneUp`): the visitor can walk. */
  sceneReady: boolean;
  /**
   * Called by `Player` when the scene is on screen. The line that says how to walk goes away `MOVE_HINT_MS`
   * later: the time is counted here, once per page load, because the line itself leaves the screen (and its
   * component unmounts) whenever a panel or the menu opens.
   */
  sceneUp: () => void;
  nearby: Nearby;
  /** Where the avatar is walking to (clicking is the only way to walk); null when idle. */
  target: { x: number; z: number } | null;
  progress: Progress;
  /** Whose progress is on screen: null = guest (saved in this browser), else the signed-in account id. */
  progressOwner: string | null;
  look: Look;
  setLook: (patch: Partial<Look>) => void;
  toast: { id: number; text: string } | null;
  /** Optional camera tilt to look at the sky (PROPOSAL; the gameplay camera is OQ-05). Moving ends it. */
  skyView: boolean;
  setSkyView: (on: boolean) => void;
  open: (panel: Panel) => void;
  close: () => void;
  /** Called every frame: only a change of target is stored (`sameNearby`). */
  setNearby: (n: Nearby) => void;
  /**
   * Walks to a point (null stops). The stored target is the resolved destination: the nearest walkable
   * spot when the request lands on an obstacle or outside the world, so the marker shows where the avatar
   * really ends (IMPL-0016).
   */
  setTarget: (t: { x: number; z: number } | null) => void;
  /** Camera distance multiplier (1 = default; smaller = closer). Saved in this browser. */
  zoom: number;
  /** Multiplies the zoom by `factor`, clamped to [ZOOM_MIN, ZOOM_MAX]. */
  zoomBy: (factor: number) => void;
  record: (missionId: string, eventId: string) => void;
  /** Shows an account's progress (from the server); the look is re-checked against it. */
  adoptProgress: (p: Progress, owner: string) => void;
  /** Back to guest progress (after sign-out or account deletion). */
  restoreGuest: () => void;
  /** Guest progress was migrated to an account: this browser keeps none of it. */
  clearGuest: () => void;
  /** Shows a passing notice (`toast`); a newer one replaces it. */
  notify: (text: string) => void;
  /** Removes the notice with this id when its time is up; a newer notice stays. */
  dismissToast: (id: number) => void;
}

let toastSeq = 0;

/**
 * How long a passing notice (`toast`) stays on screen, counted by the HUD from the moment it is drawn
 * (`Toast`, `ui/Hud.tsx`), then removed with `dismissToast`. Its fade (`styles.css`, the same time) is only how
 * it looks: under `prefers-reduced-motion` there is no fade at all, and the notice still has to leave.
 */
export const TOAST_MS = 3_600;

const initialProgress = loadProgress();

export const useVila = create<VilaState>((set, get) => ({
  panel: { kind: "none" },
  menu: null,
  openMenu: () => {
    if (get().panel.kind === "none") set({ menu: "root" });
  },
  showMenu: (menu) => {
    if (get().menu !== null) set({ menu });
  },
  closeMenu: () => set({ menu: null }),
  moveHint: !moved,
  dismissMoveHint: () => {
    if (get().moveHint) set({ moveHint: false });
  },
  sceneReady: false,
  sceneUp: () => {
    if (get().sceneReady) return;
    set({ sceneReady: true });
    if (get().moveHint) setTimeout(get().dismissMoveHint, MOVE_HINT_MS);
  },
  nearby: null,
  target: null,
  progress: initialProgress,
  progressOwner: null,
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
  // A panel is the layer on top: opening one (also from code, like a sign-in link) closes the menu.
  open: (panel) => set({ panel, menu: null }),
  close: () => set({ panel: { kind: "none" } }),
  setNearby: (nearby) => {
    if (!sameNearby(get().nearby, nearby)) set({ nearby });
  },
  setTarget: (target) => {
    if (target) {
      rememberMoved();
      return set({ target: planWalk(target.x, target.z), skyView: false, moveHint: false });
    }
    sim.route.active = false;
    set({ target });
  },
  zoom: loadZoom(),
  zoomBy: (factor) => {
    const zoom = clampZoom(get().zoom * factor);
    if (zoom === get().zoom) return;
    try {
      localStorage.setItem(ZOOM_KEY, String(zoom));
    } catch {
      /* storage unavailable: the zoom lasts for this session */
    }
    set({ zoom, skyView: false });
  },
  record: (missionId, eventId) => {
    const previous = get().progress;
    const { progress, completed } = applyEvent(previous, missionId, eventId);
    if (progress === get().progress) return;
    if (get().progressOwner === null) saveProgress(progress);
    set({ progress });
    if (completed) {
      // New cosmetics are a consequence of the mission, never a separate reward roll (PROPOSTA).
      const before = unlockedIds(previous);
      const fresh = COSMETICS.filter((c) => unlockedIds(progress).has(c.id) && !before.has(c.id));
      get().notify(missionDoneMessage(completed) + (fresh.length ? ` · Novo visual: ${fresh.map((c) => c.name).join(", ")}` : ""));
      events.emit({ type: "mission", missionId: completed.id });
    }
  },
  adoptProgress: (p, owner) => set({ progress: p, progressOwner: owner, look: sanitizeLook(get().look, p) }),
  restoreGuest: () => {
    const p = loadProgress();
    set({ progress: p, progressOwner: null, look: sanitizeLook(get().look, p) });
  },
  clearGuest: () => saveProgress(EMPTY_PROGRESS),
  notify: (text) => set({ toast: { id: ++toastSeq, text } }),
  dismissToast: (id) => {
    if (get().toast?.id === id) set({ toast: null });
  },
}));

const missionDoneMessage = (m: Mission) => `Missão concluída: ${m.title} · +${m.xp} XP`;
