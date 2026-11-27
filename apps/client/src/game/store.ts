import { create } from "zustand";

import { DEFAULT_LOOK, type Look } from "@vila/shared/game/cosmetics";
import { COSMETICS_V2, sanitizeLookIn, unlockedIdsIn } from "@vila/shared/game/cosmetics-v2";
import { DEFAULT_APPEARANCE, sanitizeAppearance, type Appearance } from "@vila/shared/game/appearance";
import { EMPTY_PROGRESS, type Mission, type Progress } from "@vila/shared/game/progress";
import { applyEventIn, catalogFor, questStateIn } from "@vila/shared/game/quests-v2/catalog";
import { events } from "./events";
import { planWalk, sim } from "./sim";
import { cancelDraft } from "../lib/pix-draft";
import type { StoryGameId } from "./story-games";

export const LOCAL_ACCOUNT_ACTIONS = {
  donation: "abrir a página de pagamento da ONG",
  wardrobe: "equipar este item",
  mission: "concluir a missão",
  game: "começar o minijogo",
} as const;
export type LocalAction = keyof typeof LOCAL_ACCOUNT_ACTIONS;
type MissionClaim = { eventId: string; title: string; owner: string | null };

export type Panel =
  | { kind: "none" }
  | { kind: "donation" }
  | { kind: "pix-review"; id: string }
  | { kind: "lot"; lotId: string }
  | { kind: "explore" }
  | { kind: "invite" }
  | { kind: "avatar" }
  | { kind: "games" }
  | { kind: "map" }
  | { kind: "badges" }
  | { kind: "memory"; interactionId?: string; questId?: string; done?: string }
  | { kind: "story-game"; gameId: StoryGameId; interactionId?: string; questId?: string; done?: string }
  | { kind: "missions" }
  | { kind: "finale" }
  | { kind: "indicators" }
  | { kind: "environment" }
  | { kind: "account"; then?: Panel; reason?: LocalAction }
  | { kind: "ngo"; lotId?: string }
  | { kind: "npc"; npcId: string }
  // The expanded village (IMPL-0024, PROPOSTA): panels that say what is there today, no purchase and no claim.
  | { kind: "plot"; plotId: string }
  | { kind: "shop"; shopId: string }
  | { kind: "billboard"; billboardId: string }
  // A civic building, a park or a square (IMPL-0031, PROPOSTA): what it is, and that it is scenery.
  | { kind: "site"; siteId: string }
  // A character of the village (IMPL-0025, PROPOSTA): the fixed lines chosen when the dialogue opened.
  | { kind: "life"; charId: string; name: string; role: string; lines: string[] };

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
  | { kind: "npc"; npcId: string }
  | { kind: "quest"; interactionId: string }
  | { kind: "donation-panel" }
  | { kind: "plot"; plotId: string }
  | { kind: "shop"; shopId: string }
  | { kind: "billboard"; billboardId: string }
  | { kind: "site"; siteId: string }
  // A character of the village that stands near (IMPL-0025, PROPOSTA): offered only when nothing above is in reach.
  | { kind: "life"; charId: string }
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
    case "site":
      return b.kind === "site" && a.siteId === b.siteId;
    case "life":
      return b.kind === "life" && a.charId === b.charId;
    case "tree":
    case "donation-panel":
      return a.kind === b.kind;
  }
}

// v2: mission ids were renamed to English in 0.2.0; v1 progress is discarded. This key holds GUEST progress
// only: a signed-in account's progress lives on the server (and in memory), so on a shared browser the next
// person never inherits it (IMPL-0011).
const STORAGE_KEY = "vila.progress.v2";

export function loadGuestProgress(): Progress {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const { localReservation: _reservation, ...progress } = JSON.parse(raw);
      return { ...EMPTY_PROGRESS, ...progress };
    }
  } catch {
    /* storage unavailable: progress lives for this session only */
  }
  return EMPTY_PROGRESS;
}

/** Atomically detach the source before crediting a browser import. If interrupted, only its named owner can receive it. */
export function reserveLocalGuest(owner: string, receive: (id: string, progress: Progress) => void) {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  const stored = JSON.parse(raw) as Progress & { localReservation?: { owner: string; progress: Progress } };
  const { localReservation, ...current } = stored;
  if (localReservation) receive(localReservation.owner, localReservation.progress);
  if (Object.keys(current.seen ?? {}).length) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...EMPTY_PROGRESS, localReservation: { owner, progress: current } }));
    receive(owner, current);
  }
  if (localReservation || Object.keys(current.seen ?? {}).length) localStorage.removeItem(STORAGE_KEY);
}

function saveProgress(p: Progress) {
  try {
    let serialized = JSON.stringify(p);
    if (useVila.getState().localActor) {
      const saved = localStorage.getItem(STORAGE_KEY);
      const reservation = saved && JSON.parse(saved).localReservation;
      if (reservation) serialized = JSON.stringify({ ...p, localReservation: reservation });
    }
    localStorage.setItem(STORAGE_KEY, serialized);
  } catch {
    /* same as above */
  }
}

// Chosen avatar look (ten cosmetic slot ids, P08/IMPL-0027). Always re-checked against what progress unlocked.
const LOOK_KEY = "vila.look.v2";
const LOOK_KEY_V1 = "vila.look.v1";

/** The four old hats and three old sweaters map to the new craft; the scarf and palette slots have no P08 slot. */
const OLD_HATS: Record<string, string> = {
  "hat-santa": "helmet-santa",
  "hat-beanie": "helmet-beanie",
  "hat-earmuffs": "helmet-earmuffs",
  "hat-holly": "helmet-holly",
};
const OLD_SWEATERS: Record<string, string> = {
  "sweater-none": "blouse-plain",
  "sweater-snowflake": "blouse-snowflake",
  "sweater-stripes": "blouse-stripes",
};

function readLook(key: string): unknown {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

/** The v1 look, mapped to the two slots that survive; null when there is nothing to migrate. */
function migrateLook(raw: unknown): Partial<Look> | null {
  if (!raw || typeof raw !== "object") return null;
  const v = raw as Record<string, unknown>;
  const out: Partial<Look> = {};
  const hat = typeof v.hat === "string" ? OLD_HATS[v.hat] : undefined;
  const sweater = typeof v.sweater === "string" ? OLD_SWEATERS[v.sweater] : undefined;
  if (hat) out.helmet = hat;
  if (sweater) out.blouse = sweater;
  return Object.keys(out).length ? out : null;
}

function loadLookPreference(): Partial<Record<string, unknown>> | null {
  const current = readLook(LOOK_KEY);
  if (current) return current;
  const old = migrateLook(readLook(LOOK_KEY_V1));
  if (!old) return null;
  const look = { ...DEFAULT_LOOK, ...old };
  try {
    localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    localStorage.removeItem(LOOK_KEY_V1);
  } catch {
    /* storage unavailable: the migrated look lasts for this session */
  }
  return look;
}

// Chosen character appearance (P07, "não são dados da conta"): a visual preference of this browser only, never
// sent to the presence room. Always re-checked field by field.
const APPEARANCE_KEY = "vila.appearance.v1";

function loadAppearance(): Appearance {
  try {
    return sanitizeAppearance(JSON.parse(localStorage.getItem(APPEARANCE_KEY) ?? "null"));
  } catch {
    return { ...DEFAULT_APPEARANCE };
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
  /** Provided only by the opt-in local account rehearsal. Read the current session at each gesture. */
  localActor: (() => string | null) | null;
  requireLocalAccount: (reason: LocalAction) => boolean;
  missionClaims: Record<string, MissionClaim>;
  claimMission: (missionId: string) => void;
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
  /** The character's appearance (P07): local to this browser, used by the player's own avatar and portrait. */
  appearance: Appearance;
  setAppearance: (patch: Partial<Appearance>) => void;
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

const initialProgress = loadGuestProgress();
// The stored choice belongs to the browser. Only the look displayed for the current progress is filtered.
let preferredLook = loadLookPreference();

export const useVila = create<VilaState>((set, get) => ({
  localActor: null,
  missionClaims: {},
  requireLocalAccount: (reason) => {
    const actor = get().localActor;
    if (!actor) return true;
    const owner = actor();
    if (owner && get().progressOwner === owner) return true;
    if (owner) {
      get().notify("Aguarde o carregamento do progresso da sua conta e tente novamente.");
      return false;
    }
    set({ panel: { kind: "account", reason }, menu: null });
    return false;
  },
  claimMission: (missionId) => {
    const s = get();
    const claim = s.missionClaims[missionId];
    if (!claim || !s.localActor || !s.requireLocalAccount("mission")) return;
    if (!claim.owner || claim.owner !== s.localActor() || claim.owner !== s.progressOwner) return;
    // Nothing is replayed on login. A second click recomputes eligibility with today's progress and catalog.
    const { progress, completed } = nextEvent(s.progress, missionId, claim.eventId);
    const remaining = { ...s.missionClaims };
    delete remaining[missionId];
    set({ missionClaims: remaining });
    if (completed && progress !== s.progress) finishEvent(s.progress, progress, completed);
  },
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
  look: sanitizeLookIn(COSMETICS_V2, preferredLook, initialProgress),
  setLook: (patch) => {
    const look = sanitizeLookIn(COSMETICS_V2, { ...get().look, ...patch }, get().progress);
    preferredLook = look;
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(look));
    } catch {
      /* storage unavailable: the look lasts for this session */
    }
    set({ look });
  },
  appearance: loadAppearance(),
  setAppearance: (patch) => {
    const appearance = sanitizeAppearance({ ...get().appearance, ...patch });
    try {
      localStorage.setItem(APPEARANCE_KEY, JSON.stringify(appearance));
    } catch {
      /* storage unavailable: the appearance lasts for this session */
    }
    set({ appearance });
  },
  toast: null,
  skyView: false,
  setSkyView: (skyView) => set({ skyView }),
  // A panel is the layer on top: opening one (also from code, like a sign-in link) closes the menu.
  open: (panel) => {
    if (get().localActor && (panel.kind === "memory" || panel.kind === "story-game")) {
      if (!get().requireLocalAccount("game")) return;
      if (panel.questId && questStateIn(catalogFor(true, true), get().progress, panel.questId) !== "active") {
        get().notify("Esta missão já não está ativa na sua conta. Consulte o diário.");
        return;
      }
    }
    set({ panel, menu: null });
  },
  close: () => {
    const panel = get().panel;
    const review = panel.kind === "account" ? panel.then : panel;
    if (review?.kind === "pix-review") cancelDraft(review.id);
    set({ panel: { kind: "none" } });
  },
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
    let previous = get().progress;
    if (get().localActor && get().progressOwner === null) {
      // Another tab may already have reserved the guest's events. Never write an older snapshot back over it.
      const canonical = loadGuestProgress();
      if (Object.keys(previous.seen).length !== Object.keys(canonical.seen).length ||
          Object.keys(previous.seen).some(key => !canonical.seen[key])) {
        previous = canonical;
        set({ progress: previous, missionClaims: {} });
      }
    }
    const { progress, completed } = nextEvent(previous, missionId, eventId);
    if (progress === previous) return;
    const actor = get().localActor;
    if (completed && actor) {
      const owner = actor();
      if (eventId === "turn-in") {
        if (!get().requireLocalAccount("mission")) return;
      } else {
        // Proximity and panel visits may fire every frame. Exploration stays available and no XP is given here.
        const claims = get().missionClaims;
        if (claims[missionId]?.owner === owner && claims[missionId]?.eventId === eventId) return;
        set({ missionClaims: { ...claims, [missionId]: { eventId, title: completed.title, owner } } });
        get().notify("Seu último objetivo está pronto. Abra Missões para confirmar a conclusão.");
        return;
      }
    }
    finishEvent(previous, progress, completed);
    if (eventId !== "accept" && eventId !== "turn-in") {
      const catalog = catalogFor(true, true);
      const quest = catalog.quests.find((q) => q.id === missionId);
      if (
        quest &&
        questStateIn(catalog, progress, missionId) === "ready_to_turn_in" &&
        questStateIn(catalog, previous, missionId) !== "ready_to_turn_in"
      ) {
        get().notify(`Missão pronta para entregar: ${quest.title}`);
      }
    }
  },
  adoptProgress: (progress, owner) => set({
    progress, progressOwner: owner, look: sanitizeLookIn(COSMETICS_V2, preferredLook, progress),
    ...(get().progressOwner !== owner && { missionClaims: {} }),
  }),
  restoreGuest: () => {
    const p = loadGuestProgress();
    set({ progress: p, progressOwner: null, missionClaims: {}, look: sanitizeLookIn(COSMETICS_V2, preferredLook, p) });
  },
  clearGuest: () => saveProgress(EMPTY_PROGRESS),
  notify: (text) => set({ toast: { id: ++toastSeq, text } }),
  dismissToast: (id) => {
    if (get().toast?.id === id) set({ toast: null });
  },
}));

export function nextEvent(progress: Progress, missionId: string, eventId: string) {
  return applyEventIn(catalogFor(true, true), progress, missionId, eventId);
}

function finishEvent(previous: Progress, progress: Progress, completed?: Mission | null) {
  if (useVila.getState().progressOwner === null) saveProgress(progress);
  useVila.setState({ progress });
  if (!completed) return;
  const before = unlockedIdsIn(COSMETICS_V2, previous);
  const fresh = COSMETICS_V2.filter((c) => unlockedIdsIn(COSMETICS_V2, progress).has(c.id) && !before.has(c.id));
  const names = fresh.map((c) => c.name);
  const summary = names.length > 3 ? `${names.slice(0, 3).join(", ")} e mais ${names.length - 3}` : names.join(", ");
  useVila.getState().notify(missionDoneMessage(completed) + (fresh.length ? ` · Novo visual: ${summary}` : ""));
  events.emit({ type: "mission", missionId: completed.id });
}

const missionDoneMessage = (m: Mission) => `Missão concluída: ${m.title} · +${m.xp} XP`;
