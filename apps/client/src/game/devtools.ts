/**
 * Localhost/dev-only automation hooks for scripts/verify.mjs (never exposed in production builds served
 * from a real hostname). Lets the browser test drive the avatar and read outcomes without pixel hunting.
 */
import { debugAllowed } from "../environment/runtime";
import { events, type GameEvent } from "./events";
import { remotes } from "../net/multiplayer";
import { sim } from "./sim";
import { useVila } from "./store";

export interface VilaDevtools {
  walkTo: (x: number, z: number) => void;
  pose: () => { x: number; z: number };
  progress: () => ReturnType<typeof useVila.getState>["progress"];
  /** Gameplay events seen since load (type only, newest last). */
  events: string[];
  extra: Record<string, () => unknown>;
}

declare global {
  interface Window {
    __vila?: VilaDevtools;
  }
}

export function installDevtools() {
  if (typeof window === "undefined" || !debugAllowed()) return;
  const log: string[] = [];
  events.on((e: GameEvent) => {
    if (e.type !== "step") log.push(e.type);
  });
  window.__vila = {
    walkTo: (x, z) => useVila.getState().setTarget({ x, z }),
    pose: () => ({ x: sim.pose.x, z: sim.pose.z }),
    progress: () => useVila.getState().progress,
    events: log,
    extra: { remotes: () => [...remotes.values()].map((r) => ({ id: r.id, x: r.x, z: r.z })) },
  };
}
