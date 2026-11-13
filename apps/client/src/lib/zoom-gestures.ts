/**
 * Camera zoom by pointer: the mouse wheel and the two-finger pinch on the canvas (movement is click/tap only).
 * Each gesture is one entry of `ZOOM_GESTURES` that carries both its listeners and the words the "Controles"
 * view of the game menu shows (`lib/controls.ts`): a gesture is listed exactly when it is wired (IMPL-0022).
 * There are no zoom buttons on the HUD: a phone zooms by pinch, a keyboard by + and - (`lib/hud-keys.ts`).
 * No DOM types and no three.js here, so the gestures are tested with plain `EventTarget`s.
 */

/** What the gestures act on (`Player` passes the store). */
export interface ZoomHost {
  /** Nothing is open over the village: the gesture may zoom. */
  idle(): boolean;
  /** Multiplies the camera distance by `factor` (smaller = closer). */
  zoomBy(factor: number): void;
  /** A second finger went down: the first one must not walk. */
  stopWalk(): void;
}

/** The part of the canvas and of `window` the gestures use. */
export interface Listenable {
  addEventListener(type: string, listener: (event: Event) => void, options?: { passive?: boolean }): void;
  removeEventListener(type: string, listener: (event: Event) => void): void;
}

export interface ZoomGesture {
  id: "wheel" | "pinch";
  device: "mouse" | "touch";
  /** The gesture, as the player reads it (pt-BR). */
  input: string;
  does: string;
  /** Wires the gesture; returns the function that unwires it. */
  attach(canvas: Listenable, page: Listenable, host: ZoomHost): () => void;
}

/** Mouse wheel sensitivity (zoom factor per pixel of wheel delta). */
export const WHEEL_ZOOM = 0.0015;

interface WheelLike {
  deltaY: number;
  preventDefault(): void;
}
interface PointerLike {
  pointerType: string;
  pointerId: number;
  clientX: number;
  clientY: number;
}

export const ZOOM_GESTURES: readonly ZoomGesture[] = [
  {
    id: "wheel",
    device: "mouse",
    input: "Roda do mouse",
    does: "Aproximar e afastar a câmera",
    attach(canvas, _page, host) {
      const wheel = (event: Event) => {
        const e = event as unknown as WheelLike;
        // The page never scrolls or zooms under the canvas, also while a panel is open over it.
        e.preventDefault();
        if (host.idle()) host.zoomBy(Math.exp(e.deltaY * WHEEL_ZOOM));
      };
      canvas.addEventListener("wheel", wheel, { passive: false });
      return () => canvas.removeEventListener("wheel", wheel);
    },
  },
  {
    id: "pinch",
    device: "touch",
    input: "Pinça com dois dedos",
    does: "Aproximar e afastar a câmera",
    attach(canvas, page, host) {
      const touches = new Map<number, { x: number; y: number }>();
      let span = 0;
      const spread = () => {
        const [a, b] = [...touches.values()];
        return Math.hypot(a.x - b.x, a.y - b.y);
      };
      const down = (event: Event) => {
        const e = event as unknown as PointerLike;
        if (e.pointerType !== "touch") return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size === 2) {
          span = spread();
          host.stopWalk();
        }
      };
      const move = (event: Event) => {
        const e = event as unknown as PointerLike;
        if (!touches.has(e.pointerId)) return;
        touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (touches.size !== 2 || span <= 0 || !host.idle()) return;
        const d = spread();
        if (d > 0) host.zoomBy(span / d);
        span = d;
      };
      const up = (event: Event) => {
        touches.delete((event as unknown as PointerLike).pointerId);
        span = 0;
      };
      canvas.addEventListener("pointerdown", down);
      page.addEventListener("pointermove", move);
      page.addEventListener("pointerup", up);
      page.addEventListener("pointercancel", up);
      return () => {
        canvas.removeEventListener("pointerdown", down);
        page.removeEventListener("pointermove", move);
        page.removeEventListener("pointerup", up);
        page.removeEventListener("pointercancel", up);
      };
    },
  },
];

/** Wires every zoom gesture; returns the function that unwires them all. */
export function attachZoomGestures(canvas: Listenable, page: Listenable, host: ZoomHost): () => void {
  const detach = ZOOM_GESTURES.map((gesture) => gesture.attach(canvas, page, host));
  return () => detach.forEach((off) => off());
}
