/**
 * The controls of the game as the "Controles" view of the game menu lists them (IMPL-0022). Nothing is typed
 * here twice: the keyboard rows are the key map the key handler reads (`KEY_BINDINGS`, `lib/hud-keys.ts`), the
 * zoom rows are the gestures that carry their own listeners (`ZOOM_GESTURES`, `lib/zoom-gestures.ts`), and the
 * walk rows belong to `WALK`, whose `accepts` is the test the ground runs on every press (`scene/Ground.tsx`).
 * The hand-written entries are `OPEN` and `VISIT`: those clicks are `onClick` handlers on the 3D models
 * (`scene/Props.tsx`, `scene/Village.tsx`), and what each does is decided in `game/clicks.ts`.
 */
import { KEY_BINDINGS } from "./hud-keys";
import { ZOOM_GESTURES } from "./zoom-gestures";

export type Device = "keyboard" | "mouse" | "touch";

export interface ControlRow {
  /** Key caps, or one gesture in words. */
  input: readonly string[];
  does: string;
}

export interface ControlGroup {
  device: Device;
  /** Heading of the group (pt-BR). */
  label: string;
  rows: ControlRow[];
}

/** Walking: the press on the ground that sends the avatar there. Movement is click/tap only (IMPL-0016). */
export const WALK = {
  /** The main mouse button or the first finger; a second finger starts a pinch instead. */
  accepts: (press: { button: number; isPrimary: boolean }): boolean => press.button === 0 && press.isPrimary,
  does: "Andar até o ponto",
  input: { mouse: "Clique no chão", touch: "Toque no chão" },
} as const;

/** Clicking or tapping something of the square that opens a panel at once: the tree, the house of an NGO, a lot. */
export const OPEN = {
  does: "Abrir a doação global (árvore) ou o painel da casa de ONG ou do terreno",
  input: { mouse: "Clique na árvore, em uma casa de ONG ou em um terreno da praça", touch: "Toque na árvore, em uma casa de ONG ou em um terreno da praça" },
} as const;

/**
 * Clicking or tapping a place that is used from up close (IMPL-0024): a shop, a sign on a shop's roof, a house
 * of a residential street. From afar the avatar walks to it; from beside it the panel opens.
 */
export const VISIT = {
  does: "Ir até lá; de perto, abrir o painel da loja, da placa ou do terreno residencial",
  input: { mouse: "Clique em uma loja, em uma placa ou em uma casa residencial", touch: "Toque em uma loja, em uma placa ou em uma casa residencial" },
} as const;

const DEVICE_LABEL: Record<Device, string> = { keyboard: "Teclado", mouse: "Mouse", touch: "Toque" };

const pointerRows = (device: "mouse" | "touch"): ControlRow[] => [
  { input: [WALK.input[device]], does: WALK.does },
  { input: [OPEN.input[device]], does: OPEN.does },
  { input: [VISIT.input[device]], does: VISIT.does },
  ...ZOOM_GESTURES.filter((g) => g.device === device).map((g) => ({ input: [g.input], does: g.does })),
];

/** Every control, grouped by device, in the order shown. */
export function controls(): ControlGroup[] {
  return [
    { device: "keyboard", label: DEVICE_LABEL.keyboard, rows: KEY_BINDINGS.map((b) => ({ input: b.caps, does: b.does })) },
    { device: "mouse", label: DEVICE_LABEL.mouse, rows: pointerRows("mouse") },
    { device: "touch", label: DEVICE_LABEL.touch, rows: pointerRows("touch") },
  ];
}
