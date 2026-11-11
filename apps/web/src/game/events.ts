/**
 * Gameplay event bus: the simulation announces what happened; presentation systems (footprints, VFX,
 * audio) react. Keeps gameplay free of rendering/audio code and lets each effect be switched off alone.
 * Synchronous and allocation-light; listeners must not throw.
 */
import type { Surface } from "./world";

export type GameEvent =
  | { type: "step"; x: number; z: number; yaw: number; left: boolean; surface: Surface; speed: number }
  | { type: "gift"; x: number; z: number }
  | { type: "mission"; missionId: string };

type Listener = (e: GameEvent) => void;
const listeners = new Set<Listener>();

export const events = {
  emit(e: GameEvent) {
    for (const l of listeners) l(e);
  },
  /** Returns the unsubscribe function (fits `useEffect`). */
  on(l: Listener) {
    listeners.add(l);
    return () => void listeners.delete(l);
  },
};
