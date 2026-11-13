/**
 * The keys of the game. One table (`KEY_BINDINGS`) is read by the key handler (`hudKeyAction`, used by `Hud.tsx`)
 * and by the "Controles" view of the game menu (`lib/controls.ts`), so the list on screen is the list the keys
 * follow (IMPL-0022). Pure, so the rules are tested without a browser.
 *
 * E and Enter open what the avatar is next to (a house, the tree, a villager), whatever has the focus: the Vila
 * is played with the keyboard, and after "Explorar ONGs → Ir até lá" the focus is still on a HUD button. The one
 * exception is a moderation control (IMPL-0021: the mode switch and the buttons of the moderation block, all
 * marked `data-moderation`): Enter on one of them belongs to that button, so an administrator who answers a
 * confirmation with the keyboard next to a house acts on the button, not on the house.
 */
export type HudKeyAction = "zoom-in" | "zoom-out" | "activate" | "menu" | null;

export interface KeyBinding {
  action: Exclude<HudKeyAction, null>;
  /** `KeyboardEvent.key` values that trigger it. */
  keys: readonly string[];
  /** The key caps shown to the player. */
  caps: readonly string[];
  /** What it does, as the player reads it (pt-BR). */
  does: string;
}

export const KEY_BINDINGS: readonly KeyBinding[] = [
  { action: "activate", keys: ["e", "E", "Enter"], caps: ["E", "Enter"], does: "Abrir o que está perto: uma casa, um terreno, a árvore ou um morador" },
  { action: "zoom-in", keys: ["+", "="], caps: ["+", "="], does: "Aproximar a câmera" },
  { action: "zoom-out", keys: ["-"], caps: ["-"], does: "Afastar a câmera" },
  { action: "menu", keys: ["Escape"], caps: ["Esc"], does: "Abrir ou fechar o menu; com um painel aberto, fechar o painel" },
];

/** What `key` is bound to, before the rules about focus and what is near. */
export const boundAction = (key: string): HudKeyAction => KEY_BINDINGS.find((b) => b.keys.includes(key))?.action ?? null;

/** The part of a DOM element the rule needs (`Element.closest`). */
export interface KeyTarget {
  closest(selector: string): KeyTarget | null;
}

/** `target` is, or is inside, a button or link of a moderation block. */
export const onModerationControl = (target: KeyTarget | null): boolean => (target?.closest("button, a[href]")?.closest("[data-moderation]") ?? null) !== null;

/**
 * What a key does on the HUD while nothing is open over the village. `nearby`: the avatar is next to something
 * that can be opened. `target`: what had the focus when the key went down. "menu" (Escape) is only the binding:
 * what Escape closes or opens is decided by `escapeAction`.
 */
export function hudKeyAction(key: string, target: KeyTarget | null, nearby: boolean): HudKeyAction {
  const action = boundAction(key);
  if (action !== "activate") return action;
  if (!nearby) return null;
  return key === "Enter" && onModerationControl(target) ? null : "activate";
}

/** The part of a DOM element that tells whether the person is typing in it. */
export interface FieldLike {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
}

/** `<input>` types that take no text: a key pressed on them is not typing. */
const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "file", "range", "color", "image"]);

/** `target` is a field the person types or picks a value in: a key pressed there belongs to the field. */
export function isTextField(target: FieldLike | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toLowerCase();
  if (tag === "textarea" || tag === "select") return true;
  return tag === "input" && !NOT_TEXT.has((target.type ?? "text").toLowerCase());
}

/** What one press of Escape does. One press, one layer. */
export type EscapeAction = "cancel-confirmation" | "close-panel" | "menu-back" | "close-menu" | "open-menu" | null;

export interface EscapeLayers {
  /** A confirmation step is on screen (`Confirm`). */
  confirmation: boolean;
  /** A panel is open. */
  panel: boolean;
  /** The view of the game menu, or null when it is closed. */
  menu: string | null;
  /** The focus is in a text field. */
  typing: boolean;
  /** The key is held down (`KeyboardEvent.repeat`). */
  repeat?: boolean;
  /** An input method is composing (`KeyboardEvent.isComposing`): Escape belongs to it. */
  composing?: boolean;
}

/**
 * Order of precedence of Escape (IMPL-0022): an open confirmation is cancelled first, then an open panel is
 * closed, and only with neither does the key toggle the game menu (from one of its views it goes back to the
 * list first). It never opens the menu while the person types in a field, and a key held down counts once.
 */
export function escapeAction(layers: EscapeLayers): EscapeAction {
  if (layers.repeat || layers.composing) return null;
  if (layers.confirmation) return "cancel-confirmation";
  if (layers.panel) return "close-panel";
  if (layers.menu !== null) return layers.menu === "root" ? "close-menu" : "menu-back";
  return layers.typing ? null : "open-menu";
}
